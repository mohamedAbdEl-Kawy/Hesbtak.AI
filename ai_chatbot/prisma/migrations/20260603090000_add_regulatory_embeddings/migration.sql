CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.regulatory_embeddings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type TEXT NOT NULL,
  source_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  chunk_total INTEGER,
  chunk_text TEXT NOT NULL,
  embedding vector(1024),
  jurisdiction TEXT,
  industry TEXT,
  effective_date DATE,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  is_active BOOLEAN DEFAULT true,
  CONSTRAINT uq_reg_chunk UNIQUE (source_type, source_id, chunk_index)
);

CREATE INDEX IF NOT EXISTS idx_regulatory_embeddings_ivfflat
ON public.regulatory_embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

CREATE INDEX IF NOT EXISTS idx_regulatory_embeddings_scope
ON public.regulatory_embeddings (jurisdiction, industry);

CREATE INDEX IF NOT EXISTS idx_regulatory_embeddings_meta
ON public.regulatory_embeddings USING gin (metadata);
