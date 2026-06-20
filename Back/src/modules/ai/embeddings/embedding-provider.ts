import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InferenceClient } from '@huggingface/inference';
import { createHash } from 'crypto';
import { AnonymizationService } from '../../privacy/anonymization.service';

export interface EmbeddingProvider {
  embedMany(texts: string[]): Promise<number[][]>;
}

@Injectable()
export class EmbeddingProviderService implements EmbeddingProvider {
  readonly dimensions: number;
  private readonly provider: string;
  private readonly hfClient?: InferenceClient;

  constructor(
    private readonly config: ConfigService,
    private readonly anonymizer?: AnonymizationService,
  ) {
    this.dimensions = Math.min(
      Math.max(
        Number(this.config.get<string>('AI_EMBEDDING_DIMENSIONS')) || 2000,
        128,
      ),
      2000,
    );
    this.provider =
      this.config.get<string>('AI_EMBEDDING_PROVIDER') ?? 'mock';
    const token = this.config.get<string>('HF_TOKEN');
    if (this.provider === 'huggingface' && token) {
      this.hfClient = new InferenceClient(token);
    }
  }

  async embedMany(texts: string[]): Promise<number[][]> {
    const outboundTexts = this.anonymizer
      ? await this.anonymizer.sanitizeOutbound(texts)
      : texts;
    if (this.provider === 'mock') {
      return outboundTexts.map((text) => this.deterministicVector(text));
    }
    if (this.provider === 'tei') {
      return this.embedWithTei(outboundTexts);
    }
    if (!this.hfClient) {
      throw new ServiceUnavailableException(
        'HF_TOKEN is required when AI_EMBEDDING_PROVIDER=huggingface',
      );
    }

    try {
      const embeddings: number[][] = [];
      for (let offset = 0; offset < outboundTexts.length; offset += 16) {
        const batch = outboundTexts.slice(offset, offset + 16);
        const output = await this.hfClient.featureExtraction({
            model:
              this.config.get<string>('HF_EMBEDDING_MODEL') ??
              'Qwen/Qwen3-Embedding-8B',
            provider: 'hf-inference',
            inputs: batch,
          }) as unknown;
        const raw = output as number[] | number[][];
        const vectors =
          Array.isArray(raw[0]) ? (raw as number[][]) : [raw as number[]];
        embeddings.push(
          ...vectors.map((vector) => this.normalizeVector(Array.from(vector))),
        );
      }
      this.assertVectors(embeddings, outboundTexts.length);
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

  private async embedWithTei(texts: string[]) {
    const baseUrl = this.config
      .get<string>('AI_EMBEDDING_BASE_URL')
      ?.replace(/\/+$/, '');
    if (!baseUrl) {
      throw new ServiceUnavailableException(
        'AI_EMBEDDING_BASE_URL is required when AI_EMBEDDING_PROVIDER=tei',
      );
    }
    const token =
      this.config.get<string>('AI_EMBEDDING_API_KEY') ||
      this.config.get<string>('HF_TOKEN');
    const response = await fetch(`${baseUrl}/embed`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({
        inputs: texts,
        truncate: true,
        normalize: true,
      }),
    });
    if (!response.ok) {
      throw new ServiceUnavailableException(
        `TEI embedding request failed with status ${response.status}`,
      );
    }
    const output = (await response.json()) as number[][];
    const vectors = output.map((vector) => this.normalizeVector(vector));
    this.assertVectors(vectors, texts.length);
    return vectors;
  }

  private normalizeVector(vector: number[]) {
    const selected = vector.slice(0, this.dimensions);
    if (selected.length !== this.dimensions) return selected;
    const norm = Math.sqrt(
      selected.reduce((sum, value) => sum + value * value, 0),
    );
    return norm ? selected.map((value) => value / norm) : selected;
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
