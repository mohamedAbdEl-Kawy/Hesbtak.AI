import { ConfigService } from '@nestjs/config';
import type Groq from 'groq-sdk';

export type LlmProvider = 'groq' | 'openai' | 'huggingface';
export type LlmClient = Pick<Groq, 'chat'>;

export type LlmPrivacyBoundary = {
  sanitizeOutbound<T>(payload: T): Promise<T>;
  restoreInbound<T>(payload: T): Promise<T>;
};

const MODEL_ROLES = {
  CHATTING_AGENT: 'hesbetak:chatting',
  ORCHESTRATOR_AGENT: 'hesbetak:orchestrator',
  DATABASE_SEARCH_AGENT: 'hesbetak:database-search',
  FINANCIAL_REASONING_AGENT: 'hesbetak:financial-reasoning',
  REPORT_GENERATION_AGENT: 'hesbetak:report-generation',
  REVENUE_ACCOUNT_AGENT: 'hesbetak:revenue-account',
  EXPENSE_ACCOUNT_AGENT: 'hesbetak:expense-account',
} as const;

export const LLM_MODELS = MODEL_ROLES;

const PROVIDER_DEFAULTS: Record<
  LlmProvider,
  { baseUrl: string; model: string; apiKeyEnv: string }
> = {
  groq: {
    baseUrl: 'https://api.groq.com/openai/v1',
    model: 'openai/gpt-oss-120b',
    apiKeyEnv: 'GROQ_API_KEY',
  },
  openai: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4.1-mini',
    apiKeyEnv: 'OPENAI_API_KEY',
  },
  huggingface: {
    baseUrl: 'https://router.huggingface.co/v1',
    model: 'openai/gpt-oss-20b',
    apiKeyEnv: 'HF_TOKEN',
  },
};

export function getLlmProvider(config: ConfigService): LlmProvider {
  const value = (
    config.get<string>('AI_LLM_PROVIDER') ??
    process.env.AI_LLM_PROVIDER ??
    'groq'
  ).toLowerCase();

  if (value === 'openai' || value === 'huggingface' || value === 'groq') {
    return value;
  }
  throw new Error(
    `Unsupported AI_LLM_PROVIDER "${value}". Use groq, openai, or huggingface.`,
  );
}

export function hasLlmConfiguration(config: ConfigService): boolean {
  const provider = getLlmProvider(config);
  return Boolean(readConfig(config, PROVIDER_DEFAULTS[provider].apiKeyEnv));
}

export function getLlmClient(
  config: ConfigService,
  privacy?: LlmPrivacyBoundary,
): LlmClient {
  const provider = getLlmProvider(config);
  const defaults = PROVIDER_DEFAULTS[provider];
  const apiKey =
    readConfig(config, defaults.apiKeyEnv) || 'not-configured';
  const baseUrl = (
    readConfig(config, `${provider.toUpperCase()}_BASE_URL`) ??
    readConfig(config, 'AI_LLM_BASE_URL') ??
    defaults.baseUrl
  ).replace(/\/+$/, '');

  const create = async (request: Record<string, unknown>) => {
    const resolvedRequest = {
      ...request,
      model: resolveModel(config, provider, String(request.model ?? '')),
    };
    const outboundRequest = privacy
      ? await privacy.sanitizeOutbound(resolvedRequest)
      : resolvedRequest;
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(outboundRequest),
    });
    const body = await response.text();
    if (!response.ok) {
      throw new Error(
        `${provider} chat completion failed with status ${response.status}`,
      );
    }
    const parsed = JSON.parse(body) as unknown;
    return privacy ? privacy.restoreInbound(parsed) : parsed;
  };

  // All configured providers expose the OpenAI-compatible chat-completions
  // shape used by the existing agents.
  return {
    chat: {
      completions: { create },
    },
  } as unknown as LlmClient;
}

function resolveModel(
  config: ConfigService,
  provider: LlmProvider,
  requestedModel: string,
) {
  const roleEnv = roleEnvironmentVariable(requestedModel);
  return (
    (roleEnv ? readConfig(config, `${provider.toUpperCase()}_${roleEnv}`) : '') ||
    readConfig(config, `${provider.toUpperCase()}_CHAT_MODEL`) ||
    readConfig(config, 'AI_LLM_MODEL') ||
    PROVIDER_DEFAULTS[provider].model
  );
}

function roleEnvironmentVariable(model: string) {
  const roles: Record<string, string> = {
    [MODEL_ROLES.CHATTING_AGENT]: 'CHATTING_MODEL',
    [MODEL_ROLES.ORCHESTRATOR_AGENT]: 'ORCHESTRATOR_MODEL',
    [MODEL_ROLES.DATABASE_SEARCH_AGENT]: 'DATABASE_SEARCH_MODEL',
    [MODEL_ROLES.FINANCIAL_REASONING_AGENT]: 'FINANCIAL_REASONING_MODEL',
    [MODEL_ROLES.REPORT_GENERATION_AGENT]: 'REPORT_GENERATION_MODEL',
    [MODEL_ROLES.REVENUE_ACCOUNT_AGENT]: 'REVENUE_ACCOUNT_MODEL',
    [MODEL_ROLES.EXPENSE_ACCOUNT_AGENT]: 'EXPENSE_ACCOUNT_MODEL',
  };
  return roles[model];
}

function readConfig(config: ConfigService, key: string) {
  return config.get<string>(key) || process.env[key];
}
