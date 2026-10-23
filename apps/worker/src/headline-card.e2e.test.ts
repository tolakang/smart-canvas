/**
 * D44 end to end: a Headline card (Khmer / English). Added from the canvas menu, a picture dropped in each slot;
 * every output draws the language in use and switches with the card; each language keeps its own box. N3: more
 * pairs in the same node.
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

  it('the Headline node: a picture in each slot; the story draws Khmer only', async () => {
    // D49: every project starts with a Headline node.
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
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

  it('N3: "Add headline" adds a second Khmer / English pair to the node; "Use" covers both; it can be deleted', async () => {
    await card().getByRole('button', { name: 'Add headline' }).dispatchEvent('click');
    await card().getByRole('group', { name: 'Headline 2' }).waitFor();
    await saved();
    const second = languagePairs(await doc())[0]?.more?.[0];
    if (!second) throw new Error('no second pair');
    const pic = await sharp({ create: { width: 500, height: 100, channels: 3, background: { r: 30, g: 160, b: 60 } } }).png().toBuffer();
    await card().getByLabel('English headline 2 picture').setInputFiles({ name: 'en2.png', mimeType: 'image/png', buffer: pic });
    await card().getByRole('img', { name: 'English headline 2' }).waitFor();
    await saved();
    if (process.env.SC_SHOTS) await card().screenshot({ path: `${process.env.SC_SHOTS}/headline-two-pairs.png` });
    // English is in use: the story draws both English pictures, no Khmer one.
    const [pair] = languagePairs(await doc());
    await expect.poll(drawnInStory).toContain(second.en);
    expect(await drawnInStory()).toContain(pair?.en);
    expect(await drawnInStory()).not.toContain(second.km);
    page.once('dialog', (d) => void d.accept());
    await card().getByRole('button', { name: 'Delete headline 2' }).dispatchEvent('click');
    await card().getByRole('group', { name: 'Headline 2' }).waitFor({ state: 'detached' });
    await saved();
    const d = await doc();
    expect(languagePairs(d)[0]?.more).toBeUndefined();
    expect(d.sources.some((s) => s.id === second.km || s.id === second.en)).toBe(false);
  }, 60_000);
});
