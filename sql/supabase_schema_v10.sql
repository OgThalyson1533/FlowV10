-- ============================================================
--  ProjectFlow — SCHEMA COMPLETO DE PRODUÇÃO v10
--  Fixes críticos: Storage bucket, pg_cron, fabric_json, task_attachments
--
--  COMO EXECUTAR:
--  1. Supabase Dashboard > SQL Editor > cole este arquivo > Run All
--  2. Extensão pg_cron: Database > Extensions > pesquise "pg_cron" > Enable
--  3. Bucket Storage é criado automaticamente pelo bloco INSERT abaixo
--  Resultado esperado: ✅ ProjectFlow v10 instalado com sucesso!
-- ============================================================

-- ══════════════════════════════════════════════════════════════
--  BLOCO 1 — EXTENSÕES
-- ══════════════════════════════════════════════════════════════
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "pg_cron";   -- automação de tarefas recorrentes

-- ══════════════════════════════════════════════════════════════
--  BLOCO 2 — ENUMs (idempotentes)
-- ══════════════════════════════════════════════════════════════
DO $$ BEGIN CREATE TYPE task_status AS ENUM (
  'esbocar','viabilizar','atribuir','executar',
  'avaliar','corrigir','validar_cliente','concluido'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE kanban_col AS ENUM ('todo','plan','exec','rev','done');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE priority_level AS ENUM ('low','medium','high','critical');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE member_role AS ENUM ('owner','admin','member','viewer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE lead_status AS ENUM (
  'new','contacted','qualified','proposal','negotiation','won','lost','stalled'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE interaction_type AS ENUM (
  'call','email','meeting','video','demo','proposal','note'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE kb_block_type AS ENUM (
  'heading1','heading2','heading3','paragraph','callout','toggle',
  'divider','embed_task','database_view','table'
); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 3 — TABELAS CORE
-- ══════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name    TEXT NOT NULL DEFAULT '',
  initials     VARCHAR(3) GENERATED ALWAYS AS (
    UPPER(LEFT(TRIM(full_name),1) || COALESCE(SUBSTRING(TRIM(full_name) FROM '\s+(\S)'),''))
  ) STORED,
  avatar_color VARCHAR(7) DEFAULT '#e07050',
  avatar_url   TEXT,
  role         member_role DEFAULT 'member',
  timezone     TEXT DEFAULT 'America/Sao_Paulo',
  preferences  JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.clients (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name       TEXT NOT NULL UNIQUE,
  color_bg   VARCHAR(7) NOT NULL DEFAULT '#f5f5f2',
  color_text VARCHAR(7) NOT NULL DEFAULT '#5c5c58',
  contact    TEXT,
  email      TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

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
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('owner','admin','member','viewer')),
  joined_at    TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (workspace_id, user_id)
);

CREATE TABLE IF NOT EXISTS public.projects (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  workspace_id UUID REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         TEXT NOT NULL,
  description  TEXT,
  owner_id     UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  client_id    UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  client_name  TEXT,
  color        TEXT DEFAULT '#e07050',
  wip_limit    INT DEFAULT 15 CHECK (wip_limit > 0),
  budget       NUMERIC(12,2) CHECK (budget >= 0),
  start_date   DATE,
  end_date     DATE,
  status       TEXT DEFAULT 'active' CHECK (status IN ('active','paused','completed','archived')),
  objective    TEXT,
  requester    TEXT,
  tech_stack   TEXT[] DEFAULT '{}',
  is_legacy    BOOLEAN NOT NULL DEFAULT FALSE,
  metadata     JSONB DEFAULT '{}',
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

CREATE TABLE IF NOT EXISTS public.swimlanes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  name       TEXT NOT NULL,
  position   INT DEFAULT 0,
  wip_limit  INT DEFAULT 10 CHECK (wip_limit > 0),
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
  position     INT NOT NULL DEFAULT 0,
  wip_limit    INT CHECK (wip_limit IS NULL OR wip_limit > 0),
  color        VARCHAR(7) DEFAULT '#6B7280',
  is_done_col  BOOLEAN DEFAULT FALSE,
  is_locked    BOOLEAN DEFAULT FALSE,
  bpmn_mapping TEXT[] DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_col_position ON public.kanban_columns(board_id, position);

CREATE TABLE IF NOT EXISTS public.tasks (
  id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id          UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  swimlane_id         UUID REFERENCES public.swimlanes(id) ON DELETE SET NULL,
  board_id            UUID REFERENCES public.kanban_boards(id) ON DELETE SET NULL,
  column_id           UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  client_id           UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  assigned_to         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_by          UUID REFERENCES public.profiles(id),
  title               TEXT NOT NULL CHECK (length(title) >= 3),
  description         TEXT,
  bpmn_status         task_status NOT NULL DEFAULT 'esbocar',
  kanban_col          kanban_col NOT NULL DEFAULT 'todo',
  position            INT DEFAULT 0,
  priority            priority_level DEFAULT 'medium',
  estimated_hours     NUMERIC(6,2),
  actual_hours        NUMERIC(6,2),
  budget              NUMERIC(10,2),
  start_date          DATE,
  due_date            DATE,
  completed_at        TIMESTAMPTZ,
  tags                TEXT[] DEFAULT '{}',
  is_blocked          BOOLEAN DEFAULT FALSE,
  blocked_reason      TEXT,
  is_recurring        BOOLEAN DEFAULT FALSE,
  recurrence_rule     JSONB,
  custom_fields       JSONB DEFAULT '{}',
  doc_decision        TEXT,
  doc_artifact        TEXT,
  doc_risk            TEXT,
  doc_next_action     TEXT,
  doc_notes           TEXT,
  acceptance_criteria TEXT,
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.subtasks (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  completed  BOOLEAN DEFAULT FALSE,
  position   INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── task_attachments CORRIGIDA ────────────────────────────────
-- Colunas storage_path e public_url são obrigatórias e persistidas
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id      UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  file_size    BIGINT,
  mime_type    TEXT,
  storage_path TEXT NOT NULL,   -- caminho no bucket: {task_id}/{uuid}/{filename}
  public_url   TEXT NOT NULL,   -- URL pública ou signed URL base
  uploaded_by  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- Garante colunas em tabelas existentes (idempotente)
ALTER TABLE public.task_attachments ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE public.task_attachments ADD COLUMN IF NOT EXISTS public_url   TEXT;
-- Preenche com placeholder se existiam registros antigos sem essas colunas
UPDATE public.task_attachments SET storage_path='' WHERE storage_path IS NULL;
UPDATE public.task_attachments SET public_url=''   WHERE public_url   IS NULL;

CREATE TABLE IF NOT EXISTS public.comments (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id    UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  author_id  UUID REFERENCES public.profiles(id),
  content    TEXT NOT NULL CHECK (length(content) >= 1),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.task_history (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  task_id     UUID REFERENCES public.tasks(id) ON DELETE CASCADE,
  changed_by  UUID REFERENCES public.profiles(id),
  change_type TEXT DEFAULT 'field_change',
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

CREATE TABLE IF NOT EXISTS public.pipeline_stages (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  position    INT DEFAULT 0,
  probability NUMERIC(5,2) DEFAULT 0 CHECK (probability BETWEEN 0 AND 100),
  color       VARCHAR(7) DEFAULT '#9a9a94',
  is_won      BOOLEAN DEFAULT FALSE,
  is_lost     BOOLEAN DEFAULT FALSE,
  is_default  BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT only_one_win_loss CHECK (NOT (is_won AND is_lost))
);

CREATE TABLE IF NOT EXISTS public.leads (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id        UUID REFERENCES public.clients(id) ON DELETE SET NULL,
  owner_id         UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  stage_id         UUID REFERENCES public.pipeline_stages(id) ON DELETE SET NULL,
  project_id       UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  title            TEXT NOT NULL CHECK (length(title) >= 2),
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
  tags             TEXT[] DEFAULT '{}',
  notes            TEXT,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.lead_interactions (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  lead_id          UUID REFERENCES public.leads(id) ON DELETE CASCADE,
  author_id        UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  type             interaction_type NOT NULL,
  summary          TEXT NOT NULL,
  next_action      TEXT,
  next_action_date DATE,
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

-- ── project_diagrams CORRIGIDA — fabric_json em vez de content_json ──
CREATE TABLE IF NOT EXISTS public.project_diagrams (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id     UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  task_id        UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  name           TEXT NOT NULL DEFAULT 'Diagrama Principal',
  version        INT NOT NULL DEFAULT 1,
  is_current     BOOLEAN DEFAULT TRUE,
  diagram_type   TEXT DEFAULT 'free_draw',
  -- CAMPO PRINCIPAL: estado completo do Fabric.js via canvas.toJSON()
  fabric_json    JSONB DEFAULT '{}',
  canvas_config  JSONB DEFAULT '{"zoom":1,"pan_x":0,"pan_y":0}',
  thumbnail_url  TEXT,
  generated_from TEXT,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ DEFAULT NOW(),
  updated_at     TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.project_diagrams ADD COLUMN IF NOT EXISTS fabric_json   JSONB DEFAULT '{}';
ALTER TABLE public.project_diagrams ADD COLUMN IF NOT EXISTS task_id       UUID REFERENCES public.tasks(id) ON DELETE SET NULL;
ALTER TABLE public.project_diagrams ADD COLUMN IF NOT EXISTS thumbnail_url TEXT;
ALTER TABLE public.project_diagrams ADD COLUMN IF NOT EXISTS updated_at    TIMESTAMPTZ DEFAULT NOW();

CREATE TABLE IF NOT EXISTS public.exec_documents (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  version      INT NOT NULL DEFAULT 1,
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
  version      INT NOT NULL DEFAULT 1,
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
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  parent_id  UUID REFERENCES public.knowledge_blocks(id) ON DELETE CASCADE,
  type       kb_block_type NOT NULL DEFAULT 'paragraph',
  position   INT NOT NULL DEFAULT 0,
  content    TEXT,
  icon       TEXT,
  is_open    BOOLEAN DEFAULT TRUE,
  task_id    UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  table_data JSONB DEFAULT '{"headers":[],"rows":[]}',
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
--  BLOCO 4 — configuracao_recorrencia
--  Tabela de templates para automação pg_cron
-- ══════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.configuracao_recorrencia (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  board_id        UUID REFERENCES public.kanban_boards(id) ON DELETE SET NULL,
  column_id       UUID REFERENCES public.kanban_columns(id) ON DELETE SET NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  priority        priority_level DEFAULT 'medium',
  estimated_hours NUMERIC(6,2),
  assigned_to     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  tags            TEXT[] DEFAULT '{}',
  -- Frequência: 'daily' | 'weekly' | 'monthly' | 'custom_days'
  frequencia      TEXT NOT NULL DEFAULT 'weekly'
    CHECK (frequencia IN ('daily','weekly','monthly','custom_days')),
  dia_semana      INT CHECK (dia_semana BETWEEN 0 AND 6),  -- 0=Dom..6=Sab (weekly)
  dia_mes         INT CHECK (dia_mes BETWEEN 1 AND 28),    -- dia do mês (monthly)
  intervalo_dias  INT CHECK (intervalo_dias > 0),           -- (custom_days)
  proxima_ocorrencia  TIMESTAMPTZ NOT NULL,
  ultima_execucao     TIMESTAMPTZ,
  is_active           BOOLEAN DEFAULT TRUE,
  created_by          UUID REFERENCES auth.users(id),
  created_at          TIMESTAMPTZ DEFAULT NOW(),
  updated_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
--  BLOCO 5 — FUNÇÕES HELPER
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_project_member(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id=p_project_id AND owner_id=auth.uid())
  OR EXISTS (SELECT 1 FROM public.project_members WHERE project_id=p_project_id AND user_id=auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.can_write_project(p_project_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.projects WHERE id=p_project_id AND owner_id=auth.uid())
  OR EXISTS (SELECT 1 FROM public.project_members
             WHERE project_id=p_project_id AND user_id=auth.uid() AND role IN ('owner','admin','member'));
$$;

CREATE OR REPLACE FUNCTION public.is_workspace_member(p_workspace_id UUID)
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.workspace_members WHERE workspace_id=p_workspace_id AND user_id=auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := NOW(); RETURN NEW; END; $$;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 6 — FUNÇÃO PRINCIPAL pg_cron
--  Cria tarefas recorrentes quando proxima_ocorrencia <= NOW()
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.processar_tarefas_recorrentes()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rec           RECORD;
  nova_task_id  UUID;
  prox          TIMESTAMPTZ;
  v_board_id    UUID;
  v_column_id   UUID;
BEGIN
  FOR rec IN
    SELECT cr.*
    FROM   public.configuracao_recorrencia cr
    WHERE  cr.is_active = TRUE
    AND    cr.proxima_ocorrencia <= NOW()
    ORDER  BY cr.proxima_ocorrencia ASC
  LOOP
    BEGIN
      -- Resolve board_id: usa o do template ou busca o board padrão do projeto
      IF rec.board_id IS NOT NULL THEN
        v_board_id := rec.board_id;
      ELSE
        SELECT id INTO v_board_id
        FROM   public.kanban_boards
        WHERE  project_id = rec.project_id AND is_default = TRUE
        LIMIT  1;
      END IF;

      -- Resolve column_id: usa o do template ou busca a coluna "Planejado" (posição 1)
      IF rec.column_id IS NOT NULL THEN
        v_column_id := rec.column_id;
      ELSE
        SELECT id INTO v_column_id
        FROM   public.kanban_columns
        WHERE  board_id = v_board_id AND position = 1
        LIMIT  1;
      END IF;

      -- Insere a nova tarefa
      INSERT INTO public.tasks (
        project_id, board_id, column_id, assigned_to, created_by,
        title, description, bpmn_status, priority, estimated_hours,
        tags, is_recurring, recurrence_rule, position
      )
      VALUES (
        rec.project_id,
        v_board_id,
        v_column_id,
        rec.assigned_to,
        rec.created_by,
        rec.title || ' — ' || TO_CHAR(NOW() AT TIME ZONE 'America/Sao_Paulo', 'DD/MM/YYYY'),
        rec.description,
        'esbocar',
        rec.priority,
        rec.estimated_hours,
        rec.tags,
        TRUE,
        jsonb_build_object(
          'config_id',  rec.id,
          'frequencia', rec.frequencia,
          'gerado_em',  NOW()::TEXT
        ),
        COALESCE((
          SELECT MAX(position) + 1
          FROM   public.tasks
          WHERE  column_id = v_column_id
        ), 0)
      )
      RETURNING id INTO nova_task_id;

      -- Calcula próxima ocorrência
      prox := CASE rec.frequencia
        WHEN 'daily'       THEN rec.proxima_ocorrencia + INTERVAL '1 day'
        WHEN 'weekly'      THEN rec.proxima_ocorrencia + INTERVAL '7 days'
        WHEN 'monthly'     THEN rec.proxima_ocorrencia + INTERVAL '1 month'
        WHEN 'custom_days' THEN rec.proxima_ocorrencia + (rec.intervalo_dias * INTERVAL '1 day')
        ELSE                    rec.proxima_ocorrencia + INTERVAL '7 days'
      END;

      UPDATE public.configuracao_recorrencia
      SET    proxima_ocorrencia = prox,
             ultima_execucao   = NOW(),
             updated_at        = NOW()
      WHERE  id = rec.id;

      RAISE NOTICE '[pg_cron] Tarefa recorrente criada: % | config: % | próxima: %',
                   nova_task_id, rec.id, prox;

    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING '[pg_cron] ERRO config_id=%: %', rec.id, SQLERRM;
    END;
  END LOOP;
END;
$$;

-- Agenda o job (remove anterior para evitar duplicata)
DO $$
BEGIN
  PERFORM cron.unschedule('processar_tarefas_recorrentes');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'processar_tarefas_recorrentes',
  '5 3 * * *',   -- 03:05 UTC = 00:05 BRT (diário)
  $job$
    SELECT public.processar_tarefas_recorrentes();
  $job$
);

-- ══════════════════════════════════════════════════════════════
--  BLOCO 7 — TRIGGERS
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_name  TEXT;
  v_ws_id UUID;
  v_colors TEXT[] := ARRAY['#e07050','#6c5ce7','#3b6cdb','#1a9e5f','#c48a0a','#0097a7'];
BEGIN
  v_name := COALESCE(NEW.raw_user_meta_data->>'full_name', SPLIT_PART(NEW.email,'@',1));
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

  INSERT INTO public.kanban_columns (board_id, name, position, wip_limit, color, bpmn_mapping, is_done_col, is_locked)
  VALUES
    (v_board_id, 'Planejado',   1, 4,    '#9A9A94', '{esbocar,viabilizar}',              FALSE, FALSE),
    (v_board_id, 'Prioridade',  2, 2,    '#6C5CE7', '{atribuir}',                         FALSE, FALSE),
    (v_board_id, 'Em Execução', 3, 3,    '#C48A0A', '{executar}',                         FALSE, FALSE),
    (v_board_id, 'Em Revisão',  4, 3,    '#3B6CDB', '{avaliar,corrigir,validar_cliente}', FALSE, FALSE),
    (v_board_id, 'Concluído',   5, NULL, '#1A9E5F', '{concluido}',                        TRUE,  FALSE),
    (v_board_id, 'Recorrentes', 6, NULL, '#E07050', '{}',                                 FALSE, TRUE)
  ON CONFLICT (board_id, position) DO NOTHING;

  INSERT INTO public.project_diagrams (project_id, name, is_current, generated_from, fabric_json)
  VALUES (NEW.id, 'Diagrama Principal', TRUE, 'auto', '{}')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION public.set_project_workspace()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_ws_id UUID;
BEGIN
  IF NEW.workspace_id IS NULL AND NEW.owner_id IS NOT NULL THEN
    SELECT wm.workspace_id INTO v_ws_id FROM public.workspace_members wm
    WHERE wm.user_id = NEW.owner_id AND wm.role IN ('owner','admin') LIMIT 1;
    IF v_ws_id IS NOT NULL THEN NEW.workspace_id := v_ws_id; END IF;
  END IF;
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS trg_project_workspace  ON public.projects;
DROP TRIGGER IF EXISTS trg_project_defaults   ON public.projects;
DROP TRIGGER IF EXISTS on_project_created     ON public.projects;
DROP TRIGGER IF EXISTS trg_init_project       ON public.projects;
DROP TRIGGER IF EXISTS trg_set_project_ws     ON public.projects;

CREATE TRIGGER trg_project_workspace
  BEFORE INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.set_project_workspace();

CREATE TRIGGER trg_project_defaults
  AFTER INSERT ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_project();

CREATE OR REPLACE FUNCTION public.map_bpmn_to_col()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.kanban_col := CASE NEW.bpmn_status
    WHEN 'esbocar'         THEN 'todo'  WHEN 'viabilizar'      THEN 'todo'
    WHEN 'atribuir'        THEN 'plan'  WHEN 'executar'        THEN 'exec'
    WHEN 'avaliar'         THEN 'rev'   WHEN 'corrigir'        THEN 'rev'
    WHEN 'validar_cliente' THEN 'rev'   WHEN 'concluido'       THEN 'done'
    ELSE 'todo' END;
  IF TG_OP='INSERT' THEN
    IF NEW.bpmn_status='concluido' THEN NEW.completed_at:=NOW(); END IF;
  ELSE
    IF NEW.bpmn_status='concluido' AND OLD.bpmn_status!='concluido' THEN NEW.completed_at:=NOW(); END IF;
    IF NEW.bpmn_status!='concluido' AND OLD.bpmn_status='concluido' THEN NEW.completed_at:=NULL; END IF;
  END IF;
  NEW.updated_at:=NOW();
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS auto_map_col ON public.tasks;
CREATE TRIGGER auto_map_col
  BEFORE INSERT OR UPDATE OF bpmn_status ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.map_bpmn_to_col();

DROP TRIGGER IF EXISTS track_history ON public.tasks;
DROP TRIGGER IF EXISTS task_audit    ON public.tasks;
DROP TRIGGER IF EXISTS audit_task    ON public.tasks;

CREATE OR REPLACE FUNCTION public.audit_task_changes()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF OLD.bpmn_status IS DISTINCT FROM NEW.bpmn_status THEN
    INSERT INTO public.task_history (task_id,changed_by,change_type,from_status,to_status,from_col,to_col,field_name,old_value,new_value,changed_at)
    VALUES (NEW.id,auth.uid(),'status_change',OLD.bpmn_status,NEW.bpmn_status,OLD.kanban_col,NEW.kanban_col,'bpmn_status',OLD.bpmn_status::TEXT,NEW.bpmn_status::TEXT,NOW());
  END IF;
  IF OLD.title IS DISTINCT FROM NEW.title THEN
    INSERT INTO public.task_history (task_id,changed_by,change_type,field_name,old_value,new_value,changed_at)
    VALUES (NEW.id,auth.uid(),'field_change','title',OLD.title,NEW.title,NOW());
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER task_audit
  AFTER UPDATE ON public.tasks
  FOR EACH ROW EXECUTE FUNCTION public.audit_task_changes();

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_projects_upd') THEN
    CREATE TRIGGER trg_projects_upd BEFORE UPDATE ON public.projects FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_profiles_upd') THEN
    CREATE TRIGGER trg_profiles_upd BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_leads_upd') THEN
    CREATE TRIGGER trg_leads_upd BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_diagrams_upd') THEN
    CREATE TRIGGER trg_diagrams_upd BEFORE UPDATE ON public.project_diagrams FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_kb_upd') THEN
    CREATE TRIGGER trg_kb_upd BEFORE UPDATE ON public.knowledge_blocks FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_comments_upd') THEN
    CREATE TRIGGER trg_comments_upd BEFORE UPDATE ON public.comments FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname='trg_recorrencia_upd') THEN
    CREATE TRIGGER trg_recorrencia_upd BEFORE UPDATE ON public.configuracao_recorrencia FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
  END IF;
END $$;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 8 — STORAGE: bucket anexos_tarefas
-- ══════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'anexos_tarefas',
  'anexos_tarefas',
  FALSE,
  52428800,  -- 50 MB
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
)
ON CONFLICT (id) DO UPDATE SET
  file_size_limit    = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── Storage RLS ───────────────────────────────────────────────
DROP POLICY IF EXISTS "storage_anexos_insert" ON storage.objects;
DROP POLICY IF EXISTS "storage_anexos_select" ON storage.objects;
DROP POLICY IF EXISTS "storage_anexos_delete" ON storage.objects;

-- Upload: qualquer usuário autenticado pode enviar para o bucket
CREATE POLICY "storage_anexos_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'anexos_tarefas');

-- Leitura: qualquer usuário autenticado (bucket é privado; URLs temporárias geradas no JS)
CREATE POLICY "storage_anexos_select"
  ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'anexos_tarefas');

-- Deleção: somente quem fez o upload
CREATE POLICY "storage_anexos_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'anexos_tarefas' AND owner = auth.uid());

-- ══════════════════════════════════════════════════════════════
--  BLOCO 9 — RLS DAS TABELAS
-- ══════════════════════════════════════════════════════════════

DO $$ DECLARE r RECORD; BEGIN
  FOR r IN SELECT policyname, tablename FROM pg_policies WHERE schemaname='public'
  LOOP EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', r.policyname, r.tablename); END LOOP;
END $$;

ALTER TABLE public.profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clients               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspaces            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.projects              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_members       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.swimlanes             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_boards         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kanban_columns        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.subtasks              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_attachments      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.comments              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pipeline_stages       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads                 ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_interactions     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_diagrams      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.exec_documents        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_doc_snapshots      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.knowledge_blocks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.configuracao_recorrencia ENABLE ROW LEVEL SECURITY;

CREATE POLICY "p_profiles_sel" ON public.profiles FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "p_profiles_ins" ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid()=id);
CREATE POLICY "p_profiles_upd" ON public.profiles FOR UPDATE TO authenticated USING (auth.uid()=id);

CREATE POLICY "p_clients_sel" ON public.clients FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "p_clients_ins" ON public.clients FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_clients_upd" ON public.clients FOR UPDATE TO authenticated USING (TRUE);

CREATE POLICY "p_ws_sel" ON public.workspaces FOR SELECT TO authenticated
  USING (owner_id=auth.uid() OR public.is_workspace_member(id));
CREATE POLICY "p_ws_ins" ON public.workspaces FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_ws_upd" ON public.workspaces FOR UPDATE TO authenticated USING (owner_id=auth.uid());
CREATE POLICY "p_ws_del" ON public.workspaces FOR DELETE TO authenticated USING (owner_id=auth.uid());

CREATE POLICY "p_wm_sel" ON public.workspace_members FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.is_workspace_member(workspace_id));
CREATE POLICY "p_wm_ins" ON public.workspace_members FOR INSERT TO authenticated
  WITH CHECK (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.workspaces WHERE id=workspace_id AND owner_id=auth.uid()));
CREATE POLICY "p_wm_del" ON public.workspace_members FOR DELETE TO authenticated
  USING (user_id=auth.uid() OR EXISTS(SELECT 1 FROM public.workspaces WHERE id=workspace_id AND owner_id=auth.uid()));

CREATE POLICY "p_proj_sel" ON public.projects FOR SELECT TO authenticated
  USING (public.is_project_member(id));
CREATE POLICY "p_proj_ins" ON public.projects FOR INSERT TO authenticated
  WITH CHECK (owner_id=auth.uid());
CREATE POLICY "p_proj_upd" ON public.projects FOR UPDATE TO authenticated
  USING (public.can_write_project(id));
CREATE POLICY "p_proj_del" ON public.projects FOR DELETE TO authenticated
  USING (owner_id=auth.uid());

CREATE POLICY "p_pm_sel" ON public.project_members FOR SELECT TO authenticated
  USING (user_id=auth.uid() OR public.is_project_member(project_id));
CREATE POLICY "p_pm_ins" ON public.project_members FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_pm_del" ON public.project_members FOR DELETE TO authenticated
  USING (user_id=auth.uid() OR public.can_write_project(project_id));

CREATE POLICY "p_sl_all" ON public.swimlanes FOR ALL TO authenticated
  USING (public.is_project_member(project_id)) WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "p_board_sel" ON public.kanban_boards FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_board_ins" ON public.kanban_boards FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_board_upd" ON public.kanban_boards FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id));

CREATE POLICY "p_col_sel" ON public.kanban_columns FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.kanban_boards b WHERE b.id=board_id AND public.is_project_member(b.project_id)));
CREATE POLICY "p_col_ins" ON public.kanban_columns FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_col_upd" ON public.kanban_columns FOR UPDATE TO authenticated
  USING (is_locked=FALSE AND EXISTS(SELECT 1 FROM public.kanban_boards b WHERE b.id=board_id AND public.can_write_project(b.project_id)));
CREATE POLICY "p_col_del" ON public.kanban_columns FOR DELETE TO authenticated
  USING (is_locked=FALSE AND EXISTS(SELECT 1 FROM public.kanban_boards b WHERE b.id=board_id AND public.can_write_project(b.project_id)));

CREATE POLICY "p_task_sel" ON public.tasks FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_task_ins" ON public.tasks FOR INSERT TO authenticated
  WITH CHECK (public.can_write_project(project_id));
CREATE POLICY "p_task_upd" ON public.tasks FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id));
CREATE POLICY "p_task_del" ON public.tasks FOR DELETE TO authenticated
  USING (public.can_write_project(project_id));

