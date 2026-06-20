import { Logger } from '@nestjs/common';
import { StateType } from './state/graph-state';

const logger = new Logger('ChatbotTrace');

export function aiTrace(
  state: Partial<StateType>,
  event: string,
  details: Record<string, unknown> = {},
) {
  logger.log(
    `[AI_TRACE] ${JSON.stringify({
      traceId: state.traceId ?? 'untracked',
      event,
      ...details,
    })}`,
  );
}

export function aiTraceWarn(
  state: Partial<StateType>,
  event: string,
  details: Record<string, unknown> = {},
) {
  logger.warn(
    `[AI_TRACE] ${JSON.stringify({
      traceId: state.traceId ?? 'untracked',
      event,
      ...details,
    })}`,
  );
}

export function summarizeText(value?: string, maxLength = 120) {
  if (!value) return '';
  return `[redacted-text length=${Math.min(value.length, maxLength)}${value.length > maxLength ? '+' : ''}]`;
}

export function errorSummary(error: unknown) {
  const value = error instanceof Error
    ? `${error.name}: ${error.message}`
    : String(error);
  return value
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, '[EMAIL_REDACTED]')
    .replace(/(?:\+?\d[\d\s().-]{8,}\d)/g, '[PHONE_REDACTED]')
    .replace(/\[[A-Z_]+_[A-F0-9]{8,}\]/g, '[PII_TOKEN]')
    .slice(0, 240);
}
