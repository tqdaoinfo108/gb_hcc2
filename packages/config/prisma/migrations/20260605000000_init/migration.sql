CREATE EXTENSION IF NOT EXISTS pgcrypto;

DO $$ BEGIN CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'DISABLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommandType" AS ENUM ('restart_app', 'restart_device', 'lock', 'unlock', 'clear_cache', 'capture_screen', 'push_workflow', 'update_config'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "CommandStatus" AS ENUM ('PENDING', 'SENT', 'ACK', 'SUCCESS', 'FAILED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WorkflowAction" AS ENUM ('OPEN', 'CLICK', 'INPUT', 'UPLOAD', 'WAIT', 'ASSERT', 'SCREENSHOT'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "WorkflowVersionStatus" AS ENUM ('DRAFT', 'ACTIVE', 'ARCHIVED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SelectorType" AS ENUM ('data-testid', 'aria-label', 'text', 'css', 'xpath', 'image'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "SessionStatus" AS ENUM ('QUEUED', 'RUNNING', 'PAUSED', 'SUCCESS', 'FAILED', 'CANCELLED'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "LogLevel" AS ENUM ('INFO', 'WARN', 'ERROR'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OtaComponent" AS ENUM ('kiosk_app', 'automation_engine', 'workflow', 'browser', 'browser_engine', 'config'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OtaPackageStatus" AS ENUM ('DRAFT', 'SIGNED', 'ACTIVE', 'ROLLED_BACK'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OtaDeploymentStatus" AS ENUM ('PENDING', 'DOWNLOADING', 'VERIFYING', 'BACKING_UP', 'INSTALLING', 'HEALTH_CHECK', 'SUCCESS', 'FAILED', 'ROLLED_BACK'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL DEFAULT '',
  full_name TEXT NOT NULL DEFAULT '',
  status "UserStatus" NOT NULL DEFAULT 'ACTIVE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_roles (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, role_id)
);

CREATE TABLE IF NOT EXISTS role_permissions (
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  PRIMARY KEY (role_id, permission_id)
);

CREATE TABLE IF NOT EXISTS devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL UNIQUE,
  location TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '0.0.0',
  ip TEXT,
  status TEXT NOT NULL DEFAULT 'offline',
  certificate_fingerprint TEXT,
  jwt_subject TEXT,
  is_locked BOOLEAN NOT NULL DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE devices ADD COLUMN IF NOT EXISTS device_id TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS location TEXT NOT NULL DEFAULT '';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS version TEXT NOT NULL DEFAULT '0.0.0';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'offline';
ALTER TABLE devices ADD COLUMN IF NOT EXISTS certificate_fingerprint TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS jwt_subject TEXT;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS is_locked BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'devices'
      AND column_name = 'app_version'
  ) THEN
    EXECUTE 'UPDATE devices SET version = COALESCE(NULLIF(version, ''''), app_version, ''0.0.0'')';
  END IF;
END $$;
CREATE UNIQUE INDEX IF NOT EXISTS devices_device_id_key ON devices(device_id);

CREATE TABLE IF NOT EXISTS device_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  online BOOLEAN NOT NULL DEFAULT false,
  cpu_percent DOUBLE PRECISION,
  ram_percent DOUBLE PRECISION,
  disk_percent DOUBLE PRECISION,
  temperature_c DOUBLE PRECISION,
  network TEXT,
  current_url TEXT,
  current_step TEXT,
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE device_status ADD COLUMN IF NOT EXISTS online BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS cpu_percent DOUBLE PRECISION;
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS ram_percent DOUBLE PRECISION;
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS disk_percent DOUBLE PRECISION;
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS temperature_c DOUBLE PRECISION;
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS network TEXT;
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS current_url TEXT;
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS current_step TEXT;
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE device_status ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_device_status_latest ON device_status(device_id, last_heartbeat DESC);

CREATE TABLE IF NOT EXISTS device_command (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  command "CommandType" NOT NULL,
  payload JSONB,
  status "CommandStatus" NOT NULL DEFAULT 'PENDING',
  response JSONB,
  issued_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
  issued_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_device_command_device_issued ON device_command(device_id, issued_at DESC);

CREATE TABLE IF NOT EXISTS workflow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  description TEXT,
  active_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE workflow ADD COLUMN IF NOT EXISTS slug TEXT;
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS name TEXT NOT NULL DEFAULT '';
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS active_version TEXT;
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE workflow ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
UPDATE workflow SET slug = COALESCE(slug, regexp_replace(lower(name), '[^a-z0-9]+', '_', 'g')) WHERE slug IS NULL;
UPDATE workflow SET slug = 'workflow_' || replace(id::text, '-', '') WHERE slug IS NULL OR slug = '';
ALTER TABLE workflow ALTER COLUMN slug SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS workflow_slug_key ON workflow(slug);

CREATE TABLE IF NOT EXISTS workflow_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id UUID NOT NULL REFERENCES workflow(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  definition JSONB NOT NULL,
  status "WorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT',
  is_active BOOLEAN NOT NULL DEFAULT false,
  signature TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (workflow_id, version)
);

ALTER TABLE workflow_version ADD COLUMN IF NOT EXISTS definition JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE workflow_version ADD COLUMN IF NOT EXISTS status "WorkflowVersionStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE workflow_version ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE workflow_version ADD COLUMN IF NOT EXISTS signature TEXT;
ALTER TABLE workflow_version ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE TABLE IF NOT EXISTS workflow_step (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_version_id UUID NOT NULL REFERENCES workflow_version(id) ON DELETE CASCADE,
  step_key TEXT NOT NULL,
  step_order INTEGER NOT NULL,
  action "WorkflowAction" NOT NULL,
  target_url TEXT,
  selector_key TEXT,
  input_source TEXT,
  timeout_ms INTEGER NOT NULL DEFAULT 30000,
  retry_count INTEGER NOT NULL DEFAULT 3,
  metadata JSONB,
  UNIQUE (workflow_version_id, step_key)
);

CREATE TABLE IF NOT EXISTS selector (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selector_key TEXT UNIQUE,
  workflow_id UUID REFERENCES workflow(id) ON DELETE SET NULL,
  workflow_version_id UUID,
  step_key TEXT,
  name TEXT,
  description TEXT,
  selector_type "SelectorType",
  selector_value TEXT,
  priority INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE selector ADD COLUMN IF NOT EXISTS selector_key TEXT;
ALTER TABLE selector ADD COLUMN IF NOT EXISTS workflow_id UUID;
ALTER TABLE selector ADD COLUMN IF NOT EXISTS workflow_version_id UUID;
ALTER TABLE selector ADD COLUMN IF NOT EXISTS step_key TEXT;
ALTER TABLE selector ADD COLUMN IF NOT EXISTS name TEXT;
ALTER TABLE selector ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE selector ADD COLUMN IF NOT EXISTS selector_type "SelectorType";
ALTER TABLE selector ADD COLUMN IF NOT EXISTS selector_value TEXT;
ALTER TABLE selector ADD COLUMN IF NOT EXISTS priority INTEGER NOT NULL DEFAULT 1;
ALTER TABLE selector ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE selector ALTER COLUMN selector_type TYPE "SelectorType" USING selector_type::text::"SelectorType";
CREATE UNIQUE INDEX IF NOT EXISTS selector_selector_key_key ON selector(selector_key);

CREATE TABLE IF NOT EXISTS selector_version (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selector_id UUID NOT NULL REFERENCES selector(id) ON DELETE CASCADE,
  version TEXT NOT NULL,
  selector_type "SelectorType" NOT NULL,
  selector_value TEXT NOT NULL,
  priority INTEGER NOT NULL DEFAULT 1,
  is_active BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (selector_id, version)
);

CREATE TABLE IF NOT EXISTS automation_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
  workflow_version_id UUID REFERENCES workflow_version(id) ON DELETE SET NULL,
  status "SessionStatus" NOT NULL,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + interval '15 minutes',
  current_step TEXT,
  error_message TEXT
);

ALTER TABLE automation_session DROP CONSTRAINT IF EXISTS automation_session_status_check;
ALTER TABLE automation_session ADD COLUMN IF NOT EXISTS current_step TEXT;
ALTER TABLE automation_session ADD COLUMN IF NOT EXISTS error_message TEXT;
ALTER TABLE automation_session ALTER COLUMN status TYPE "SessionStatus" USING upper(status::text)::"SessionStatus";
CREATE INDEX IF NOT EXISTS idx_automation_session_status ON automation_session(status);

CREATE TABLE IF NOT EXISTS automation_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES automation_session(id) ON DELETE CASCADE,
  step_key TEXT,
  level "LogLevel" NOT NULL,
  message TEXT NOT NULL,
  duration_ms INTEGER,
  screenshot_url TEXT,
  video_url TEXT,
  dom_snapshot_url TEXT,
  html_snapshot TEXT,
  console_log JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE automation_log DROP CONSTRAINT IF EXISTS automation_log_level_check;
ALTER TABLE automation_log ADD COLUMN IF NOT EXISTS duration_ms INTEGER;
ALTER TABLE automation_log ADD COLUMN IF NOT EXISTS html_snapshot TEXT;
ALTER TABLE automation_log ADD COLUMN IF NOT EXISTS console_log JSONB;
ALTER TABLE automation_log ALTER COLUMN level TYPE "LogLevel" USING upper(level::text)::"LogLevel";
CREATE INDEX IF NOT EXISTS idx_automation_log_session ON automation_log(session_id, created_at DESC);

CREATE TABLE IF NOT EXISTS ota_package (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  component "OtaComponent" NOT NULL,
  version TEXT NOT NULL,
  package_url TEXT NOT NULL,
  sha256 TEXT NOT NULL DEFAULT '',
  signature TEXT NOT NULL,
  status "OtaPackageStatus" NOT NULL DEFAULT 'DRAFT',
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (component, version)
);

ALTER TABLE ota_package DROP CONSTRAINT IF EXISTS ota_package_component_check;
ALTER TABLE ota_package ADD COLUMN IF NOT EXISTS sha256 TEXT NOT NULL DEFAULT '';
ALTER TABLE ota_package ADD COLUMN IF NOT EXISTS status "OtaPackageStatus" NOT NULL DEFAULT 'DRAFT';
ALTER TABLE ota_package ADD COLUMN IF NOT EXISTS metadata JSONB;
ALTER TABLE ota_package ALTER COLUMN component TYPE "OtaComponent" USING component::text::"OtaComponent";

CREATE TABLE IF NOT EXISTS ota_deployment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id UUID NOT NULL REFERENCES ota_package(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
  status "OtaDeploymentStatus" NOT NULL DEFAULT 'PENDING',
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  rollback_reason TEXT,
  health_check JSONB,
  UNIQUE (package_id, device_id)
);

CREATE TABLE IF NOT EXISTS ai_conversation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES automation_session(id) ON DELETE SET NULL,
  user_question TEXT NOT NULL,
  workflow_state JSONB,
  automation_error JSONB,
  assistant_instruction TEXT NOT NULL,
  next_action TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS system_config (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  is_secret BOOLEAN NOT NULL DEFAULT false,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS user_id UUID;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_type TEXT NOT NULL DEFAULT '';
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS entity_id TEXT;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE audit_log ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at DESC);

INSERT INTO system_config(key, value, is_secret)
VALUES
  ('ota.enabled', 'true'::jsonb, false),
  ('ota.rollback.enabled', 'true'::jsonb, false),
  ('session.timeout.minutes', '15'::jsonb, false),
  ('heartbeat.interval.seconds', '30'::jsonb, false),
  ('selector.priority', '["data-testid","aria-label","text","css","xpath","image"]'::jsonb, false)
ON CONFLICT (key) DO NOTHING;
