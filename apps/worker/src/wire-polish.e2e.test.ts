/**
 * T13.8 end to end: wire polish. Selecting a node dims the wires that don't touch it; an edit pulses the wires
 * it flows along; a double-click on a wire adds a reroute point, which drags and double-clicks away.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';


describe.skipIf(!adminUrl)('wire polish (T13.8)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Wires2');
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    // D49: every asset node is wired into Main Comps; the Background node's wire is its own edge.
    expect(p.doc.edges.some((e) => e.id === 'in:background')).toBe(true);
    await page.locator('.react-flow__edge[data-id="in:background"]').waitFor();
    await page.getByRole('button', { name: /^Fit to screen/ }).click();
    await page.waitForTimeout(300);
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const edge = (id: string) => page.locator(`.react-flow__edge[data-id="${id}"]`);
  const cls = async (l: Locator) => (await l.getAttribute('class')) ?? '';
  const centre = async (l: Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };

  const bgNode = () => page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: /^Background$/ }) });
  const logoWire = async () => edge(`card:stk:${(await doc()).stacks?.find((st) => st.kind === 'logo')?.id}`);
  /** A point on a wire, a third of the way along (its middle carries the ✂ badge). */
  const onWire = (l: Locator) =>
    l.locator('path.react-flow__edge-path').evaluate((el) => {
      const path = el as SVGPathElement;
      const p = path.getPointAtLength(path.getTotalLength() / 3);
      const m = path.getScreenCTM();
      return m ? { x: p.x * m.a + p.y * m.c + m.e, y: p.x * m.b + p.y * m.d + m.f } : { x: 0, y: 0 };
    });

  it('selecting a node dims the wires that do not touch it', async () => {
    expect(await cls(edge('in:background'))).not.toContain('sc-edge--dim');
    await bgNode().locator('.sc-node__title').click();
    await expect.poll(async () => cls(await logoWire())).toContain('sc-edge--dim');
    expect(await cls(edge('in:background'))).not.toContain('sc-edge--dim');
    await page.keyboard.press('Escape');
    await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
    await expect.poll(async () => cls(await logoWire())).not.toContain('sc-edge--dim');
  }, 60_000);

  it('an edit pulses the wires it flows along', async () => {
    await bgNode().locator('.sc-node__title').click({ button: 'right' });
    await page.getByRole('menu').getByRole('menuitem', { name: 'Hide' }).click();
    await expect.poll(() => cls(edge('in:background')), { interval: 50 }).toContain('sc-edge--pulse');
    expect(await cls(await logoWire())).not.toContain('sc-edge--pulse');
    await expect.poll(() => cls(edge('in:background'))).not.toContain('sc-edge--pulse');
  }, 60_000);

  it('double-click a wire: a reroute point; drag it; double-click it away', async () => {
    const mid = await onWire(edge('in:background'));
    await page.mouse.dblclick(mid.x, mid.y);
    await expect.poll(async () => (await doc()).edges.find((e) => e.id === 'in:background')?.points?.length).toBe(1);
    const point = edge('in:background').locator('circle.sc-reroute');
    const y0 = (await doc()).edges.find((e) => e.id === 'in:background')?.points?.[0]?.y ?? 0;
    const at = await centre(point);
    await page.mouse.move(at.x, at.y);
    await page.mouse.down();
    await page.mouse.move(at.x, at.y + 60, { steps: 6 });
    await page.mouse.up();
    await expect.poll(async () => ((await doc()).edges.find((e) => e.id === 'in:background')?.points?.[0]?.y ?? 0) - y0).toBeGreaterThan(20); // saved, one step
    expect((await centre(point)).y - at.y).toBeGreaterThan(40);
    await point.dblclick();
    await expect.poll(async () => (await doc()).edges.find((e) => e.id === 'in:background')?.points).toBeUndefined();
  }, 60_000);
});
