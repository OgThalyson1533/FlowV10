// ============================================================
//  ProjectFlow V7 — supabase/functions/claude-proxy/index.ts
//  Edge Function: proxy para API Anthropic (resolve CORS)
//
//  Deploy:
//    supabase functions deploy claude-proxy --no-verify-jwt
//
//  Variável de ambiente necessária no Supabase Dashboard:
//    Settings > Edge Functions > Secrets
//    ANTHROPIC_API_KEY = sk-ant-...
// ============================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

// CORS headers — permite chamadas do browser
const CORS_HEADERS = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey, x-client-info",
};

serve(async (req: Request) => {
  // Preflight OPTIONS
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
  if (!apiKey) {
    return new Response(
      JSON.stringify({ error: "ANTHROPIC_API_KEY not configured. Add it in Supabase Dashboard > Edge Functions > Secrets." }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Valida campos obrigatórios
  const { model, max_tokens, messages, system } = body as Record<string, unknown>;
  if (!model || !max_tokens || !messages) {
    return new Response(JSON.stringify({ error: "Missing required fields: model, max_tokens, messages" }), {
      status: 400,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  }

  // Encaminha para Anthropic
  const anthropicRes = await fetch(ANTHROPIC_API_URL, {
    method: "POST",
    headers: {
      "Content-Type":      "application/json",
      "x-api-key":         apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
    },
    body: JSON.stringify({ model, max_tokens, messages, system }),
  });

  const data = await anthropicRes.json();

  return new Response(JSON.stringify(data), {
    status: anthropicRes.status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
});
