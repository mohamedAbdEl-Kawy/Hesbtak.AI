import { ReportAttachmentService } from './report-attachment.service';

describe('ReportAttachmentService', () => {
  it('renders Markdown into a PDF buffer', async () => {
    const service = new ReportAttachmentService({} as never, {} as never);
    const render = (
      service as unknown as { render(markdown: string): Promise<Buffer> }
    ).render.bind(service);

    const pdf = await render(
      '# Financial Report\n\n## Summary\nRevenue is **1000 USD**.\n\n- Healthy cash flow',
    );

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
  });
});
