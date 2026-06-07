CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE SCHEMA IF NOT EXISTS hesbetak_shared;

CREATE TABLE IF NOT EXISTS hesbetak_shared.organizations (
  org_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_slug TEXT UNIQUE NOT NULL,
  schema_name TEXT UNIQUE NOT NULL,
  plan TEXT NOT NULL DEFAULT 'starter',
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true
);
