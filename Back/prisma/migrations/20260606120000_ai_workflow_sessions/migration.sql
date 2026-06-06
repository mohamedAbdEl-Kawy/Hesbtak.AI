CREATE TABLE IF NOT EXISTS "workflow_sessions" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "organization_id" UUID NOT NULL,
  "created_by" UUID NOT NULL,
  "current_step" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "payload" JSONB NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "workflow_sessions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "workflow_sessions_organization_id_created_by_idx"
  ON "workflow_sessions"("organization_id", "created_by");

ALTER TABLE "workflow_sessions"
  ADD CONSTRAINT "workflow_sessions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "workflow_sessions"
  ADD CONSTRAINT "workflow_sessions_created_by_fkey"
  FOREIGN KEY ("created_by") REFERENCES "users"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
