import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class AiLlmService {
  constructor(private readonly config: ConfigService) {}

  async visionJson(imageBase64: string, prompt: string): Promise<Record<string, unknown>> {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: 'Qwen/Qwen3-VL-235B-A22B-Instruct:novita',
        temperature: 0,
        max_tokens: 1200,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              { type: 'image_url', image_url: { url: imageBase64 } },
            ],
          },
        ],
      }),
    });

    return response.json() as Promise<Record<string, unknown>>;
  }

  async textJson(prompt: string, data: unknown): Promise<Record<string, unknown>> {
    const response = await fetch('https://router.huggingface.co/v1/chat/completions', {
      method: 'POST',
      headers: this.headers(),
      body: JSON.stringify({
        model: 'meta-llama/Llama-3.3-70B-Instruct',
        temperature: 0,
        messages: [
          {
            role: 'user',
            content: `${prompt}\n\nINPUT:\n\n${JSON.stringify(data)}`,
          },
        ],
      }),
    });

    return response.json() as Promise<Record<string, unknown>>;
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.config.get<string>('HF_TOKEN') ?? ''}`,
      'Content-Type': 'application/json',
    };
  }
}
