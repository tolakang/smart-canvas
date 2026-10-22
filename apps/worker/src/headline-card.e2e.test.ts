/**
 * D44 end to end: a Headline card (Khmer / English). Added from the canvas menu, a picture dropped in each slot;
 * every output draws the language in use and switches with the card; each language keeps its own box.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, languagePairs, mainComposition, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('Headline card: Khmer / English (D44)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Headlines');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const cur = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    expect((await page.request.put(url, { data: { rev: cur.rev, doc: ok(addOutput(cur.doc, { id: 'story', label: 'Story', size: { width: 1080, height: 1920, unit: 'px' } })) } })).status()).toBe(200);
    await page.reload();
    await page.getByLabel('Output Story', { exact: true }).waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = async () => {
    await page.waitForTimeout(150);
    await page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  };
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const card = () => page.locator('.react-flow__node-headlineNode').first();
  const drawnInStory = () => page.getByLabel('Output Story', { exact: true }).locator('.sc-render').first().evaluate((r) => [...r.querySelectorAll('[data-source-id]')].map((e) => e.getAttribute('data-source-id')));

  it('add a Headline card; a picture in each slot; the story draws Khmer only', async () => {
    const spot = await page.evaluate(() => {
      const p = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!p) return null;
      for (let y = p.bottom - 200; y > p.top; y -= 40)
        for (let x = p.left + 340; x < p.right - 300; x += 40) if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
      return null;
    });
    if (!spot) throw new Error('no empty spot');
    await page.mouse.click(spot.x, spot.y, { button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Headline (Khmer / English)' }).click();
    await card().waitFor();
    const pic = (r: number, g: number, b: number, w: number) => sharp({ create: { width: w, height: 100, channels: 3, background: { r, g, b } } }).png().toBuffer();
    await card().getByLabel('Khmer headline picture').setInputFiles({ name: 'km.png', mimeType: 'image/png', buffer: await pic(200, 30, 30, 400) });
    await card().getByRole('img', { name: 'Khmer headline' }).waitFor();
    await card().getByLabel('English headline picture').setInputFiles({ name: 'en.png', mimeType: 'image/png', buffer: await pic(30, 30, 200, 600) });
    await card().getByRole('img', { name: 'English headline' }).waitFor();
    await saved();
    const d = await doc();
    const [pair] = languagePairs(d);
    if (!pair) throw new Error('no card');
    expect(pair.use).toBe('km');
    await expect.poll(drawnInStory).toContain(pair.km);
    expect(await drawnInStory()).not.toContain(pair.en);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/headline-card.png` });
  }, 90_000);

  it('switching the card to English swaps every output; each language keeps its own box', async () => {
    const before = await doc();
    const [pair] = languagePairs(before);
    if (!pair) throw new Error('no card');
    // The card sits low on this canvas, under the toolbar: click the switch without a pointer.
    await card().getByRole('radiogroup').getByText('English', { exact: true }).dispatchEvent('click');
    await saved();
    await expect.poll(drawnInStory).toContain(pair.en);
    expect(await drawnInStory()).not.toContain(pair.km);
    const d = await doc();
    expect(languagePairs(d)[0]?.use).toBe('en');
    // Each fitted to its own picture: the English one (6:1) is wider than the Khmer one (4:1).
    const p = mainComposition(d).placements;
    const ratio = (id: string) => ((p[id]?.w ?? 0) / (p[id]?.h ?? 1));
    await expect.poll(async () => {
      const q = mainComposition(await doc()).placements;
      return (q[pair.en]?.w ?? 0) / (q[pair.en]?.h ?? 1) > (q[pair.km]?.w ?? 0) / (q[pair.km]?.h ?? 1);
    }).toBe(true);
    expect(ratio(pair.en)).toBeGreaterThan(0);
  }, 60_000);
});
