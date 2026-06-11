import { BadRequestException, Injectable } from '@nestjs/common';
import { SourceType } from './dto/ingest-source.dto';
import { EmbeddingChunkDto } from './dto/upsert-embeddings.dto';

@Injectable()
export class SourceChunkerService {
  build(
    sourceType: SourceType,
    payload: Record<string, unknown>,
  ): EmbeddingChunkDto[] {
    if (sourceType === 'approved_insight' && payload.approved !== true) {
      throw new BadRequestException(
        'approved_insight requires payload.approved=true',
      );
    }

    const metadata = this.metadata(sourceType, payload);
    const sections = this.sections(payload);
    const chunks =
      sections.length > 0
        ? sections.flatMap(({ section, text }) =>
            this.windowText(text).map((chunkText) => ({
              text: this.withHeader(payload, section, chunkText),
              metadata: { ...metadata, section },
            })),
          )
        : this.windowText(this.content(payload)).map((text) => ({
            text: this.withHeader(payload, undefined, text),
            metadata,
          }));

    return chunks.map((chunk, chunkIndex) => ({ chunkIndex, ...chunk }));
  }

  private sections(payload: Record<string, unknown>) {
    const sections = this.asRecord(payload.sections);
    if (!sections) return [];

    return Object.entries(sections)
      .filter(([, value]) => value !== undefined && value !== null)
      .map(([section, value]) => ({
        section,
        text:
          typeof value === 'string'
            ? value
            : JSON.stringify(value, null, 2),
      }))
      .filter(({ text }) => text.trim().length > 0);
  }

  private content(payload: Record<string, unknown>) {
    const value =
      payload.content ??
      payload.body ??
      payload.extracted_text ??
      payload.commentary ??
      payload.text;

    if (typeof value !== 'string' || !value.trim()) {
      throw new BadRequestException(
        'RAG payload requires content, body, extracted_text, commentary, text, or sections',
      );
    }
    return value;
  }

  private withHeader(
    payload: Record<string, unknown>,
    section: string | undefined,
    text: string,
  ) {
    const title =
      typeof payload.title === 'string' && payload.title.trim()
        ? payload.title.trim()
        : 'Untitled source';
    return `${title}${section ? ` | ${section}` : ''}\n${text}`;
  }

  private metadata(
    sourceType: SourceType,
    payload: Record<string, unknown>,
  ): Record<string, unknown> {
    const metadata = this.asRecord(payload.metadata) ?? {};
    const allowed = [
      'title',
      'document_type',
      'section',
      'period_start',
      'period_end',
      'effective_date',
      'created_at',
      'author',
      'approved',
    ];

    return allowed.reduce<Record<string, unknown>>(
      (result, key) =>
        payload[key] === undefined
          ? result
          : { ...result, [key]: payload[key] },
      { ...metadata, source_type: sourceType },
    );
  }

  private windowText(text: string, size = 350, overlap = 50): string[] {
    const words = text.trim().split(/\s+/).filter(Boolean);
    const chunks: string[] = [];
    for (let start = 0; start < words.length; start += size - overlap) {
      chunks.push(words.slice(start, start + size).join(' '));
      if (start + size >= words.length) break;
    }
    return chunks;
  }

  private asRecord(value: unknown): Record<string, unknown> | undefined {
    return typeof value === 'object' && value !== null && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : undefined;
  }
}
