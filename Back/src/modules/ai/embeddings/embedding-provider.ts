import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InferenceClient } from '@huggingface/inference';
import { createHash } from 'crypto';

export interface EmbeddingProvider {
  embedMany(texts: string[]): Promise<number[][]>;
}

@Injectable()
export class EmbeddingProviderService implements EmbeddingProvider {
  private readonly dimensions = 1024;
  private readonly provider: string;
  private readonly hfClient?: InferenceClient;

  constructor(private readonly config: ConfigService) {
    this.provider =
      this.config.get<string>('AI_EMBEDDING_PROVIDER') ?? 'mock';
    const token = this.config.get<string>('HF_TOKEN');
    if (this.provider === 'huggingface' && token) {
      this.hfClient = new InferenceClient(token);
    }
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    if (this.provider === 'mock') {
      return texts.map((text) => this.deterministicVector(text));
    }
    if (!this.hfClient) {
      throw new ServiceUnavailableException(
        'HF_TOKEN is required when AI_EMBEDDING_PROVIDER=huggingface',
      );
    }

    try {
      const embeddings = await Promise.all(
        texts.map(async (text) => {
          const vector = await this.hfClient!.featureExtraction({
            model:
              this.config.get<string>('HF_EMBEDDING_MODEL') ?? 'BAAI/bge-m3',
            provider: 'hf-inference',
            inputs: text,
          });
          return Array.from(vector as number[]);
        }),
      );
      this.assertVectors(embeddings, texts.length);
      return embeddings;
    } catch (error) {
      throw new ServiceUnavailableException(
        `Failed to generate embeddings: ${String(error)}`,
      );
    }
  }

  private deterministicVector(text: string): number[] {
    const vector = Array.from({ length: this.dimensions }, () => 0);
    const words = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const word of words) {
      const digest = createHash('sha256').update(word).digest();
      const index = digest.readUInt32BE(0) % this.dimensions;
      vector[index] += digest[4] % 2 === 0 ? 1 : -1;
    }
    const norm = Math.sqrt(
      vector.reduce((sum, value) => sum + value * value, 0),
    );
    return norm ? vector.map((value) => value / norm) : vector;
  }

  private assertVectors(vectors: number[][], expectedCount: number) {
    if (!Array.isArray(vectors) || vectors.length !== expectedCount) {
      throw new ServiceUnavailableException('Invalid embedding batch size');
    }
    for (const vector of vectors) {
      if (
        !Array.isArray(vector) ||
        vector.length !== this.dimensions ||
        vector.some((value) => !Number.isFinite(value))
      ) {
        throw new ServiceUnavailableException(
          `Expected ${this.dimensions}-dimension vectors`,
        );
      }
    }
  }
}
