/**
 * T12.3 (D32) end to end: several main previews. Add one from the canvas menu, wire an input into it, drag an
 * output out of it, open its editor, rename it in the inspector, and delete it (its output freezes).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { compositionById, layerOrder, outputComposition, type ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('several main previews (T12.3)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let compId = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Variants');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const comp = () => page.locator(`.react-flow__node-mainNode[data-id="comp:${compId}"]`);
  const centre = async (l: Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  async function drag(from: Locator, to: { x: number; y: number }) {
    const a = await centre(from);
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 8, a.y + 8, { steps: 4 });
    await page.mouse.move(to.x, to.y, { steps: 20 });
    await page.mouse.up();
  }
  const emptySpot = (fromRight = false) =>
    page.evaluate((fromRight) => {
      const p = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!p) throw new Error('no canvas');
      for (let y = p.top + 80; y < p.bottom - 80; y += 30)
        for (let i = 0; i < 40; i++) {
          const x = fromRight ? p.right - 80 - i * 30 : p.left + p.width / 2 + i * 30;
          if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
        }
      throw new Error('no empty spot');
    }, fromRight);

  it('adds a main preview from the canvas menu', async () => {
    const spot = await emptySpot();
    await page.mouse.click(spot.x, spot.y, { button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Main preview' }).click();
    await saved();
    const d = await doc();
    expect(d.compositions).toHaveLength(2);
    compId = d.compositions[1]?.id ?? '';
    await comp().waitFor();
    expect(await comp().locator('.sc-node__title').innerText()).toBe('Main preview 2');
  }, 60_000);

  it('an input wired into it becomes its row; an output dragged out of it follows it', async () => {
    const subject = page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Subject$/ }) });
    await drag(subject.locator('.react-flow__handle'), await centre(comp().locator('.sc-port--add .react-flow__handle')));
    await expect.poll(async () => layerOrder(await doc(), compId)).toEqual(['subject']);
    expect(layerOrder(await doc())).toContain('subject'); // still a row of main too
    await drag(comp().locator('.react-flow__handle[data-handleid="out"]'), await emptySpot(true));
    await page.getByRole('menu', { name: 'Add & connect' }).getByRole('menuitem', { name: 'Output 1080×1350 px' }).click(); // T12.7 palette
    await expect.poll(async () => (await doc()).outputs.length).toBe(1);
    const d = await doc();
    expect(outputComposition(d, d.outputs[0]?.id ?? '')).toBe(compId);
  }, 60_000);

  it('opens its own editor, and renames in the inspector', async () => {
    await comp().getByRole('button', { name: 'Edit Main preview 2' }).click();
    const editor = page.getByRole('dialog', { name: /Main preview editor/ });
    await expect.poll(() => editor.locator('.sc-fig__title strong').innerText()).toBe('Main preview 2');
    expect(await editor.locator('.sc-layers [data-layer]').count()).toBe(1); // only its own row
    await editor.getByRole('button', { name: 'Close' }).click();
    await comp().locator('.sc-node__meta').first().click();
    const panel = page.getByRole('complementary', { name: 'Inspector' });
    await panel.getByLabel('Main preview name').fill('Variant B');
    await panel.getByLabel('Main preview name').press('Enter');
    await expect.poll(async () => compositionById(await doc(), compId)?.label).toBe('Variant B');
  }, 60_000);

  it('deleting it freezes the outputs that followed it', async () => {
    page.once('dialog', (d) => void d.accept());
    await comp().getByRole('button', { name: 'Delete Variant B' }).click();
    await saved();
    const d = await doc();
    expect(d.compositions.map((c) => c.id)).toEqual(['main']);
    expect(d.outputs[0]?.frozen).toBeTruthy();
    expect(d.edges.some((e) => e.to === compId || e.from === compId)).toBe(false);
  }, 60_000);
});
