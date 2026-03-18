# ProjectFlow V10

## Fixes Críticos desta Versão

### 1. Diagrama (Fabric.js) — `js/diagrama.js`
- **Substitui** `diagram-engine-v9.js` e `diagram-engine.js`
- Canvas Fabric.js 5.3.1 (via CDN)
- Ferramentas: Selecionar, Pan, Retângulo, Elipse, Losango, Banco de Dados, Serviço, Nota, Início/Fim, Texto, Seta com cabeça
- Drag & drop da paleta lateral
- Undo/Redo com 80 estados
- **Persistência real**: `canvas.toJSON()` → `upsert` em `project_diagrams.fabric_json`
- **Carregamento real**: `canvas.loadFromJSON()` restaurando zoom + pan
- Autosave com debounce de 1.5s

### 2. Anexos — `window.uploadAnexo` (em `js/diagrama.js`)
- Upload para bucket `anexos_tarefas` no Supabase Storage
- Path: `{task_id}/{uuid}/{filename_sanitizado}`
- Signed URL (1 ano) gravada em `task_attachments.public_url`
- `window.listarAnexos(taskId)` e `window.removerAnexo(id, path)`
- Fallback localStorage quando Supabase não disponível (modo demo)

### 3. Automação pg_cron — `sql/supabase_schema_v10.sql`
- Tabela `configuracao_recorrencia` com frequência: daily/weekly/monthly/custom_days
- Função `processar_tarefas_recorrentes()` cria tarefas na coluna "Planejado"
- Job `cron.schedule` rodando às 03:05 UTC todo dia

### 4. Storage Bucket — `sql/supabase_schema_v10.sql`
- `INSERT INTO storage.buckets` com 50 MB limit e lista de MIME types
- RLS: INSERT/SELECT para autenticados, DELETE somente para owner

### 5. Wiki IA — `window.WikiAI` (em `js/diagrama.js`)
- Proxy via Edge Function `claude-proxy` (sem expor API key no front-end)
- Timeout 45s + AbortController
- Markdown → HTML

---

## Instalação

### 1. Supabase
```
SQL Editor → Cole sql/supabase_schema_v10.sql → Run All
```
Ative `pg_cron` em: Database > Extensions > pg_cron

### 2. Edge Function
```bash
supabase functions deploy claude-proxy --no-verify-jwt
```
Configure `ANTHROPIC_API_KEY` em: Dashboard > Edge Functions > Secrets

### 3. Configuração no App
Clique no ⚙️ na tela de login e preencha:
- Supabase Project URL
- Anon / Public Key

---

## Estrutura de Arquivos

```
projectflow-v10/
├── index.html                          ← App shell (atualizado)
├── css/
│   ├── tokens.css                      ← Variáveis de design
│   ├── app.css                         ← Layout principal
│   ├── login.css                       ← Tela de autenticação
│   ├── docs.css                        ← Documentação
│   ├── project-docs.css                ← Project docs
│   ├── v4-styles.css                   ← Estilos v4+
│   └── v7-styles.css                   ← Estilos v7+
├── js/
│   ├── diagrama.js                     ← ✅ NOVO: Fabric.js + Anexos + WikiAI
│   ├── auth.js                         ← Autenticação Supabase
│   ├── board.js                        ← Kanban engine
│   ├── core.js                         ← Funções core
│   ├── main.js                         ← Inicialização
│   ├── pf-producao.js                  ← Integração Supabase produção
│   ├── pf-v9-core.js                   ← Upgrades v9
│   ├── pf-modal.js                     ← Sistema de modais
│   ├── ai-doc-engine.js                ← Motor de Doc IA (4 chains)
│   ├── knowledge-base.js               ← Wiki/Knowledge base
│   ├── docs.js                         ← Banco de documentação
│   ├── project-docs.js                 ← Docs por projeto
│   ├── v4-modules.js                   ← Módulos legados
│   └── unified-canvas.js               ← Canvas unificado
├── sql/
│   └── supabase_schema_v10.sql         ← ✅ NOVO: Schema completo + cron + bucket
└── supabase/
    └── functions/
        └── claude-proxy/
            └── index.ts                ← Edge Function proxy Anthropic
```
