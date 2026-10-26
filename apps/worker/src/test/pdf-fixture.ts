/** PDF fixtures for the browser tests: small hand-built PDFs with a correct cross-reference table. */
/** A PDF whose pages are `pages` (size in pt and a content stream), with a correct cross-reference table. */
export function pdfOf(pages: { w: number; h: number; content: string }[]): string {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + 2 * i} 0 R`).join(' ')}] /Count ${pages.length} >>`];
  for (const [i, p] of pages.entries()) {
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${p.w} ${p.h}] /Contents ${4 + 2 * i} 0 R >>`);
    objects.push(`<< /Length ${p.content.length} >>\nstream\n${p.content}\nendstream`);
  }
  let out = '%PDF-1.4\n';
  const offsets = objects.map((o, i) => {
    const at = out.length;
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
    return at;
  });
  const xref = out.length;
  out += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('')}`;
  return `${out}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
}
/** N2: a one-page PDF (200 × 100 pt) with a filled rectangle. */
export const onePagePdf = () => pdfOf([{ w: 200, h: 100, content: '0 0.6 0.4 rg 20 20 160 60 re f' }]);
/** Q1: two pages — 200 × 100 pt green, then 120 × 160 pt blue. */
export const twoPagePdf = () => pdfOf([{ w: 200, h: 100, content: '0 0.6 0.4 rg 20 20 160 60 re f' }, { w: 120, h: 160, content: '0 0 1 rg 20 20 80 120 re f' }]);
