/**
 * T13.7 end to end: board groups. Select two outputs and press Ctrl+G: a frame named "Group 1" wraps them.
 * Rename it, drag it by its header (both move), collapse it (they hide), export it (only its outputs are
 * chosen), ungroup it (they stay).
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

describe.skipIf(!adminUrl)('board groups (T13.7)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Groups');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let doc = ok(addOutput(p.doc, { id: 'a', label: 'Story', size: { width: 1080, height: 1920, unit: 'px' }, board: { x: 500, y: -300 } }));
    doc = ok(addOutput(doc, { id: 'b', label: 'Post', size: { width: 1080, height: 1080, unit: 'px' }, board: { x: 500, y: 200 } }));
    doc = ok(addOutput(doc, { id: 'c', label: 'Banner', size: { width: 1200, height: 630, unit: 'px' }, board: { x: 900, y: 200 } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    await page.reload();
    await page.locator('.react-flow__node-outputNode[data-id="out:c"]').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const out = (id: string) => page.locator(`.react-flow__node-outputNode[data-id="out:${id}"]`);
  const frame = () => page.getByLabel(/^Group /).first();

  it('select two outputs, Ctrl+G: a named, coloured frame wraps them', async () => {
    await out('a').locator('.sc-node__title').click();
    await out('b').locator('.sc-node__title').click({ modifiers: ['Control'] });
    await page.keyboard.press('Control+g');
    await expect.poll(async () => (await doc()).groups).toEqual([{ id: expect.any(String), label: 'Group 1', color: 'blue', nodes: ['a', 'b'] }]);
    await frame().waitFor();
    const f = await frame().boundingBox();
    const a = await out('a').boundingBox();
    const b = await out('b').boundingBox();
    if (!f || !a || !b) throw new Error('not drawn');
    expect(f.x).toBeLessThan(a.x);
    expect(f.y).toBeLessThan(a.y);
    expect(f.y + f.height).toBeGreaterThan(b.y + b.height);
  }, 60_000);

  it('rename; drag by the header moves both; collapse hides them', async () => {
    await frame().locator('.sc-group__title').dblclick();
    await page.getByLabel('Group name').fill('Social');
    await page.getByLabel('Group name').press('Enter');
    await expect.poll(async () => (await doc()).groups?.[0]?.label).toBe('Social');

    const before = await doc();
    const head = await frame().locator('.sc-group__head').boundingBox();
    if (!head) throw new Error('no head');
    await page.mouse.move(head.x + 20, head.y + head.height / 2);
    await page.mouse.down();
    await page.mouse.move(head.x + 21, head.y + head.height / 2 + 1);
    await page.mouse.move(head.x + 20, head.y + head.height / 2 + 150, { steps: 10 });
    await page.mouse.up();
    await saved();
    const after = await doc();
    const dy = (id: string) => (after.outputs.find((o) => o.id === id)?.board.y ?? 0) - (before.outputs.find((o) => o.id === id)?.board.y ?? 0);
    expect(dy('a')).toBeGreaterThan(50);
    expect(dy('b')).toBeCloseTo(dy('a'), 0);
    expect(dy('c')).toBe(0);

    await page.getByRole('button', { name: 'Collapse group Social' }).click();
    await expect.poll(async () => (await doc()).groups?.[0]?.collapsed).toBe(true);
    await expect.poll(() => out('a').isVisible()).toBe(false);
    expect(await out('c').isVisible()).toBe(true);
    await page.getByRole('button', { name: 'Expand group Social' }).click();
    await out('a').waitFor();
  }, 60_000);

  it('export the group: only its outputs are chosen; ungroup keeps the nodes', async () => {
    await page.getByRole('button', { name: 'Export group Social' }).click();
    const dialog = page.getByRole('dialog');
    const box = (label: string) => dialog.locator('.sc-export__outputs label', { hasText: label }).locator('input');
    expect(await box('Story').isChecked()).toBe(true);
    expect(await box('Post').isChecked()).toBe(true);
    expect(await box('Banner').isChecked()).toBe(false);
    await dialog.getByRole('button', { name: 'Cancel' }).click();

    await page.getByRole('button', { name: 'Ungroup Social' }).click();
    await expect.poll(async () => (await doc()).groups).toBeUndefined();
    expect((await doc()).outputs).toHaveLength(3);
    expect(await page.getByLabel(/^Group /).count()).toBe(0);
  }, 60_000);
});
