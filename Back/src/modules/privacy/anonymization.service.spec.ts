import { ConfigService } from '@nestjs/config';
import { AnonymizationService } from './anonymization.service';
import { PrivacyContextService } from './privacy-context.service';

describe('AnonymizationService', () => {
  function setup() {
    const storedCiphertexts: string[] = [];
    const db = {
      $queryRawUnsafe: jest.fn(
        async (sql: string, ...parameters: unknown[]) => {
          if (sql.includes("'CUSTOMER'::text")) {
            return [
              {
                entity_type: 'CUSTOMER',
                name: 'Ahmed Ali',
                email: 'ahmed@example.com',
                phone: '+20 100 123 4567',
                address: '12 Nile Street, Cairo',
              },
            ];
          }
          if (sql.includes('SELECT account_number')) return [];
          if (sql.includes('FROM public.organizations')) {
            return [{ name: 'Acme Egypt' }];
          }
          if (sql.includes('INSERT INTO public.pii_token_mappings')) {
            storedCiphertexts.push(String(parameters[3]));
            return [
              {
                token: String(parameters[2]),
                value_ciphertext: String(parameters[3]),
              },
            ];
          }
          return [];
        },
      ),
    };
    const contexts = new PrivacyContextService();
    const config = new ConfigService({
      NODE_ENV: 'test',
      JWT_SECRET: 'unit-test-secret',
      DATA_ANONYMIZATION_ENABLED: 'true',
    });
    const service = new AnonymizationService(
      db as never,
      config,
      contexts,
    );
    return { service, contexts, storedCiphertexts };
  }

  it('tokenizes tenant PII, preserves financial values, and restores provider output', async () => {
    const { service, contexts, storedCiphertexts } = setup();
    await contexts.run(
      {
        organizationId: '11111111-1111-1111-1111-111111111111',
        schemaName: 'tenant_11111111_1111_1111_1111_111111111111',
        purpose: 'ai_chat',
      },
      async () => {
        const original =
          'Ahmed Ali owes 15,000 EGP. Email ahmed@example.com or call +20 100 123 4567.';
        const sanitized = await service.sanitizeOutbound(original);

        expect(sanitized).not.toContain('Ahmed Ali');
        expect(sanitized).not.toContain('ahmed@example.com');
        expect(sanitized).not.toContain('+20 100 123 4567');
        expect(sanitized).toContain('[CUSTOMER_');
        expect(sanitized).toContain('[EMAIL_');
        expect(sanitized).toContain('15,000 EGP');
        expect(await service.restoreInbound(sanitized)).toBe(original);
      },
    );

    expect(storedCiphertexts.length).toBeGreaterThan(0);
    expect(storedCiphertexts.join(' ')).not.toContain('Ahmed Ali');
  });

  it('produces different stable tokens for different tenants', async () => {
    const { service, contexts } = setup();
    const sanitizeFor = (organizationId: string, schemaName: string) =>
      contexts.run(
        { organizationId, schemaName, purpose: 'ai_chat' },
        () => service.sanitizeOutbound('Ahmed Ali'),
      );

    const first = await sanitizeFor(
      '11111111-1111-1111-1111-111111111111',
      'tenant_11111111_1111_1111_1111_111111111111',
    );
    const repeated = await sanitizeFor(
      '11111111-1111-1111-1111-111111111111',
      'tenant_11111111_1111_1111_1111_111111111111',
    );
    const secondTenant = await sanitizeFor(
      '22222222-2222-2222-2222-222222222222',
      'tenant_22222222_2222_2222_2222_222222222222',
    );

    expect(repeated).toBe(first);
    expect(secondTenant).not.toBe(first);
  });
});
