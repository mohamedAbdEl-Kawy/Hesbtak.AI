import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'node:async_hooks';

export type PrivacyPurpose =
  | 'ai_chat'
  | 'external_embeddings'
  | 'application_logs';

export type PrivacyRunContext = {
  organizationId: string;
  schemaName: string;
  purpose: PrivacyPurpose;
  userId?: string;
};

export type PrivacySession = PrivacyRunContext & {
  replacements: Map<string, string>;
  reverseTokens: Map<string, string>;
  dictionaryLoaded: boolean;
};

@Injectable()
export class PrivacyContextService {
  private readonly storage = new AsyncLocalStorage<PrivacySession>();

  run<T>(context: PrivacyRunContext, callback: () => Promise<T>): Promise<T> {
    return this.storage.run(
      {
        ...context,
        replacements: new Map(),
        reverseTokens: new Map(),
        dictionaryLoaded: false,
      },
      callback,
    );
  }

  current() {
    return this.storage.getStore();
  }
}
