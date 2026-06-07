import { qualifyTenantTables } from './tenant-sql';

describe('qualifyTenantTables', () => {
  it('qualifies unqualified tenant tables after FROM and JOIN', () => {
    expect(
      qualifyTenantTables(
        'SELECT v.name FROM vendors v JOIN vendor_bills b ON b.vendor_id = v.id LIMIT 10',
        'tenant_1234_abcd',
      ),
    ).toBe(
      'SELECT v.name FROM "tenant_1234_abcd"."vendors" v JOIN "tenant_1234_abcd"."vendor_bills" b ON b.vendor_id = v.id LIMIT 10',
    );
  });

  it('keeps already-qualified tenant tables unchanged', () => {
    const sql =
      'SELECT name FROM "tenant_1234_abcd"."vendors" ORDER BY name LIMIT 10';

    expect(qualifyTenantTables(sql, 'tenant_1234_abcd')).toBe(sql);
  });
});
