/**
 * N4 end to end: a Preset node added by right-click on top of other nodes lands clear of them, its Previews too;
 * "Tidy board" lays the board out (asset row, group under it, Preset nodes under the group with their Previews to
 * the right) in one undo step.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

type Box = { x: number; y: number; width: number; height: number };

describe.skipIf(!adminUrl)('Preset placement and Tidy board (N4)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1700, height: 1100 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Placement');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const fit = async () => {
    await page.getByRole('button', { name: 'Fit to screen (Shift+1)' }).click();
    await page.waitForTimeout(300);
  };
  /** Every visible node's box on screen, by node id. */
  const boxes = () =>
    page.evaluate(() =>
      [...document.querySelectorAll<HTMLElement>('.react-flow__node')]
        .filter((n) => n.offsetParent !== null)
        .map((n) => {
          const r = n.getBoundingClientRect();
          return { id: n.dataset.id ?? '', x: r.x, y: r.y, width: r.width, height: r.height };
        }),
    );
  const overlap = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

  it('a GDN Preset node right-clicked onto the Layer Comp group lands clear of it — node and Previews', async () => {
    await fit();
    const group = await page.locator('.react-flow__node-mainNode').boundingBox();
    if (!group) throw new Error('no group');
    // Right-click the empty canvas just left of the group: a Preset node (with its Previews) put there would cover it.
    const item = page.getByRole('menu').getByRole('menuitem', { name: 'GDN preset (7 sizes)' });
    await expect
      .poll(async () => {
        if (await page.getByRole('menu').count()) await page.keyboard.press('Escape');
        await page.mouse.click(group.x - 12, group.y + 20, { button: 'right' });
        await page.getByRole('menu').waitFor();
        return item.count();
      }, { timeout: 20_000 })
      .toBe(1);
    await item.click();
    await page.locator('.react-flow__node-presetNode').waitFor();
    await saved();
    await fit();
    const all = await boxes();
    const set = (await doc()).presetSets?.[0];
    const mine = new Set([`set:${set?.id}`, ...(set?.outputs ?? []).map((o) => `out:${o}`)]);
    const placed = all.filter((b) => mine.has(b.id));
    expect(placed.length).toBe(8);
    for (const p of placed) for (const other of all.filter((b) => !mine.has(b.id))) expect(overlap(p, other), `${p.id} on ${other.id}`).toBe(false);
  }, 90_000);

  it('Tidy board: asset row, group under it, Preset node under the group, its Previews to the right; one undo puts it back', async () => {
    const before = await doc();
    await page.getByRole('button', { name: 'Tidy board' }).click();
    await saved();
    const d = await doc();
    const main = d.compositions.find((c) => c.id === 'main');
    const set = d.presetSets?.[0];
    const top = Math.max(...(d.stacks ?? []).map((s) => s.board.y), ...(d.headlines ?? []).map((h) => h.board.y));
    expect(new Set([...(d.stacks ?? []).map((s) => s.board.y), ...(d.headlines ?? []).map((h) => h.board.y)]).size).toBe(1);
    expect(main?.board.y).toBeGreaterThan(top);
    expect(set?.board.x).toBe(main?.board.x);
    expect(set?.board.y).toBeGreaterThan(main?.board.y ?? 0);
    const previews = (set?.outputs ?? []).map((o) => d.outputs.find((x) => x.id === o)?.board);
    for (const p of previews) expect(p?.x).toBeGreaterThan(set?.board.x ?? 0);
    expect(previews.map((p) => p?.y)).toEqual([...previews.map((p) => p?.y ?? 0)].sort((a, b) => a - b));
    await fit();
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/tidy-board.png` });
    const all = await boxes();
    for (const [i, a] of all.entries()) for (const b of all.slice(i + 1)) expect(overlap(a, b), `${a.id} on ${b.id}`).toBe(false);

    await page.locator('.react-flow__pane').click({ position: { x: 5, y: 5 } });
    await page.keyboard.press('Control+z');
    await saved();
    await expect.poll(async () => (await doc()).presetSets?.[0]?.board).toEqual(before.presetSets?.[0]?.board);
  }, 60_000);
});