CREATE POLICY "p_sub_all" ON public.subtasks FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=task_id AND public.is_project_member(t.project_id)));

CREATE POLICY "p_att_sel" ON public.task_attachments FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=task_id AND public.is_project_member(t.project_id)));
CREATE POLICY "p_att_ins" ON public.task_attachments FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_att_del" ON public.task_attachments FOR DELETE TO authenticated
  USING (uploaded_by=auth.uid());

CREATE POLICY "p_cmt_sel" ON public.comments FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=task_id AND public.is_project_member(t.project_id)));
CREATE POLICY "p_cmt_ins" ON public.comments FOR INSERT TO authenticated
  WITH CHECK (author_id=auth.uid());
CREATE POLICY "p_cmt_upd" ON public.comments FOR UPDATE TO authenticated USING (author_id=auth.uid());
CREATE POLICY "p_cmt_del" ON public.comments FOR DELETE TO authenticated USING (author_id=auth.uid());

CREATE POLICY "p_hist_sel" ON public.task_history FOR SELECT TO authenticated
  USING (EXISTS(SELECT 1 FROM public.tasks t WHERE t.id=task_id AND public.is_project_member(t.project_id)));
CREATE POLICY "p_hist_ins" ON public.task_history FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "p_stage_sel" ON public.pipeline_stages FOR SELECT TO authenticated USING (TRUE);
CREATE POLICY "p_stage_ins" ON public.pipeline_stages FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_stage_upd" ON public.pipeline_stages FOR UPDATE TO authenticated USING (TRUE);

