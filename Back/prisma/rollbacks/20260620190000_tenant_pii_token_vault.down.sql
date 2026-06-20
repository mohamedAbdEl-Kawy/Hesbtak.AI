-- Development rollback for 20260620190000_tenant_pii_token_vault.
-- Back up the database first. This permanently deletes all token mappings.
DROP TABLE IF EXISTS public.pii_token_mappings;
