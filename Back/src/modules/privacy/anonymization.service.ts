import {
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  createCipheriv,
  createHash,
  createHmac,
  randomBytes,
} from 'node:crypto';
import { DataBaseService } from '../../database/database.service';
import {
  PrivacyContextService,
  PrivacySession,
} from './privacy-context.service';

type PiiType =
  | 'CUSTOMER'
  | 'VENDOR'
  | 'ORGANIZATION'
  | 'EMAIL'
  | 'PHONE'
  | 'ADDRESS'
  | 'IBAN'
  | 'BANK_ACCOUNT';

type Candidate = { type: PiiType; value: string };

type VaultRow = {
  token: string;
  value_ciphertext: string;
};

@Injectable()
export class AnonymizationService {
  constructor(
    private readonly db: DataBaseService,
    private readonly config: ConfigService,
    private readonly contexts: PrivacyContextService,
  ) {}

  async sanitizeOutbound<T>(payload: T): Promise<T> {
    const session = this.contexts.current();
    if (!session || !this.enabled()) return payload;
    await this.loadTenantDictionary(session);
    return (await this.transform(payload, (value) =>
      this.sanitizeText(value, session),
    )) as T;
  }

  async restoreInbound<T>(payload: T): Promise<T> {
    const session = this.contexts.current();
    if (!session || !this.enabled()) return payload;
    return (await this.transform(payload, async (value) => {
      let restored = value;
      for (const [token, original] of session.reverseTokens) {
        restored = restored.replaceAll(token, original);
      }
      return restored;
    })) as T;
  }

  private enabled() {
    return this.config.get<string>('DATA_ANONYMIZATION_ENABLED') !== 'false';
  }

  private async transform(
    value: unknown,
    transformText: (text: string) => Promise<string>,
  ): Promise<unknown> {
    if (typeof value === 'string') return transformText(value);
    if (Array.isArray(value)) {
      return Promise.all(value.map((item) => this.transform(item, transformText)));
    }
    if (value && typeof value === 'object') {
      const entries = await Promise.all(
        Object.entries(value).map(async ([key, item]) => [
          key,
          await this.transform(item, transformText),
        ]),
      );
      return Object.fromEntries(entries);
    }
    return value;
  }

  private async sanitizeText(text: string, session: PrivacySession) {
    if (!text.trim()) return text;
    const candidates = [
      ...this.structuredCandidates(text),
      ...[...session.replacements.keys()].map((value) => ({
        type: this.typeFromCachedToken(session.replacements.get(value)!),
        value,
      })),
    ];
    const unique = new Map<string, Candidate>();
    for (const candidate of candidates) {
      const value = candidate.value.trim();
      if (value.length < 3) continue;
      unique.set(`${candidate.type}:${this.normalize(value)}`, {
        ...candidate,
        value,
      });
    }

    let sanitized = text;
    const ordered = [...unique.values()].sort(
      (left, right) => right.value.length - left.value.length,
    );
    for (const candidate of ordered) {
      const token =
        session.replacements.get(candidate.value) ??
        (await this.tokenFor(session, candidate.type, candidate.value));
      sanitized = sanitized.replace(
        new RegExp(this.escapeRegex(candidate.value), 'giu'),
        token,
      );
    }
    return sanitized;
  }

  private async loadTenantDictionary(session: PrivacySession) {
    if (session.dictionaryLoaded) return;
    session.dictionaryLoaded = true;
    const schema = this.quoteSchema(session.schemaName);
    const [parties, bankAccounts, organizations] = await Promise.all([
      this.db.$queryRawUnsafe<
        Array<{
          entity_type: 'CUSTOMER' | 'VENDOR';
          name: string | null;
          email: string | null;
          phone: string | null;
          address: string | null;
        }>
      >(
        `SELECT 'CUSTOMER'::text AS entity_type, name, email, phone, address
         FROM ${schema}.customers
         UNION ALL
         SELECT 'VENDOR'::text, name, email, phone, address
         FROM ${schema}.vendors`,
      ),
      this.db.$queryRawUnsafe<Array<{ account_number: string | null }>>(
        `SELECT account_number FROM ${schema}.bank_accounts`,
      ),
      this.db.$queryRawUnsafe<Array<{ name: string }>>(
        `SELECT name FROM public.organizations WHERE id = $1::uuid`,
        session.organizationId,
      ),
    ]);

    const candidates: Candidate[] = [];
    for (const party of parties) {
      if (party.name) candidates.push({ type: party.entity_type, value: party.name });
      if (party.email) candidates.push({ type: 'EMAIL', value: party.email });
      if (party.phone) candidates.push({ type: 'PHONE', value: party.phone });
      if (party.address) candidates.push({ type: 'ADDRESS', value: party.address });
    }
    for (const account of bankAccounts) {
      if (account.account_number) {
        candidates.push({ type: 'BANK_ACCOUNT', value: account.account_number });
      }
    }
    for (const organization of organizations) {
      if (organization.name) {
        candidates.push({ type: 'ORGANIZATION', value: organization.name });
      }
    }
    await Promise.all(
      candidates.map(async (candidate) => {
        const token = await this.tokenFor(session, candidate.type, candidate.value);
        session.replacements.set(candidate.value, token);
      }),
    );
  }

