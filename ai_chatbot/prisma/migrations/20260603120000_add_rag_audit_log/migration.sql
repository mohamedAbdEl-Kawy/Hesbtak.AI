CREATE TABLE IF NOT EXISTS hesbetak_shared.rag_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT,
  actor_id TEXT,
  session_id TEXT,
  node_name TEXT NOT NULL,
  intent TEXT,
  workflow TEXT,
  sub_tier TEXT,
  input_summary JSONB NOT NULL DEFAULT '{}',
  output_summary JSONB NOT NULL DEFAULT '{}',
  pending_flags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_rag_audit_log_org_session
ON hesbetak_shared.rag_audit_log (org_slug, session_id, created_at DESC);