CREATE POLICY "p_lead_all" ON public.leads FOR ALL TO authenticated
  USING (owner_id=auth.uid() OR (project_id IS NOT NULL AND public.is_project_member(project_id)));

CREATE POLICY "p_lint_all" ON public.lead_interactions FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.leads l WHERE l.id=lead_id
    AND (l.owner_id=auth.uid() OR (l.project_id IS NOT NULL AND public.is_project_member(l.project_id)))));

CREATE POLICY "p_diag_sel" ON public.project_diagrams FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_diag_ins" ON public.project_diagrams FOR INSERT TO authenticated WITH CHECK (TRUE);
CREATE POLICY "p_diag_upd" ON public.project_diagrams FOR UPDATE TO authenticated
  USING (public.can_write_project(project_id));
CREATE POLICY "p_diag_del" ON public.project_diagrams FOR DELETE TO authenticated
  USING (public.can_write_project(project_id));

CREATE POLICY "p_edoc_sel" ON public.exec_documents FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_edoc_ins" ON public.exec_documents FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "p_snap_sel" ON public.ai_doc_snapshots FOR SELECT TO authenticated
  USING (public.is_project_member(project_id));
CREATE POLICY "p_snap_ins" ON public.ai_doc_snapshots FOR INSERT TO authenticated WITH CHECK (TRUE);

