CREATE TABLE IF NOT EXISTS "pii_token_mappings" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "entity_type" VARCHAR(40) NOT NULL,
  "token" VARCHAR(80) NOT NULL,
  "value_ciphertext" TEXT NOT NULL,
  "value_fingerprint" VARCHAR(64) NOT NULL,
  "purpose_scope" VARCHAR(60) NOT NULL,
  "key_version" INTEGER NOT NULL DEFAULT 1,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "last_used_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expires_at" TIMESTAMPTZ,
  CONSTRAINT "pii_token_mappings_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "pii_token_mappings_organization_id_fkey"
    FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "pii_token_mappings_tenant_token_key"
  ON "pii_token_mappings"("organization_id", "token");

CREATE UNIQUE INDEX "pii_token_mappings_tenant_value_key"
  ON "pii_token_mappings"(
    "organization_id",
    "entity_type",
    "purpose_scope",
    "value_fingerprint"
  );

CREATE INDEX "pii_token_mappings_expiry_idx"
  ON "pii_token_mappings"("expires_at")
  WHERE "expires_at" IS NOT NULL;

COMMENT ON TABLE "pii_token_mappings" IS
  'Encrypted, tenant-scoped PII token vault. Never expose to tenant SQL agents.';
