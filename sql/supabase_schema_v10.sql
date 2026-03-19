-- ============================================================
--  ProjectFlow V10 — SCHEMA DE PRODUÇÃO (AUDITADO)
--  Bugs corrigidos nesta versão:
--  ✅ task_attachments: storage_path/public_url com NOT NULL DEFAULT ''
--  ✅ project_diagrams: coluna content_json (nome usado pelo engine)
--  ✅ tasks: colunas checklist, request_date, requester, area, key_people
--  ✅ handle_new_project: insere em content_json (não fabric_json)
--  ✅ ALTER TABLE idempotentes com DEFAULT para não quebrar bancos existentes
--
--  COMO EXECUTAR:
--  1. Supabase Dashboard → SQL Editor → cole tudo → Run All
--  2. pg_cron: Database → Extensions → pesquise "pg_cron" → Enable
--  Resultado esperado ao final: ✅ ProjectFlow v10 instalado com sucesso!
-- ============================================================

-- ══════════════════════════════════════════════════════════════
--  BLOCO 1 — EXTENSÕES
-- ══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_cron";

-- ══════════════════════════════════════════════════════════════
--  BLOCO 2 — ENUMs (idempotentes via DO $$)
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN
  CREATE TYPE task_status AS ENUM (
    'esbocar','viabilizar','atribuir','executar',
    'avaliar','corrigir','validar_cliente','concluido'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kanban_col AS ENUM ('todo','plan','exec','rev','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE priority_level AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE member_role AS ENUM ('owner','admin','member','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE lead_status AS ENUM (
    'new','contacted','qualified','proposal','negotiation','won','lost','stalled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE interaction_type AS ENUM (
    'call','email','meeting','video','demo','proposal','note'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE kb_block_type AS ENUM (
    'heading1','heading2','heading3','paragraph','callout','toggle',
    'divider','embed_task','database_view','table'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 3 — TABELAS
-- ══════════════════════════════════════════════════════════════

-- ── profiles ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL DEFAULT '',
  initials     VARCHAR(3) GENERATED ALWAYS AS (
    UPPER(
      LEFT(TRIM(full_name),1)
      || COALESCE(SUBSTRING(TRIM(full_name) FROM '\s+(\S)'),'')
    )
  ) STORED,
  avatar_color VARCHAR(7) DEFAULT '#e07050',
  avatar_url   TEXT,
  role         member_role DEFAULT 'member',
  timezone     TEXT DEFAULT 'America/Sao_Paulo',
  preferences  JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ── clients ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.clients (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  color_bg   VARCHAR(7) NOT NULL DEFAULT '#f5f5f2',
  color_text VARCHAR(7) NOT NULL DEFAULT '#5c5c58',
  contact    TEXT,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── workspaces ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.workspaces (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name       TEXT NOT NULL CHECK (length(trim(name)) >= 2),
  slug       TEXT UNIQUE,
  owner_id   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  plan       TEXT DEFAULT 'free',
  color      TEXT DEFAULT '#e07050',
  settings   JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.workspace_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id)    ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member'
               CHECK (role IN ('owner','admin','member','viewer')),
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

-- ── projects ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  owner_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id    UUID REFERENCES public.clients(id)  ON DELETE SET NULL,
  client_name  TEXT,
  color        TEXT DEFAULT '#e07050',
  wip_limit    INT  DEFAULT 15 CHECK (wip_limit > 0),
  budget       NUMERIC(12,2) CHECK (budget >= 0),
  start_date   DATE,
  end_date     DATE,
  status       TEXT DEFAULT 'active'
               CHECK (status IN ('active','paused','completed','archived')),
  objective    TEXT,
  requester    TEXT,
  tech_stack   TEXT[]  DEFAULT '{}',
  is_legacy    BOOLEAN NOT NULL DEFAULT FALSE,
  metadata     JSONB   DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.project_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  role       member_role DEFAULT 'member',
  joined_at  TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

-- ── kanban ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.swimlanes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INT  DEFAULT 0,
  wip_limit  INT  DEFAULT 10 CHECK (wip_limit > 0),
  color      VARCHAR(7) DEFAULT '#9a9a94',
  collapsed  BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kanban_boards (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL DEFAULT 'Board Principal',
  is_default BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.kanban_columns (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  board_id     UUID NOT NULL REFERENCES public.kanban_boards(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  position     INT  NOT NULL DEFAULT 0,
  wip_limit    INT  CHECK (wip_limit IS NULL OR wip_limit > 0),
  color        VARCHAR(7) DEFAULT '#6B7280',
  is_done_col  BOOLEAN DEFAULT FALSE,
  is_locked    BOOLEAN DEFAULT FALSE,
  bpmn_mapping TEXT[]  DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_col_position
  ON public.kanban_columns(board_id, position);

-- ── tasks (CORRIGIDA: checklist + campos v9 + ALTER idempotente) ──
CREATE TABLE IF NOT EXISTS public.tasks (
  id                  UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID         REFERENCES public.projects(id)        ON DELETE CASCADE,
  swimlane_id         UUID         REFERENCES public.swimlanes(id)        ON DELETE SET NULL,
  board_id            UUID         REFERENCES public.kanban_boards(id)    ON DELETE SET NULL,
  column_id           UUID         REFERENCES public.kanban_columns(id)   ON DELETE SET NULL,
  client_id           UUID         REFERENCES public.clients(id)          ON DELETE SET NULL,
  assigned_to         UUID         REFERENCES public.profiles(id)         ON DELETE SET NULL,
  created_by          UUID         REFERENCES public.profiles(id),
  title               TEXT         NOT NULL CHECK (length(title) >= 3),
  description         TEXT,
  bpmn_status         task_status  NOT NULL DEFAULT 'esbocar',
  kanban_col          kanban_col   NOT NULL DEFAULT 'todo',
  position            INT          DEFAULT 0,
  priority            priority_level DEFAULT 'medium',
  estimated_hours     NUMERIC(6,2),
  actual_hours        NUMERIC(6,2),
  budget              NUMERIC(10,2),
  start_date          DATE,
  due_date            DATE,
  completed_at        TIMESTAMPTZ,
  tags                TEXT[]   DEFAULT '{}',
  is_blocked          BOOLEAN  DEFAULT FALSE,
  blocked_reason      TEXT,
  is_recurring        BOOLEAN  DEFAULT FALSE,
  recurrence_rule     JSONB,
  -- ✅ checklist: usado pelo PFChecklist (pf-v9-core / app.js)
  checklist           JSONB    DEFAULT '[]',
  custom_fields       JSONB    DEFAULT '{}',
  doc_decision        TEXT,
  doc_artifact        TEXT,
  doc_risk            TEXT,
  doc_next_action     TEXT,
  doc_notes           TEXT,
  acceptance_criteria TEXT,
  -- ✅ campos v9: solicitação (usados em refreshEditFields)
  request_date        DATE,
  requester           TEXT,
  area                TEXT,
  key_people          TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- Garante colunas em bancos existentes (idempotente)
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS checklist     JSONB DEFAULT '[]';
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS request_date  DATE;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS requester     TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS area          TEXT;
ALTER TABLE public.tasks ADD COLUMN IF NOT EXISTS key_people    TEXT;

CREATE TABLE IF NOT EXISTS public.subtasks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  BOOLEAN DEFAULT FALSE,
  position   INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── task_attachments (CORRIGIDA: NOT NULL DEFAULT '' — sem contradição) ──
-- BUG ORIGINAL: NOT NULL na CREATE TABLE mas ALTER sem DEFAULT causava falha
-- em bancos pré-existentes. Solução: DEFAULT '' satisfaz NOT NULL em todos os casos.
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id           UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID   NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_name    TEXT   NOT NULL,
  file_size    BIGINT,
  mime_type    TEXT,
  storage_path TEXT   NOT NULL DEFAULT '',  -- ✅ DEFAULT '' evita falha em INSERT antigo
  public_url   TEXT   NOT NULL DEFAULT '',  -- ✅ DEFAULT '' evita falha em INSERT antigo
  uploaded_by  UUID   REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
-- Garante colunas em bancos existentes sem quebrar registros legados
ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS storage_path TEXT NOT NULL DEFAULT '';
ALTER TABLE public.task_attachments
  ADD COLUMN IF NOT EXISTS public_url   TEXT NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES public.profiles(id),
  content    TEXT NOT NULL CHECK (length(content) >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_history (
  id          UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID        REFERENCES public.tasks(id) ON DELETE CASCADE,
  changed_by  UUID        REFERENCES public.profiles(id),
  change_type TEXT        DEFAULT 'field_change',
  from_status task_status,
  to_status   task_status,
  from_col    kanban_col,
  to_col      kanban_col,
  field_name  TEXT,
  old_value   TEXT,
  new_value   TEXT,
  snapshot    JSONB,
  changed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ── CRM ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id          UUID         PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT         NOT NULL,
  position    INT          DEFAULT 0,
  probability NUMERIC(5,2) DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  color       VARCHAR(7)   DEFAULT '#9a9a94',
  is_won      BOOLEAN DEFAULT FALSE,
  is_lost     BOOLEAN DEFAULT FALSE,
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ  DEFAULT NOW(),
  CONSTRAINT only_one_win_loss CHECK (NOT (is_won AND is_lost))
);

CREATE TABLE IF NOT EXISTS public.leads (
  id               UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        UUID        REFERENCES public.clients(id)         ON DELETE SET NULL,
  owner_id         UUID        REFERENCES public.profiles(id)        ON DELETE SET NULL,
  stage_id         UUID        REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  project_id       UUID        REFERENCES public.projects(id)        ON DELETE SET NULL,
  title            TEXT        NOT NULL CHECK (length(title) >= 2),
  contact_name     TEXT,
  contact_email    TEXT,
  company_name     TEXT,
  source           TEXT,
  status           lead_status DEFAULT 'new',
  value            NUMERIC(14,2),
  probability      NUMERIC(5,2) DEFAULT 0,
  weighted_value   NUMERIC(14,2) GENERATED ALWAYS AS
                   (COALESCE(value,0)*COALESCE(probability,0)/100) STORED,
  expected_close   DATE,
  actual_close     DATE,
  last_interaction TIMESTAMPTZ,
  tags             TEXT[]  DEFAULT '{}',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_interactions (
  id               UUID             PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id          UUID             REFERENCES public.leads(id)    ON DELETE CASCADE,
  author_id        UUID             REFERENCES public.profiles(id) ON DELETE SET NULL,
  type             interaction_type NOT NULL,
  summary          TEXT             NOT NULL,
  next_action      TEXT,
  next_action_date DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── project_diagrams (CORRIGIDA: content_json — nome correto) ──
-- BUG ORIGINAL: coluna era fabric_json mas diagram-engine-v9.js
-- sempre salvou e leu em content_json. Unificado para content_json.
CREATE TABLE IF NOT EXISTS public.project_diagrams (
  id             UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID    NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id        UUID    REFERENCES public.tasks(id) ON DELETE SET NULL,
  name           TEXT    NOT NULL DEFAULT 'Diagrama Principal',
  version        INT     NOT NULL DEFAULT 1,
  is_current     BOOLEAN DEFAULT TRUE,
  diagram_type   TEXT    DEFAULT 'free_draw',
  -- ✅ content_json: nome canônico usado pelo diagram-engine-v9.js
  content_json   JSONB   DEFAULT '{}',
  canvas_config  JSONB   DEFAULT '{"zoom":1,"pan_x":0,"pan_y":0}',
  thumbnail_url  TEXT,
  generated_from TEXT,
  created_by     UUID    REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
-- Garante em bancos existentes
ALTER TABLE public.project_diagrams ADD COLUMN IF NOT EXISTS content_json   JSONB DEFAULT '{}';
ALTER TABLE public.project_diagrams ADD COLUMN IF NOT EXISTS task_id        UUID  REFERENCES public.tasks(id) ON DELETE SET NULL;
ALTER TABLE public.project_diagrams ADD COLUMN IF NOT EXISTS thumbnail_url  TEXT;
ALTER TABLE public.project_diagrams ADD COLUMN IF NOT EXISTS updated_at     TIMESTAMPTZ DEFAULT NOW();
-- Migra dados de fabric_json → content_json se fabric_json existir (bancos legados)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema = 'public'
    AND    table_name   = 'project_diagrams'
    AND    column_name  = 'fabric_json'
  ) THEN
    UPDATE public.project_diagrams
    SET    content_json = fabric_json
    WHERE  (content_json IS NULL OR content_json = '{}')
    AND    fabric_json  IS NOT NULL
    AND    fabric_json  != '{}';
  END IF;
END $$;

-- ── Documentos ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.exec_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version      INT  NOT NULL DEFAULT 1,
  title        TEXT NOT NULL,
  content_html TEXT,
  content_json JSONB,
  snapshot     JSONB,
  generated_by UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_doc_snapshots (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version      INT  NOT NULL DEFAULT 1,
  created_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  context_json JSONB NOT NULL DEFAULT '{}',
  chain_a_json JSONB NOT NULL DEFAULT '{}',
  chain_b_json JSONB NOT NULL DEFAULT '{}',
  chain_c_json JSONB NOT NULL DEFAULT '{}',
  chain_d_json JSONB NOT NULL DEFAULT '{}',
  status       TEXT DEFAULT 'completed',
  error_msg    TEXT,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.knowledge_blocks (
  id         UUID         PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID         NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id  UUID         REFERENCES public.knowledge_blocks(id)  ON DELETE CASCADE,
  type       kb_block_type NOT NULL DEFAULT 'paragraph',
  position   INT          NOT NULL DEFAULT 0,
  content    TEXT,
  icon       TEXT,
  is_open    BOOLEAN DEFAULT TRUE,
  task_id    UUID    REFERENCES public.tasks(id)  ON DELETE SET NULL,
  table_data JSONB   DEFAULT '{"headers":[],"rows":[]}',
  created_by UUID    REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── Recorrências ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.configuracao_recorrencia (
  id                 UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id         UUID          NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  board_id           UUID          REFERENCES public.kanban_boards(id)  ON DELETE SET NULL,
  column_id          UUID          REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  title              TEXT          NOT NULL,
  description        TEXT,
  priority           priority_level DEFAULT 'medium',
  estimated_hours    NUMERIC(6,2),
  assigned_to        UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  tags               TEXT[]        DEFAULT '{}',
  frequencia         TEXT          NOT NULL DEFAULT 'weekly'
                     CHECK (frequencia IN ('daily','weekly','monthly','custom_days')),
  dia_semana         INT           CHECK (dia_semana BETWEEN 0 AND 6),
  dia_mes            INT           CHECK (dia_mes BETWEEN 1 AND 28),
  intervalo_dias     INT           CHECK (intervalo_dias > 0),
  proxima_ocorrencia TIMESTAMPTZ   NOT NULL,
  ultima_execucao    TIMESTAMPTZ,
  is_active          BOOLEAN       DEFAULT TRUE,
  created_by         UUID          REFERENCES auth.users(id),
  created_at         TIMESTAMPTZ   DEFAULT NOW(),
  updated_at         TIMESTAMPTZ   DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
--  BLOCO 4 — FUNÇÕES HELPER
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = p_project_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.projects WHERE id = p_project_id AND owner_id = auth.uid()
  ) OR EXISTS (
    SELECT 1 FROM public.project_members
    WHERE project_id = p_project_id
    AND   user_id    = auth.uid()
    AND   role IN ('owner','admin','member')
  );
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 5 — pg_cron: processar tarefas recorrentes
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.processar_tarefas_recorrentes()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  rec          RECORD;
  nova_task_id UUID;
  prox         TIMESTAMPTZ;
  v_board_id   UUID;
  v_column_id  UUID;
BEGIN
  FOR rec IN
    SELECT cr.*
    FROM   public.configuracao_recorrencia cr
    WHERE  cr.is_active = TRUE
    AND    cr.proxima_ocorrencia <= NOW()
    ORDER  BY cr.proxima_ocorrencia ASC
  LOOP
    BEGIN
      -- Resolve board_id
      IF rec.board_id IS NOT NULL THEN
        v_board_id := rec.board_id;
      ELSE
        SELECT id INTO v_board_id
        FROM   public.kanban_boards
        WHERE  project_id = rec.project_id AND is_default = TRUE
        LIMIT  1;
      END IF;

      -- Resolve column_id (posição 1 = Planejado)
      IF rec.column_id IS NOT NULL THEN
        v_column_id := rec.column_id;
      ELSE
        SELECT id INTO v_column_id
        FROM   public.kanban_columns
        WHERE  board_id = v_board_id AND position = 1
        LIMIT  1;
      END IF;

      INSERT INTO public.tasks (
        project_id, board_id, column_id, assigned_to, created_by,
        title, description, bpmn_status, priority, estimated_hours,
        tags, is_recurring, recurrence_rule, position
      ) VALUES (
        rec.project_id, v_board_id, v_column_id,
        rec.assigned_to, rec.created_by,
        rec.title || ' — ' || TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo','DD/MM/YYYY'),
        rec.description,
        'esbocar', rec.priority, rec.estimated_hours, rec.tags,
        TRUE,
        jsonb_build_object(
          'config_id',  rec.id,
          'frequencia', rec.frequencia,
          'gerado_em',  NOW()::TEXT
        ),
        COALESCE(
          (SELECT MAX(position)+1 FROM public.tasks WHERE column_id = v_column_id),
          0
        )
      ) RETURNING id INTO nova_task_id;

      prox := CASE rec.frequencia
        WHEN 'daily'       THEN rec.proxima_ocorrencia + INTERVAL '1 day'
        WHEN 'weekly'      THEN rec.proxima_ocorrencia + INTERVAL '7 days'
        WHEN 'monthly'     THEN rec.proxima_ocorrencia + INTERVAL '1 month'
        WHEN 'custom_days' THEN rec.proxima_ocorrencia + (rec.intervalo_dias * INTERVAL '1 day')
        ELSE                    rec.proxima_ocorrencia + INTERVAL '7 days'
      END;

      UPDATE public.configuracao_recorrencia
      SET    proxima_ocorrencia = prox,
             ultima_execucao    = NOW(),
             updated_at         = NOW()
      WHERE  id = rec.id;

      RAISE NOTICE '[cron] Tarefa criada: % | próxima: %', nova_task_id, prox;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[cron] ERRO config_id=%: %', rec.id, SQLERRM;
    END;
  END LOOP;
END; $$;

-- Remove job anterior (evita duplicata) e reagenda
DO $$ BEGIN
  PERFORM cron.unschedule('processar_tarefas_recorrentes');
EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'processar_tarefas_recorrentes',
  '5 3 * * *',   -- 03:05 UTC = 00:05 BRT
  $job$ SELECT public.processar_tarefas_recorrentes(); $job$
);

-- ══════════════════════════════════════════════════════════════
--  BLOCO 6 — STORAGE: bucket anexos_tarefas (50 MB, privado)
-- ══════════════════════════════════════════════════════════════
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anexos_tarefas', 'anexos_tarefas', FALSE,
  52428800,
  ARRAY[
    'image/jpeg','image/png','image/gif','image/webp','image/svg+xml',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain','text/csv',
    'application/zip','application/x-zip-compressed',
    'video/mp4','audio/mpeg'
  ]
) ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS "storage_anexos_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_anexos_select" ON storage.objects;
DROP POLICY IF EXISTS "storage_anexos_delete" ON storage.objects;

CREATE POLICY "storage_anexos_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anexos_tarefas');

CREATE POLICY "storage_anexos_select" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'anexos_tarefas');

CREATE POLICY "storage_anexos_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'anexos_tarefas' AND owner = auth.uid());

-- ══════════════════════════════════════════════════════════════
--  BLOCO 7 — TRIGGERS
-- ══════════════════════════════════════════════════════════════

-- Novo usuário → profile + workspace automático
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name   TEXT;
  v_ws_id  UUID;
  v_colors TEXT[] := ARRAY['#e07050','#6c5ce7','#3b6cdb','#1a9e5f','#c48a0a','#0097a7'];
BEGIN
  v_name := COALESCE(
    NEW.raw_user_meta_data->>'full_name',
    SPLIT_PART(NEW.email,'@',1)
  );

  INSERT INTO public.profiles (id, full_name, avatar_color)
  VALUES (NEW.id, v_name, v_colors[FLOOR(RANDOM()*6)+1])
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.workspaces (name, owner_id)
  VALUES (v_name || '''s Workspace', NEW.id)
  RETURNING id INTO v_ws_id;

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_ws_id, NEW.id, 'owner')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Novo projeto → board + 6 colunas + diagrama vazio
-- ✅ CORRIGIDO: INSERT usa content_json (não fabric_json)
CREATE OR REPLACE FUNCTION public.handle_new_project()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_board_id UUID;
BEGIN
  IF NEW.owner_id IS NOT NULL THEN
    INSERT INTO public.project_members (project_id, user_id, role)
    VALUES (NEW.id, NEW.owner_id, 'owner')
    ON CONFLICT (project_id, user_id) DO NOTHING;
  END IF;

  INSERT INTO public.kanban_boards (project_id, name, is_default)
  VALUES (NEW.id, 'Board Principal', TRUE)
  RETURNING id INTO v_board_id;

  INSERT INTO public.kanban_columns
    (board_id, name, position, wip_limit, color, bpmn_mapping, is_done_col, is_locked)
  VALUES
    (v_board_id,'Planejado',   1,4,   '#9A9A94','{esbocar,viabilizar}',             FALSE,FALSE),
    (v_board_id,'Prioridade',  2,2,   '#6C5CE7','{atribuir}',                        FALSE,FALSE),
    (v_board_id,'Em Execução', 3,3,   '#C48A0A','{executar}',                        FALSE,FALSE),
    (v_board_id,'Em Revisão',  4,3,   '#3B6CDB','{avaliar,corrigir,validar_cliente}',FALSE,FALSE),
    (v_board_id,'Concluído',   5,NULL,'#1A9E5F','{concluido}',                       TRUE, FALSE),
    (v_board_id,'Recorrentes', 6,NULL,'#E07050','{}',                                FALSE,TRUE)
  ON CONFLICT (board_id, position) DO NOTHING;

  -- ✅ CORRIGIDO: usa content_json (nome canônico)
  INSERT INTO public.project_diagrams
    (project_id, name, is_current, generated_from, content_json)
  VALUES
    (NEW.id, 'Diagrama Principal', TRUE, 'auto', '{}')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

-- Associa workspace ao projeto no INSERT
CREATE OR REPLACE FUNCTION public.set_project_workspace()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws_id UUID;
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    SELECT wm.workspace_id INTO v_ws_id
    FROM   public.workspace_members wm
    WHERE  wm.user_id = NEW.owner_id
    AND    wm.role IN ('owner','admin')
    LIMIT  1;
    IF v_ws_id IS NOT NULL THEN NEW.workspace_id := v_ws_id; END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_project_workspace ON public.projects;
DROP TRIGGER IF EXISTS trg_project_defaults  ON public.projects;
DROP TRIGGER IF EXISTS on_project_created    ON public.projects;
DROP TRIGGER IF EXISTS trg_init_project      ON public.projects;
DROP TRIGGER IF EXISTS trg_set_project_ws    ON public.projects;

CREATE TRIGGER trg_project_workspace
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_workspace();

CREATE TRIGGER trg_project_defaults
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_project();

-- BPMN → kanban_col automático
CREATE OR REPLACE FUNCTION public.map_bpmn_to_col()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.kanban_col := CASE NEW.bpmn_status
    WHEN 'esbocar'         THEN 'todo' WHEN 'viabilizar'      THEN 'todo'
    WHEN 'atribuir'        THEN 'plan' WHEN 'executar'        THEN 'exec'
    WHEN 'avaliar'         THEN 'rev'  WHEN 'corrigir'        THEN 'rev'
    WHEN 'validar_cliente' THEN 'rev'  WHEN 'concluido'       THEN 'done'
    ELSE 'todo'
  END;
  IF TG_OP = 'INSERT' THEN
    IF NEW.bpmn_status = 'concluido' THEN NEW.completed_at := NOW(); END IF;
  ELSE
    IF NEW.bpmn_status  = 'concluido' AND OLD.bpmn_status != 'concluido' THEN NEW.completed_at := NOW(); END IF;
    IF NEW.bpmn_status != 'concluido' AND OLD.bpmn_status  = 'concluido' THEN NEW.completed_at := NULL; END IF;
  END IF;
  NEW.updated_at := NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS auto_map_col ON public.tasks;
CREATE TRIGGER auto_map_col
  BEFORE INSERT OR UPDATE OF bpmn_status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.map_bpmn_to_col();

-- Auditoria de mudanças em tarefas
DROP TRIGGER IF EXISTS track_history ON public.tasks;
DROP TRIGGER IF EXISTS task_audit    ON public.tasks;
DROP TRIGGER IF EXISTS audit_task    ON public.tasks;

CREATE OR REPLACE FUNCTION public.audit_task_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.bpmn_status IS DISTINCT FROM NEW.bpmn_status THEN
    INSERT INTO public.task_history
      (task_id, changed_by, change_type,
       from_status, to_status, from_col, to_col,
       field_name, old_value, new_value, changed_at)
    VALUES
      (NEW.id, auth.uid(), 'status_change',
       OLD.bpmn_status, NEW.bpmn_status, OLD.kanban_col, NEW.kanban_col,
       'bpmn_status', OLD.bpmn_status::TEXT, NEW.bpmn_status::TEXT, NOW());
  END IF;
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.task_history
      (task_id, changed_by, change_type, field_name, old_value, new_value, changed_at)
    VALUES
      (NEW.id, auth.uid(), 'field_change', 'title', OLD.title, NEW.title, NOW());
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER task_audit
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_task_changes();

-- updated_at triggers (idempotentes)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_projects_upd') THEN
    CREATE TRIGGER trg_projects_upd BEFORE UPDATE ON public.projects
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_profiles_upd') THEN
    CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_leads_upd') THEN
    CREATE TRIGGER trg_leads_upd BEFORE UPDATE ON public.leads
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_diagrams_upd') THEN
    CREATE TRIGGER trg_diagrams_upd BEFORE UPDATE ON public.project_diagrams
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_kb_upd') THEN
    CREATE TRIGGER trg_kb_upd BEFORE UPDATE ON public.knowledge_blocks
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_comments_upd') THEN
    CREATE TRIGGER trg_comments_upd BEFORE UPDATE ON public.comments
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_recorrencia_upd') THEN
    CREATE TRIGGER trg_recorrencia_upd BEFORE UPDATE ON public.configuracao_recorrencia
      FOR EACH ROW EXECUTE FUNCTION public.set_updated_at(); END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 8 — RLS (Row Level Security)
-- ══════════════════════════════════════════════════════════════

-- Remove todas as políticas antigas (idempotente)
DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename);
  END LOOP;
END $$;

ALTER TABLE public.profiles                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients                  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swimlanes                ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_boards            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_diagrams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exec_documents           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_doc_snapshots         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_blocks         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracao_recorrencia ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "p_profiles_sel" ON public.profiles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "p_profiles_ins" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);
CREATE POLICY "p_profiles_upd" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- clients (público para usuários autenticados)
CREATE POLICY "p_clients_all" ON public.clients FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

-- workspaces
CREATE POLICY "p_ws_sel" ON public.workspaces FOR SELECT TO authenticated
  USING (owner_id = auth.uid() OR public.is_workspace_member(id));
CREATE POLICY "p_ws_ins" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_ws_upd" ON public.workspaces FOR UPDATE TO authenticated USING (owner_id = auth.uid());
CREATE POLICY "p_ws_del" ON public.workspaces FOR DELETE TO authenticated USING (owner_id = auth.uid());

-- workspace_members
CREATE POLICY "p_wm_sel" ON public.workspace_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_workspace_member(workspace_id));
CREATE POLICY "p_wm_ins" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id AND owner_id = auth.uid())
  );
CREATE POLICY "p_wm_del" ON public.workspace_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.workspaces WHERE id = workspace_id AND owner_id = auth.uid())
  );

-- projects
CREATE POLICY "p_proj_sel" ON public.projects FOR SELECT TO authenticated
  USING (public.is_project_member(id));
CREATE POLICY "p_proj_ins" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (owner_id = auth.uid());
CREATE POLICY "p_proj_upd" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_write_project(id));
CREATE POLICY "p_proj_del" ON public.projects FOR DELETE TO authenticated
  USING (owner_id = auth.uid());

-- project_members
CREATE POLICY "p_pm_sel" ON public.project_members FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_project_member(project_id));
CREATE POLICY "p_pm_ins" ON public.project_members FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_pm_del" ON public.project_members FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.can_write_project(project_id));

-- swimlanes
CREATE POLICY "p_sl_all" ON public.swimlanes FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.can_write_project(project_id));

-- kanban boards
CREATE POLICY "p_board_sel" ON public.kanban_boards FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_board_ins" ON public.kanban_boards FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_board_upd" ON public.kanban_boards FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id));

-- kanban columns
CREATE POLICY "p_col_sel" ON public.kanban_columns FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.kanban_boards b
    WHERE b.id = board_id AND public.is_project_member(b.project_id)
  ));
CREATE POLICY "p_col_ins" ON public.kanban_columns FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_col_upd" ON public.kanban_columns FOR UPDATE TO authenticated
  USING (is_locked = FALSE AND EXISTS (
    SELECT 1 FROM public.kanban_boards b
    WHERE b.id = board_id AND public.can_write_project(b.project_id)
  ));
CREATE POLICY "p_col_del" ON public.kanban_columns FOR DELETE TO authenticated
  USING (is_locked = FALSE AND EXISTS (
    SELECT 1 FROM public.kanban_boards b
    WHERE b.id = board_id AND public.can_write_project(b.project_id)
  ));

-- tasks
CREATE POLICY "p_task_sel" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_task_ins" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));
CREATE POLICY "p_task_upd" ON public.tasks FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id));
CREATE POLICY "p_task_del" ON public.tasks FOR DELETE TO authenticated
  USING (public.can_write_project(project_id));

-- subtasks
CREATE POLICY "p_sub_all" ON public.subtasks FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND public.is_project_member(t.project_id)
  ));

-- attachments
CREATE POLICY "p_att_sel" ON public.task_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND public.is_project_member(t.project_id)
  ));
CREATE POLICY "p_att_ins" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_att_del" ON public.task_attachments FOR DELETE TO authenticated
  USING (uploaded_by = auth.uid());

-- comments
CREATE POLICY "p_cmt_sel" ON public.comments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND public.is_project_member(t.project_id)
  ));
CREATE POLICY "p_cmt_ins" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id = auth.uid());
CREATE POLICY "p_cmt_upd" ON public.comments FOR UPDATE TO authenticated
  USING (author_id = auth.uid());
CREATE POLICY "p_cmt_del" ON public.comments FOR DELETE TO authenticated
  USING (author_id = auth.uid());

-- task_history
CREATE POLICY "p_hist_sel" ON public.task_history FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.tasks t
    WHERE t.id = task_id AND public.is_project_member(t.project_id)
  ));
CREATE POLICY "p_hist_ins" ON public.task_history FOR INSERT TO authenticated WITH CHECK (TRUE);

-- pipeline
CREATE POLICY "p_stage_all" ON public.pipeline_stages FOR ALL TO authenticated
  USING (TRUE) WITH CHECK (TRUE);

-- leads
CREATE POLICY "p_lead_all" ON public.leads FOR ALL TO authenticated
  USING (
    owner_id = auth.uid()
    OR (project_id IS NOT NULL AND public.is_project_member(project_id))
  );
CREATE POLICY "p_lint_all" ON public.lead_interactions FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.leads l WHERE l.id = lead_id
    AND (l.owner_id = auth.uid()
      OR (l.project_id IS NOT NULL AND public.is_project_member(l.project_id)))
  ));

-- diagrams
CREATE POLICY "p_diag_sel" ON public.project_diagrams FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_diag_ins" ON public.project_diagrams FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_diag_upd" ON public.project_diagrams FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id));
CREATE POLICY "p_diag_del" ON public.project_diagrams FOR DELETE TO authenticated
  USING (public.can_write_project(project_id));

-- docs & ai
CREATE POLICY "p_edoc_sel" ON public.exec_documents FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_edoc_ins" ON public.exec_documents FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "p_snap_sel" ON public.ai_doc_snapshots FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_snap_ins" ON public.ai_doc_snapshots FOR INSERT TO authenticated WITH CHECK (TRUE);

-- knowledge base
CREATE POLICY "p_kb_all" ON public.knowledge_blocks FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.can_write_project(project_id));

-- recorrencias
CREATE POLICY "p_rec_all" ON public.configuracao_recorrencia FOR ALL TO authenticated
  USING (public.is_project_member(project_id))
  WITH CHECK (public.can_write_project(project_id));

-- ══════════════════════════════════════════════════════════════
--  BLOCO 9 — ÍNDICES
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tasks_project    ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_board      ON public.tasks(board_id, column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_bpmn       ON public.tasks(bpmn_status, project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned   ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due        ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hist_task        ON public.task_history(task_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_proj     ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_members_user     ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_proj_workspace   ON public.projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proj_owner       ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_boards_proj      ON public.kanban_boards(project_id);
CREATE INDEX IF NOT EXISTS idx_att_task         ON public.task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_diagrams_project ON public.project_diagrams(project_id);
CREATE INDEX IF NOT EXISTS idx_kb_project       ON public.knowledge_blocks(project_id, position);
CREATE INDEX IF NOT EXISTS idx_recorrencia_prox ON public.configuracao_recorrencia(proxima_ocorrencia)
  WHERE is_active = TRUE;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 10 — VIEW
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.kanban_columns_js AS
SELECT
  id, board_id, name, position, wip_limit, color,
  is_done_col, is_locked, created_at,
  COALESCE(array_to_json(bpmn_mapping)::TEXT, '[]') AS bpmn_mapping
FROM public.kanban_columns;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 11 — SEEDS (dados iniciais)
-- ══════════════════════════════════════════════════════════════
INSERT INTO public.clients (name, color_bg, color_text) VALUES
  ('Customer A', '#fffbeb', '#d4a017'),
  ('Customer B', '#fff5f5', '#dc3545'),
  ('Customer C', '#ecfdf5', '#1a9e5f')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.pipeline_stages (name, position, probability, color, is_default, is_won, is_lost) VALUES
  ('Novo Lead',         1,  10, '#2a5ac8', TRUE,  FALSE, FALSE),
  ('Qualificado',       2,  25, '#4a7cf6', FALSE, FALSE, FALSE),
  ('Proposta',          3,  50, '#a86c10', FALSE, FALSE, FALSE),
  ('Negociação',        4,  75, '#c85c2a', FALSE, FALSE, FALSE),
  ('Fechado - Ganho',   5, 100, '#1a7a4a', FALSE, TRUE,  FALSE),
  ('Fechado - Perdido', 6,   0, '#b83030', FALSE, FALSE, TRUE)
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 12 — VERIFICAÇÃO FINAL
-- ══════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_tabelas     INT;
  v_bucket      BOOLEAN;
  v_cron        BOOLEAN;
  v_checklist   BOOLEAN;
  v_content_col TEXT;
  v_request_dt  BOOLEAN;
BEGIN
  -- Conta tabelas principais
  SELECT COUNT(*) INTO v_tabelas
  FROM   information_schema.tables
  WHERE  table_schema = 'public'
  AND    table_name IN (
    'profiles','projects','tasks','kanban_boards','kanban_columns',
    'workspaces','workspace_members','project_members',
    'task_attachments','project_diagrams','configuracao_recorrencia'
  );

  -- Verifica bucket
  SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id='anexos_tarefas')
  INTO v_bucket;

  -- Verifica pg_cron
  BEGIN
    SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname='processar_tarefas_recorrentes')
    INTO v_cron;
  EXCEPTION WHEN OTHERS THEN v_cron := FALSE; END;

  -- Verifica coluna checklist em tasks
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema='public' AND table_name='tasks' AND column_name='checklist'
  ) INTO v_checklist;

  -- Verifica content_json em project_diagrams
  SELECT column_name INTO v_content_col
  FROM   information_schema.columns
  WHERE  table_schema='public' AND table_name='project_diagrams' AND column_name='content_json'
  LIMIT  1;

  -- Verifica request_date em tasks
  SELECT EXISTS(
    SELECT 1 FROM information_schema.columns
    WHERE  table_schema='public' AND table_name='tasks' AND column_name='request_date'
  ) INTO v_request_dt;

  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  ProjectFlow v10 — Relatório de Instalação';
  RAISE NOTICE '════════════════════════════════════════════════════';
  RAISE NOTICE '  Tabelas criadas:           % / 11', v_tabelas;
  RAISE NOTICE '  Bucket Storage:            %', CASE WHEN v_bucket      THEN '✅ OK' ELSE '❌ FALTANDO' END;
  RAISE NOTICE '  pg_cron job:               %', CASE WHEN v_cron        THEN '✅ OK' ELSE '⚠️  Ative pg_cron em Extensions' END;
  RAISE NOTICE '  tasks.checklist:           %', CASE WHEN v_checklist   THEN '✅ OK' ELSE '❌ FALTANDO' END;
  RAISE NOTICE '  tasks.request_date:        %', CASE WHEN v_request_dt  THEN '✅ OK' ELSE '❌ FALTANDO' END;
  RAISE NOTICE '  diagrams.content_json:     %', CASE WHEN v_content_col IS NOT NULL THEN '✅ OK' ELSE '❌ FALTANDO' END;
  RAISE NOTICE '════════════════════════════════════════════════════';

  IF v_tabelas >= 11 AND v_bucket AND v_checklist AND v_content_col IS NOT NULL AND v_request_dt THEN
    RAISE NOTICE '  ✅ ProjectFlow v10 instalado com sucesso!';
  ELSE
    RAISE WARNING '  ⚠️  Instalação incompleta — verifique os itens acima';
  END IF;
END $$;
