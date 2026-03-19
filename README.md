# ProjectFlow V10 — GitHub Pages Setup

## 🚀 Publicar no GitHub Pages

### Passo 1 — Criar repositório

```bash
git init
git add .
git commit -m "ProjectFlow V10 — Excalidraw edition"
git remote add origin https://github.com/SEU_USUARIO/projectflow.git
git push -u origin main
```

### Passo 2 — Ativar GitHub Pages

1. Vá em **Settings** → **Pages**
2. Em **Source**, selecione: `Deploy from a branch`
3. Branch: `main` / Folder: `/ (root)`
4. Clique **Save**

Após ~1 minuto seu site estará em:
`https://SEU_USUARIO.github.io/projectflow/`

### Passo 3 — Configurar Supabase

Ao abrir o app, clique no ⚙️ na tela de login:
- **URL**: `https://xxxx.supabase.co`
- **Anon Key**: `eyJhbGci...`

---

## ⚠️ Atenção: Módulo de Diagramas

O diagrama usa **Excalidraw real** via iframe + ESM CDN (`esm.sh`).

- ✅ **GitHub Pages**: funciona perfeitamente (HTTPS + mesmo domínio)
- ✅ **Netlify / Vercel**: funciona
- ⚠️ **Localmente via `file://`**: o iframe pode ser bloqueado pelo browser

### Teste local correto:
```bash
# Opção A — Node.js
npx serve .

# Opção B — Python
python3 -m http.server 8080

# Opção C — VS Code
# Instale a extensão "Live Server" e clique em "Go Live"
```

Acesse: `http://localhost:8080`

---

## 📁 Estrutura de arquivos

```
projectflow/
├── index.html          ← App principal
├── diagram.html        ← Excalidraw standalone (carregado em iframe)
├── 404.html            ← Redirect para GitHub Pages SPA
├── css/
│   ├── tokens.css      ← Design tokens / variáveis
│   ├── app.css         ← Layout principal
│   ├── login.css       ← Tela de login
│   └── ...
├── js/
│   ├── core.js         ← Estado global e dados mock
│   ├── auth.js         ← Autenticação Supabase
│   ├── board.js        ← Kanban engine
│   ├── app.js          ← Lógica principal (sem conflitos)
│   ├── diagram-engine-v9.js  ← Wrapper do Excalidraw
│   ├── diagrama.js     ← Upload de anexos + WikiAI
│   └── ...
└── sql/
    └── supabase_schema_v10.sql  ← Execute no Supabase SQL Editor
```

---

## 🔧 Supabase — Primeira configuração

1. Crie um projeto em [supabase.com](https://supabase.com) (gratuito)
2. Vá em **SQL Editor** → cole o conteúdo de `sql/supabase_schema_v10.sql` → **Run**
3. Ative `pg_cron` em: **Database → Extensions**
4. Deploy da Edge Function (IA):
   ```bash
   supabase functions deploy claude-proxy --no-verify-jwt
   ```
5. Configure a API key da IA em: **Edge Functions → Secrets → OPENAI_API_KEY**

---

## 💡 Dicas

- **Supabase pausado?** Projetos gratuitos pausam após 7 dias sem uso. Acesse o dashboard e clique em **Restore**.
- **Diagrama não carrega?** Na primeira visita, o Excalidraw baixa ~2MB de bibliotecas do CDN. Aguarde alguns segundos.
- **Dark mode**: o toggle ☀️/🌙 na toolbar sincroniza automaticamente com o diagrama.
