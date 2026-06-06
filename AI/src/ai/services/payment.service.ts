import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { PAYMENT_PROMPT } from '../prompts/payment.prompt';

@Injectable()
export class PaymentService {
  constructor(private readonly configService: ConfigService) {}

  async proposePayment(data: any) {
    const response = await fetch(
      'https://router.huggingface.co/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.configService.get('HF_TOKEN')}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'meta-llama/Llama-3.3-70B-Instruct',
          temperature: 0,
          messages: [
            {
              role: 'user',
              content: `
${PAYMENT_PROMPT}

INPUT:

${JSON.stringify(data)}
`,
            },
          ],
        }),
      },
    );

    return response.json();
  }
}
