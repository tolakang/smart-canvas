/**
 * D47 end to end: a Core Rule node from the canvas menu shows how the master preview adapts — its layer comp
 * groups, its preset guides (and adds the missing ones), and each layer's auto layout rule.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { connectSource, type ProjectDoc } from '@smart-canvas/core';
import type { Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('Core Rule node (D47)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1920, height: 1200 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Rules');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
    // The four default inputs wired into the master preview.
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    let d = p.doc;
    for (const id of ['logo', 'headline', 'subject', 'background']) {
      const r = connectSource(d, id);
      if (r.ok) d = r.doc;
    }
    expect((await page.request.put(url, { data: { rev: p.rev, doc: d } })).status()).toBe(200);
    await page.reload();
    await page.locator('.react-flow__node-mainNode').waitFor();
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const node = () => page.locator('.react-flow__node-ruleNode');
  const emptySpot = async () =>
    page.evaluate(() => {
      const pane = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!pane) throw new Error('no canvas');
      for (let y = pane.top + 60; y < pane.bottom - 500; y += 30)
        for (let x = pane.left + 40; x < pane.right - 340; x += 30)
          if ([0, 150, 300].every((dx) => [0, 200, 400].every((dy) => document.elementFromPoint(x + dx, y + dy)?.classList.contains('react-flow__pane')))) return { x, y };
      throw new Error('no empty spot');
    });

  it('the canvas menu adds a Core Rule node showing the layer comp and each layer’s rule', async () => {
    const at = await emptySpot();
    await page.mouse.click(at.x, at.y, { button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Core rules', exact: true }).click();
    await node().waitFor();
    await saved();
    expect((await doc()).coreRules).toHaveLength(1);
    const groups = node().getByRole('region', { name: 'Layer comp' }).locator('.sc-rule__group');
    expect(await groups.allInnerTexts()).toEqual(['Logo', 'Headline', 'Elements', 'Background']);
    const rules = node().getByRole('region', { name: 'Core auto layout guide' });
    expect(await rules.locator('[data-layer="background"]').innerText()).toContain('Covers the output');
    expect(await rules.locator('[data-layer="logo"]').innerText()).toContain('minimum size');
  }, 90_000);

  it('Core preset guide: the master is the square layout; the button adds the vertical and horizontal guides', async () => {
    const guides = node().getByRole('region', { name: 'Core preset guide' });
    expect(await guides.locator('[data-family="vertical"]').innerText()).toContain('not added');
    await guides.getByRole('button', { name: /^Add vertical guide and horizontal guide$/ }).click();
    await expect.poll(async () => (await doc()).compositions.filter((c) => c.guide).map((c) => c.guide?.family).sort()).toEqual(['horizontal', 'vertical']);
    await guides.getByRole('button', { name: 'Edit vertical guide' }).waitFor();
    expect(await guides.locator('[data-family="square"]').innerText()).toContain('outputs');
  }, 60_000);
});
