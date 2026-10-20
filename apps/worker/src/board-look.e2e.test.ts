/**
 * T10.2 end to end: board design pass. An output still named after its size follows a preset / size change
 * (it used to keep the old "1080×1350 px" name); double-click renames it; hand edits show as a chip.
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

describe.skipIf(!adminUrl)('board look (T10.2)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Look');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const doc = ok(addOutput(p.doc, { id: 'o1', label: '1080×1350 px', size: { width: 1080, height: 1350, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const node = () => page.locator('.react-flow__node-outputNode[data-id="out:o1"]');
  const title = () => node().locator('.sc-node__title');
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });

  it('a size-named output follows a new size', async () => {
    await expect.poll(() => title().innerText()).toBe('1080×1350 px');
    await node().getByLabel('Width').fill('1200');
    await node().getByLabel('Width').press('Enter');
    await node().getByLabel('Height').fill('630');
    await node().getByLabel('Height').press('Enter');
    await expect.poll(() => title().innerText()).toBe('1200×630 px');
    await saved();
  }, 30_000);

  it('double-click renames; a typed name then stays when the size changes', async () => {
    await title().dblclick();
    await node().getByLabel('Output name').fill('Facebook ad');
    await node().getByLabel('Output name').press('Enter');
    await expect.poll(() => title().innerText()).toBe('Facebook ad');
    await node().getByLabel('Width').fill('1080');
    await node().getByLabel('Width').press('Enter');
    await saved();
    expect(await title().innerText()).toBe('Facebook ad');
    expect((await (await page.request.get(url)).json()).doc.outputs.find((o: { id: string }) => o.id === 'o1')?.label).toBe('Facebook ad');
  }, 30_000);

  it('the preset select stays inside the node', async () => {
    const n = await node().boundingBox();
    const s = await node().getByLabel('Preset').boundingBox();
    expect((s?.x ?? 0) + (s?.width ?? 0)).toBeLessThanOrEqual((n?.x ?? 0) + (n?.width ?? 0));
    if (process.env.T102_SHOT) await page.screenshot({ path: process.env.T102_SHOT });
  }, 30_000);
});
