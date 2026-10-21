/**
 * T9.1 end to end, layout v3 (D38, the stretched grid): a gradient background and a badge on the master. In a
 * wide banner and a 9:16 story the background covers everything; the badge keeps its look (scale k) and its
 * top-left corner stays on the same grid coordinate.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, setPlacement, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('content fit in outputs (T9.1)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1200 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Fit');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    const badge = await sharp({ create: { width: 400, height: 400, channels: 4, background: { r: 220, g: 40, b: 40, alpha: 1 } } }).png().toBuffer();
    const node = (l: string) => page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${l}$`) }) });
    await node('Subject').locator('input[type=file]').setInputFiles({ name: 'badge.png', mimeType: 'image/png', buffer: badge });
    await node('Subject').locator('img.sc-thumb').waitFor();
    for (const l of ['Background', 'Subject']) await page.getByRole('button', { name: `Connect ${l}`, exact: true }).click();
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
    // The badge in the top-left third of the master, like the screenshot; three outputs.
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = ok(setPlacement(p.doc, 'subject', { x: 0.1, y: 0.1, w: 0.33, h: 0.33 }));
    doc = ok(addOutput(doc, { id: 'banner', label: 'Banner', size: { width: 1200, height: 630, unit: 'px' } }));
    doc = ok(addOutput(doc, { id: 'story', label: 'Story', size: { width: 1080, height: 1920, unit: 'px' } }));
    doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 1080, height: 1350, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.getByLabel('Output Story', { exact: true }).locator('.sc-render [data-source-id="subject"]').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  /** A layer's box as fractions of the output thumbnail. */
  const share = (output: string, id: string) =>
    page
      .getByLabel(`Output ${output}`, { exact: true })
      .locator('.sc-render')
      .first()
      .evaluate((render, sourceId) => {
        const r = render.getBoundingClientRect();
        const b = render.querySelector(`[data-source-id="${sourceId}"]`)?.getBoundingClientRect();
        return b ? { x: (b.x - r.x) / r.width, y: (b.y - r.y) / r.height, w: b.width / r.width, h: b.height / r.height } : null;
      }, id);

  it('the background covers every output', async () => {
    for (const o of ['Banner', 'Story', 'Post']) {
      const b = await share(o, 'background');
      for (const [k, v] of Object.entries({ x: 0, y: 0, w: 1, h: 1 })) expect(b?.[k as keyof typeof b]).toBeCloseTo(v, 3);
    }
  });

  it('the badge stays on its grid coordinate (top-left at 10%, 10%), square, scaled by k', async () => {
    // Banner 1200×630: k = 0.21 → 207.9 px square at (120, 63).
    const banner = await share('Banner', 'subject');
    expect(banner?.x).toBeCloseTo(0.1, 2);
    expect(banner?.y).toBeCloseTo(0.1, 2);
    expect(banner?.h).toBeCloseTo(207.9 / 630, 2);
    expect(banner?.w).toBeCloseTo(207.9 / 1200, 2);
    // Story 1080×1920: k = 0.36 → 356.4 px square at (108, 192).
    const story = await share('Story', 'subject');
    expect(story?.x).toBeCloseTo(0.1, 2);
    expect(story?.y).toBeCloseTo(0.1, 2);
    expect(story?.w).toBeCloseTo(356.4 / 1080, 2);
    expect(story?.h).toBeCloseTo(356.4 / 1920, 2);
  });
});