  private structuredCandidates(text: string): Candidate[] {
    const candidates: Candidate[] = [];
    for (const match of text.matchAll(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g)) {
      candidates.push({ type: 'EMAIL', value: match[0] });
    }
    for (const match of text.matchAll(/\b[A-Z]{2}\d{2}[A-Z0-9]{11,30}\b/gi)) {
      candidates.push({ type: 'IBAN', value: match[0] });
    }
    for (const match of text.matchAll(/(?:\+?\d[\d\s().-]{8,}\d)/g)) {
      const digits = match[0].replace(/\D/g, '');
      if (digits.length >= 10 && digits.length <= 15) {
        candidates.push({ type: 'PHONE', value: match[0] });
      }
    }
    return candidates;
  }

  private async tokenFor(
    session: PrivacySession,
    type: PiiType,
    originalValue: string,
  ) {
    const normalized = this.normalize(originalValue);
    const cached = session.replacements.get(originalValue);
    if (cached) return cached;
    const key = this.masterKey();
    const fingerprint = createHmac('sha256', key)
      .update(`${session.organizationId}:${session.purpose}:${type}:${normalized}`)
      .digest('hex');
    const tokenId = createHmac('sha256', key)
      .update(`token:${session.organizationId}:${session.purpose}:${type}:${normalized}`)
      .digest('hex')
      .slice(0, 12)
      .toUpperCase();
    const generatedToken = `[${type}_${tokenId}]`;

    const rows = await this.db.$queryRawUnsafe<VaultRow[]>(
      `INSERT INTO public.pii_token_mappings
       (organization_id, entity_type, token, value_ciphertext,
        value_fingerprint, purpose_scope, key_version, last_used_at)
       VALUES ($1::uuid, $2, $3, $4, $5, $6, 1, now())
       ON CONFLICT (organization_id, entity_type, purpose_scope, value_fingerprint)
       DO UPDATE SET last_used_at = now()
       RETURNING token, value_ciphertext`,
      session.organizationId,
      type,
      generatedToken,
      this.encrypt(originalValue, key),
      fingerprint,
      session.purpose,
    );
    const token = rows[0]?.token ?? generatedToken;
    session.replacements.set(originalValue, token);
    session.reverseTokens.set(token, originalValue);
    return token;
  }

  private encrypt(value: string, key: Buffer) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, nonce);
    const ciphertext = Buffer.concat([
      cipher.update(value, 'utf8'),
      cipher.final(),
    ]);
    const tag = cipher.getAuthTag();
    return `v1:${nonce.toString('base64')}:${tag.toString('base64')}:${ciphertext.toString('base64')}`;
  }

  private masterKey() {
    const configured = this.config.get<string>('DATA_PRIVACY_MASTER_KEY');
    if (configured) {
      const decoded = /^[a-f0-9]{64}$/i.test(configured)
        ? Buffer.from(configured, 'hex')
        : Buffer.from(configured, 'base64');
      if (decoded.length === 32) return decoded;
      throw new ServiceUnavailableException(
        'DATA_PRIVACY_MASTER_KEY must be 32 bytes encoded as base64 or 64 hex characters',
      );
    }
    if (this.config.get<string>('NODE_ENV') === 'production') {
      throw new ServiceUnavailableException(
        'DATA_PRIVACY_MASTER_KEY is required when anonymization is enabled in production',
      );
    }
    const developmentSecret =
      this.config.get<string>('JWT_SECRET') ?? 'hesbtak-local-privacy-key';
    return createHash('sha256')
      .update(`development-only:${developmentSecret}`)
      .digest();
  }

  private normalize(value: string) {
    return value
      .normalize('NFKC')
      .replace(/[\u064B-\u065F\u0670]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLocaleLowerCase('en');
  }

  private quoteSchema(schemaName: string) {
    if (!/^tenant_[a-f0-9_]+$/.test(schemaName)) {
      throw new Error('Unsafe tenant schema name');
    }
    return `"${schemaName}"`;
  }

  private escapeRegex(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  private typeFromCachedToken(token: string): PiiType {
    const type = /^\[([A-Z_]+)_/.exec(token)?.[1] as PiiType | undefined;
    return type ?? 'ORGANIZATION';
  }
}
