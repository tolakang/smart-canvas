/**
 * T13.1 (D35) end to end: nodes show their layout health. A new project's Layer Comp lists wired
 * inputs that are still empty, in grey (D64); an output warns when its text can't fit; a disconnected output is grey.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, connectSource, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('layout health on nodes (T13.1)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Health');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = p.doc;
    // D49: a new project wires every asset node; only these three stay wired here.
    doc = { ...doc, edges: doc.edges.filter((e) => e.kind !== 'layer' || ['background', 'subject', 'headline'].includes(e.from)) };
    for (const id of ['background', 'subject', 'headline']) doc = ok(connectSource(doc, id));
    // A headline far too long for one line in a wide banner.
    doc = {
      ...doc,
      sources: doc.sources.map((s) => (s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'WWWWWWWW '.repeat(30).trim(), style: { ...s.content.style, maxLines: 1 } } } : s)),
    };
    doc = ok(addOutput(doc, { id: 'banner', label: 'Banner', size: { width: 1500, height: 500, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.locator('.react-flow__node-outputNode[data-id="out:banner"]').waitFor();
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const badge = (node: ReturnType<Page['locator']>) => node.locator('.sc-health');
  const main = () => page.locator('.react-flow__node-mainNode');
  const banner = () => page.locator('.react-flow__node-outputNode[data-id="out:banner"]');

  it('the Layer Comp shows a wired input with no file yet as a grey to-do, and lists it', async () => {
    await expect.poll(() => badge(main()).getAttribute('data-health')).toBe('empty');
    const btn = main().getByRole('button', { name: /^Layout health: 1 empty layer$/ });
    await btn.click();
    expect(await main().getByRole('list', { name: 'Layout issues' }).innerText()).toContain('Subject\nNo file or text yet');
    await page.keyboard.press('Escape');
    expect(await main().getByRole('list', { name: 'Layout issues' }).count()).toBe(0);
  }, 60_000);

  it('an output warns when its text cannot fit', async () => {
    await expect.poll(() => badge(banner()).getAttribute('data-health'), { timeout: 15_000 }).toBe('warning');
    await banner().locator('.sc-health__btn').click();
    const list = banner().getByRole('list', { name: 'Layout issues' });
    expect(await list.innerText()).toContain('Headline\nText does not fit, even at the smallest size');
  }, 60_000);

  it('a disconnected output with no issues shows grey (frozen)', async () => {
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    // Short text, and the empty Subject unwired: nothing left to warn about.
    const doc: ProjectDoc = {
      ...p.doc,
      sources: p.doc.sources.map((s) => (s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'Hi' } } : s)),
      edges: p.doc.edges.filter((e) => e.from !== 'subject'),
    };
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await expect.poll(() => badge(banner()).getAttribute('data-health'), { timeout: 15_000 }).toBe('ok');
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
    await banner().locator('.sc-node__title').click();
    await page.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: 'Disconnect' }).click();
    await expect.poll(() => badge(banner()).getAttribute('data-health')).toBe('frozen');
    expect(await banner().locator('.sc-health__btn').getAttribute('aria-label')).toMatch(/^Layout health: Frozen/);
  }, 60_000);
});