CREATE POLICY "p_kb_all" ON public.knowledge_blocks FOR ALL TO authenticated
  USING (public.is_project_member(project_id)) WITH CHECK (public.can_write_project(project_id));

CREATE POLICY "p_rec_all" ON public.configuracao_recorrencia FOR ALL TO authenticated
  USING (public.is_project_member(project_id)) WITH CHECK (public.can_write_project(project_id));

-- ══════════════════════════════════════════════════════════════
--  BLOCO 10 — ÍNDICES
-- ══════════════════════════════════════════════════════════════
CREATE INDEX IF NOT EXISTS idx_tasks_project    ON public.tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_board      ON public.tasks(board_id, column_id);
CREATE INDEX IF NOT EXISTS idx_tasks_col        ON public.tasks(kanban_col, project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assigned   ON public.tasks(assigned_to);
CREATE INDEX IF NOT EXISTS idx_tasks_due        ON public.tasks(due_date) WHERE due_date IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_hist_task        ON public.task_history(task_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_members_proj     ON public.project_members(project_id);
CREATE INDEX IF NOT EXISTS idx_members_user     ON public.project_members(user_id);
CREATE INDEX IF NOT EXISTS idx_proj_workspace   ON public.projects(workspace_id);
CREATE INDEX IF NOT EXISTS idx_proj_owner       ON public.projects(owner_id);
CREATE INDEX IF NOT EXISTS idx_boards_proj      ON public.kanban_boards(project_id);
CREATE INDEX IF NOT EXISTS idx_leads_owner      ON public.leads(owner_id);
CREATE INDEX IF NOT EXISTS idx_kb_project       ON public.knowledge_blocks(project_id, position);
CREATE INDEX IF NOT EXISTS idx_att_task         ON public.task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_diagrams_project ON public.project_diagrams(project_id);
CREATE INDEX IF NOT EXISTS idx_recorrencia_prox ON public.configuracao_recorrencia(proxima_ocorrencia)
  WHERE is_active = TRUE;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 11 — VIEW
-- ══════════════════════════════════════════════════════════════
CREATE OR REPLACE VIEW public.kanban_columns_js AS
SELECT id, board_id, name, position, wip_limit, color, is_done_col, is_locked, created_at,
  COALESCE(array_to_json(bpmn_mapping)::TEXT, '[]') AS bpmn_mapping
FROM public.kanban_columns;

-- ══════════════════════════════════════════════════════════════
--  BLOCO 12 — SEEDS
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
--  BLOCO 13 — VERIFICAÇÃO FINAL
-- ══════════════════════════════════════════════════════════════
DO $$
DECLARE
  cnt       INT;
  bucket_ok BOOLEAN;
  cron_ok   BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO cnt FROM information_schema.tables
  WHERE table_schema = 'public'
  AND   table_name IN (
    'profiles','projects','tasks','kanban_boards','kanban_columns',
    'workspaces','workspace_members','project_members',
    'task_attachments','project_diagrams','configuracao_recorrencia'
  );

  SELECT EXISTS(SELECT 1 FROM storage.buckets WHERE id = 'anexos_tarefas') INTO bucket_ok;

  BEGIN
    SELECT EXISTS(SELECT 1 FROM cron.job WHERE jobname = 'processar_tarefas_recorrentes') INTO cron_ok;
  EXCEPTION WHEN OTHERS THEN
    cron_ok := FALSE;
  END;

  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  ProjectFlow v10 — Relatório de Instalação';
  RAISE NOTICE '══════════════════════════════════════════';
  RAISE NOTICE '  Tabelas principais:  % / 11', cnt;
  RAISE NOTICE '  Bucket Storage:      %', CASE WHEN bucket_ok THEN '✅ OK' ELSE '❌ FALTANDO' END;
  RAISE NOTICE '  Job pg_cron:         %', CASE WHEN cron_ok  THEN '✅ OK' ELSE '❌ Ative pg_cron em Extensions' END;
  RAISE NOTICE '══════════════════════════════════════════';

  IF cnt >= 11 AND bucket_ok THEN
    RAISE NOTICE '  ✅ ProjectFlow v10 instalado com sucesso!';
  ELSE
    RAISE WARNING '  ⚠️  Instalação incompleta — % tabelas, bucket=%', cnt, bucket_ok;
  END IF;
END $$;
