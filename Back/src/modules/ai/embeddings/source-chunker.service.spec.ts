import { BadRequestException } from '@nestjs/common';
import { SourceChunkerService } from './source-chunker.service';

describe('SourceChunkerService', () => {
  const service = new SourceChunkerService();

  it('chunks document sections and preserves citation metadata', () => {
    const chunks = service.build('uploaded_document', {
      title: 'Audit Report',
      document_type: 'audit_report',
      sections: {
        inventory_controls: 'Inventory approvals need stronger segregation.',
        receivables: 'Collections are reviewed monthly.',
      },
    });

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({
      chunkIndex: 0,
      metadata: {
        title: 'Audit Report',
        document_type: 'audit_report',
        section: 'inventory_controls',
      },
    });
    expect(chunks[0].text).toContain('Audit Report | inventory_controls');
  });

  it('rejects unapproved AI insights', () => {
    expect(() =>
      service.build('approved_insight', {
        title: 'Draft analysis',
        content: 'This has not been reviewed.',
        approved: false,
      }),
    ).toThrow(BadRequestException);
  });

  it('accepts explicitly approved insights', () => {
    const chunks = service.build('approved_insight', {
      title: 'Approved cash decision',
      content: 'Maintain a three-month operating cash reserve.',
      approved: true,
      author: 'finance-owner',
    });

    expect(chunks[0].metadata).toMatchObject({
      approved: true,
      author: 'finance-owner',
    });
  });
});
