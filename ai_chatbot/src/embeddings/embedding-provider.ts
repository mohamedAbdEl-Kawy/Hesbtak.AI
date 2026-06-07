import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InferenceClient } from '@huggingface/inference';

export interface EmbeddingProvider {
  embedMany(texts: string[]): Promise<number[][]>;
}

@Injectable()
export class EmbeddingProviderService implements EmbeddingProvider {
  private readonly dimensions: number;
  private readonly hfClient: InferenceClient;

  constructor(private readonly config: ConfigService) {
    console.log("HF TOKEN:", process.env.HF_TOKEN);
    this.hfClient = new InferenceClient(
      this.config.get<string>('HF_TOKEN'),
    );

    // BGE Large = 1024 dimensions
    this.dimensions = 1024;
  }

  async embedMany(texts: string[]): Promise<number[][]> {

    return this.embedViaHuggingFace(texts);



  }

  private async embedViaHuggingFace(
    texts: string[],
  ): Promise<number[][]> {
    try {
      const embeddings = await Promise.all(
        texts.map(async (text) => {
          const vector = await this.hfClient.featureExtraction({
            model: 'BAAI/bge-m3',
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
        `Failed to generate embeddings: ${error}`,
      );
    }
  }



  private assertVectors(
    vectors: number[][],
    expectedCount: number,
  ) {
    if (
      !Array.isArray(vectors) ||
      vectors.length !== expectedCount
    ) {
      throw new ServiceUnavailableException(
        'Invalid embedding batch size',
      );
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