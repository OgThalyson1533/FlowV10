// ============================================================
//  ProjectFlow V10 — supabase/functions/claude-proxy/index.ts
//  Proxy universal de IA: detecta automaticamente Anthropic
//  ou OpenAI pela chave configurada nos Secrets.
//
//  DEPLOY:
//    supabase functions deploy claude-proxy --no-verify-jwt
//
//  SECRETS (Supabase Dashboard → Edge Functions → Secrets):
//    Para Anthropic Claude:  ANTHROPIC_API_KEY = sk-ant-...
//    Para OpenAI GPT:        OPENAI_API_KEY    = sk-...
//
//  Apenas uma das chaves precisa estar configurada.
//  Se ambas existirem, Anthropic tem prioridade.
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const CORS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

serve(async (req: Request) => {
  // ── Preflight CORS ─────────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS });
  }

  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  // ── Lê body ────────────────────────────────────────────
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const { model, max_tokens, messages, system } = body;

  if (!messages) {
    return json({ error: "Campo obrigatório ausente: messages" }, 400);
  }

  // ── Detecta qual API usar ──────────────────────────────
  // Aceita chave via Secret (preferido) OU via header x-ai-key (configurado pelo usuário)
  const headerKey    = req.headers.get("x-ai-key") ?? "";
  const secretAnthro = Deno.env.get("ANTHROPIC_API_KEY") ?? "";
  const secretOpenAI = Deno.env.get("OPENAI_API_KEY")    ?? "";

  // Secret tem prioridade sobre header; header é fallback para demo/dev
  const anthropicKey = secretAnthro || (headerKey.startsWith("sk-ant") ? headerKey : "");
  const openaiKey    = secretOpenAI || (headerKey.startsWith("sk-") && !headerKey.startsWith("sk-ant") ? headerKey : "");

  if (!anthropicKey && !openaiKey) {
    return json({
      error: "Nenhuma API key configurada.",
      hint:  "Opção 1 (recomendado): Supabase Dashboard → Edge Functions → claude-proxy → Secrets → ANTHROPIC_API_KEY ou OPENAI_API_KEY. Opção 2: Configure no painel ⚙️ do ProjectFlow (campo 'API Key da IA')."
    }, 500);
  }

  // ── Rota para Anthropic ────────────────────────────────
  if (anthropicKey) {
    const claudeModel = (typeof model === "string" && model.startsWith("claude"))
      ? model
      : "claude-sonnet-4-20250514";   // modelo padrão Anthropic

    const anthropicBody: Record<string, unknown> = {
      model:      claudeModel,
      max_tokens: max_tokens ?? 2000,
      messages,
    };
    if (system) anthropicBody.system = system;

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type":      "application/json",
          "x-api-key":         anthropicKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify(anthropicBody),
      });

      const data = await res.json();
      return new Response(JSON.stringify(data), {
        status:  res.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });

    } catch (err) {
      return json({ error: "Erro ao chamar Anthropic: " + String(err) }, 502);
    }
  }

  // ── Rota para OpenAI ───────────────────────────────────
  if (openaiKey) {
    const gptModel = (typeof model === "string" && model.startsWith("gpt"))
      ? model
      : "gpt-4o";   // modelo padrão OpenAI

    // Converte formato Anthropic (system separado) → formato OpenAI
    const oaiMessages: Array<{ role: string; content: string }> = [];
    if (system) {
      oaiMessages.push({ role: "system", content: String(system) });
    }
    if (Array.isArray(messages)) {
      for (const m of messages as Array<{ role: string; content: string }>) {
        oaiMessages.push({ role: m.role, content: m.content });
      }
    }

    try {
      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type":  "application/json",
          "Authorization": "Bearer " + openaiKey,
        },
        body: JSON.stringify({
          model:      gptModel,
          max_tokens: max_tokens ?? 2000,
          messages:   oaiMessages,
        }),
      });

      const data = await res.json();

      // Normaliza resposta OpenAI → formato Anthropic (que o front-end espera)
      // O ai-doc-engine.js lê: data.content[0].text
      if (data.choices?.[0]?.message?.content) {
        const normalized = {
          id:      data.id,
          type:    "message",
          role:    "assistant",
          content: [{ type: "text", text: data.choices[0].message.content }],
          model:   gptModel,
          usage:   data.usage,
        };
        return new Response(JSON.stringify(normalized), {
          status:  res.status,
          headers: { ...CORS, "Content-Type": "application/json" },
        });
      }

      return new Response(JSON.stringify(data), {
        status:  res.status,
        headers: { ...CORS, "Content-Type": "application/json" },
      });

    } catch (err) {
      return json({ error: "Erro ao chamar OpenAI: " + String(err) }, 502);
    }
  }

  return json({ error: "Nenhuma API configurada" }, 500);
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}
