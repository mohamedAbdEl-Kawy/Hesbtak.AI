export const TENANT_SQL_TABLES = [
  'accounts',
  'customers',
  'vendors',
  'bank_accounts',
  'journal_entries',
  'journal_lines',
  'invoices',
  'customer_payments',
  'vendor_bills',
  'vendor_payments',
  'forecasts',
  'alerts',
] as const;

export function qualifyTenantTables(sql: string, schemaName: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(schemaName)) {
    throw new Error('Invalid tenant schema');
  }
  const schema = `"${schemaName}"`;
  const tablePattern = TENANT_SQL_TABLES.join('|');
  return sql.replace(
    new RegExp(
      `\\b(FROM|JOIN)\\s+(?!["a-zA-Z_][a-zA-Z0-9_]*" ?\\.)(?:"?(${tablePattern})"?)\\b`,
      'gi',
    ),
    (_match, keyword: string, table: string) =>
      `${keyword} ${schema}."${table.toLowerCase()}"`,
  );
}
