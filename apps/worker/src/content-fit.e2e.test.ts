/**
 * T9.1 end to end (layout v2, D30): a gradient background and a badge on the master. In a wide banner and a 9:16
 * story the background covers everything and the badge grows to fill the space (v1 shrank it to the master's
 * contain scale: 210 px in the banner).
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

  it('the badge fills the free space: centred, as large as the cover scale allows', async () => {
    // Banner 1200×630: c = clamp(min(1137/990, 567/990), 0.21, 0.4) = 0.4 → 396 px tall (63% of 630), centred.
    const banner = await share('Banner', 'subject');
    expect(banner?.h).toBeCloseTo(396 / 630, 2);
    expect((banner?.x ?? 0) + (banner?.w ?? 0) / 2).toBeCloseTo(0.5, 2);
    // Story 1080×1920: c = 0.64 → 633.6 px wide (59% of 1080), centred.
    const story = await share('Story', 'subject');
    expect(story?.w).toBeCloseTo(633.6 / 1080, 2);
    expect((story?.y ?? 0) + (story?.h ?? 0) / 2).toBeCloseTo(0.5, 2);
  });
});
