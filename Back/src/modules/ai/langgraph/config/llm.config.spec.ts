import { ConfigService } from '@nestjs/config';
import {
  getLlmClient,
  getLlmProvider,
  hasLlmConfiguration,
  LLM_MODELS,
} from './llm.config';

describe('LLM provider configuration', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('selects OpenAI and resolves its configured model', async () => {
    const config = new ConfigService({
      AI_LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
      OPENAI_CHAT_MODEL: 'gpt-test',
    });
    const fetchMock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify({ choices: [{ message: { content: 'ok' } }] }),
          { status: 200 },
        ),
      );

    expect(getLlmProvider(config)).toBe('openai');
    expect(hasLlmConfiguration(config)).toBe(true);

    await getLlmClient(config).chat.completions.create({
      model: LLM_MODELS.CHATTING_AGENT,
      messages: [{ role: 'user', content: 'hello' }],
    });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({
        body: expect.stringContaining('"model":"gpt-test"'),
      }),
    );
  });

  it('rejects unsupported providers', () => {
    const config = new ConfigService({ AI_LLM_PROVIDER: 'invalid' });
    expect(() => getLlmProvider(config)).toThrow('Unsupported AI_LLM_PROVIDER');
  });

  it('sanitizes outbound requests and restores inbound responses through the privacy boundary', async () => {
    const config = new ConfigService({
      AI_LLM_PROVIDER: 'openai',
      OPENAI_API_KEY: 'test-key',
    });
    const sanitizeOutbound = jest.fn(async (request: unknown) => ({
      ...(request as Record<string, unknown>),
      messages: [{ role: 'user', content: '[CUSTOMER_SAFE]' }],
    }));
    const restoreInbound = jest.fn(async (_response: unknown) => ({
      choices: [{ message: { content: 'Ahmed Ali' } }],
    }));
    const privacy = {
      sanitizeOutbound: <T>(request: T) => sanitizeOutbound(request) as Promise<T>,
      restoreInbound: <T>(response: T) => restoreInbound(response) as Promise<T>,
    };
    const fetchMock = jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '[CUSTOMER_SAFE]' } }],
        }),
        { status: 200 },
      ),
    );

    const response = await getLlmClient(config, privacy).chat.completions.create({
      model: LLM_MODELS.CHATTING_AGENT,
      messages: [{ role: 'user', content: 'Ahmed Ali' }],
    });

    expect(sanitizeOutbound).toHaveBeenCalled();
    expect(String(fetchMock.mock.calls[0][1]?.body)).not.toContain('Ahmed Ali');
    expect(String(fetchMock.mock.calls[0][1]?.body)).toContain('[CUSTOMER_SAFE]');
    expect(restoreInbound).toHaveBeenCalled();
    expect(response.choices[0]?.message?.content).toBe('Ahmed Ali');
  });
});
