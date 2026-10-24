/**
 * D64 project thumbnails: the board draws one Preview small after a save settles and stores it; the Projects home
 * shows it as the card's cover in place of the colour and letter.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('project thumbnails (D64)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1400, height: 900 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Thumbs');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = ok(addOutput(p.doc, { id: 'hd', label: 'HD', size: { width: 1920, height: 1080, unit: 'px' } }));
    // Some artwork: a blank board keeps its colour cover.
    const text = doc.sources.find((s) => s.content.kind === 'text' && s.visible);
    if (!text || text.content.kind !== 'text') throw new Error('no text input');
    doc = { ...doc, sources: doc.sources.map((s) => (s.id === text.id ? { ...s, content: { ...text.content, text: 'Summer Sale' } } : s)) };
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.locator('.react-flow__node-outputNode[data-id="out:hd"]').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  it('the board stores a picture of a Preview; the home card shows it', async () => {
    const stored = await page.waitForResponse((r) => r.url().endsWith('/thumbnail') && r.request().method() === 'PUT', { timeout: 30_000 });
    expect(stored.status()).toBe(200);
    const img = await page.request.get(`${url}/thumbnail`);
    expect(img.headers()['content-type']).toBe('image/jpeg');
    expect((await img.body()).length).toBeGreaterThan(500);

    await page.getByRole('button', { name: 'Back to projects' }).click();
    const card = page.locator('li[data-project="Thumbs"]');
    const cover = card.locator('.sc-tile--thumb img');
    await cover.waitFor();
    await expect.poll(() => cover.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth)).toBe(640);
    expect(await card.getByRole('button', { name: 'Thumbs', exact: true }).count()).toBe(1);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/home-thumbnails.png` });
  }, 60_000);
});
