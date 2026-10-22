/**
 * T8.5 end to end: every wire attaches and detaches by dragging. Pick up a wire end and drop it on empty
 * canvas to detach; on another port row to move the input there; on another input to swap who feeds that
 * row; on a disconnected output to move the output wire.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { portOf, type ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

describe.skipIf(!adminUrl)('wires attach and detach by dragging (T8.5)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1800, height: 1100 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Wires');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const wiredPorts = async () => {
    const d = await doc();
    return Object.fromEntries(d.edges.filter((e) => e.kind === 'layer' && e.to === 'main').map((e) => [e.from, portOf(d, e.from)]));
  };
  const main = () => page.locator('.react-flow__node-mainNode');
  const rowHandle = (port: number) => main().locator(`.sc-port[data-port="${port}"] .react-flow__handle`);
  const inputHandle = (label: string) =>
    page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${label}$`) }) }).locator('.react-flow__handle');
  const end = (edgeId: string, which: 'source' | 'target') => page.locator(`.react-flow__edge[data-id="${edgeId}"] .react-flow__edgeupdater-${which}`);

  const centre = async (l: Locator) => {
    const b = await l.boundingBox();
    if (!b) throw new Error('not visible');
    return { x: b.x + b.width / 2, y: b.y + b.height / 2 };
  };
  /** Press on `from`, move in steps, release on `to` (a point or an element). */
  async function drag(from: Locator, to: Locator | { x: number; y: number }) {
    const a = await centre(from);
    const b = 'boundingBox' in to ? await centre(to) : to;
    await page.mouse.move(a.x, a.y);
    await page.mouse.down();
    await page.mouse.move(a.x + 8, a.y + 8, { steps: 4 });
    await page.mouse.move(b.x, b.y, { steps: 20 });
    await page.mouse.up();
  }
  const emptySpot = async () =>
    page.evaluate(() => {
      const pane = document.querySelector('.react-flow__pane')?.getBoundingClientRect();
      if (!pane) throw new Error('no canvas');
      for (let y = pane.top + 60; y < pane.bottom - 60; y += 30)
        for (let x = pane.left + pane.width / 2; x < pane.right - 60; x += 30)
          if (document.elementFromPoint(x, y)?.classList.contains('react-flow__pane')) return { x, y };
      throw new Error('no empty spot');
    });

  it('draws input wires by dragging from an input to a row', async () => {
    for (const [label, port] of [['Logo', 0], ['Headline', 1], ['Subject', 2], ['Background', 3]] as const) await drag(inputHandle(label), rowHandle(port));
    await saved();
    expect(await wiredPorts()).toEqual({ logo: 0, headline: 1, subject: 2, background: 3 });
  }, 60_000);

  it('dropping a wire end on empty canvas detaches it', async () => {
    await drag(end('in:logo', 'target'), await emptySpot());
    await expect.poll(async () => Object.keys(await wiredPorts()).sort()).toEqual(['background', 'headline', 'subject']);
    expect(await page.locator('.react-flow__edge[data-id="in:logo"]').count()).toBe(0);
  }, 60_000);

  it('page 3: every wire carries a ✂ badge; clicking it cuts that wire', async () => {
    const badge = page.locator('.react-flow__edgelabel-renderer .sc-wire-cut--idle');
    // Background, headline and subject are wired (the logo was just detached): one badge each.
    await expect.poll(() => badge.count()).toBe(3);
    await drag(inputHandle('Logo'), rowHandle(0));
    await expect.poll(async () => Object.keys(await wiredPorts()).sort()).toEqual(['background', 'headline', 'logo', 'subject']);
    // The logo's badge is the one nearest its wire's middle; cut it and the logo is unwired again.
    const logoBadge = await page.evaluate(() => {
      const path = document.querySelector('.react-flow__edge[data-id="in:logo"] path.react-flow__edge-path') as SVGPathElement | null;
      const box = path?.getBoundingClientRect();
      if (!box) return -1;
      const mid = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
      const badges = [...document.querySelectorAll('.react-flow__edgelabel-renderer .sc-wire-cut--idle')];
      const d = badges.map((b) => {
        const r = b.getBoundingClientRect();
        return Math.hypot(r.x + r.width / 2 - mid.x, r.y + r.height - mid.y);
      });
      return d.indexOf(Math.min(...d));
    });
    await badge.nth(logoBadge).click();
    await expect.poll(async () => Object.keys(await wiredPorts()).sort()).toEqual(['background', 'headline', 'subject']);
  }, 60_000);

  it('dropping the main end on another row moves the input there, but never out of its layer comp group (D45)', async () => {
    // The headline dropped on the background's row stays in the headline group, under the logo.
    await drag(end('in:headline', 'target'), rowHandle(3));
    await page.waitForTimeout(400);
    await saved();
    expect((await wiredPorts()).headline).toBe(1);
    expect(portOf(await doc(), 'headline')).toBe(1);
  }, 60_000);

  it('dropping the input end on another input swaps who feeds that row', async () => {
    await drag(end('in:subject', 'source'), inputHandle('Logo'));
    // The logo now feeds the master (its row stays on top: D45) and the subject is unwired.
    await expect.poll(async () => (await wiredPorts()).logo).toBe(0);
    expect((await wiredPorts()).subject).toBeUndefined();
  }, 60_000);

  it('output wires: move to a disconnected output, and detach (frozen) by dropping on the canvas', async () => {
    for (const preset of ['Instagram square · 1080×1080 px', 'Instagram portrait 4:5 · 1080×1350 px']) {
      await page.getByRole('button', { name: '+ Add output' }).click();
      await page.getByRole('dialog').getByLabel('Preset').selectOption({ label: preset });
      await page.getByRole('dialog').getByRole('button', { name: 'Add' }).click();
    }
    await saved();
    const [sq, pt] = (await doc()).outputs;
    if (!sq || !pt) throw new Error('outputs missing');
    const outHandle = (id: string) => page.locator(`.react-flow__node-outputNode[data-id="out:${id}"] .sc-handle--composition`);
    // T13.2: an output's settings (Disconnect included) are in the inspector of the selected node.
    await page.getByRole('button', { name: 'Fit to screen (Shift+1)' }).click(); // nodes added since the first fit
    await page.waitForTimeout(300);
    await page.locator(`.react-flow__node-outputNode[data-id="out:${pt.id}"] .sc-node__title`).click();
    await page.getByRole('complementary', { name: 'Inspector' }).getByRole('button', { name: 'Disconnect' }).click();
    await saved();

    await drag(end(`out:${sq.id}`, 'target'), outHandle(pt.id));
    await expect.poll(async () => (await doc()).edges.filter((e) => e.kind === 'composition').map((e) => e.to)).toEqual([pt.id]);
    const d = await doc();
    expect(d.outputs.find((o) => o.id === sq.id)?.frozen).toBeTruthy(); // detached outputs freeze (D12)

    await drag(end(`out:${pt.id}`, 'target'), await emptySpot());
    await expect.poll(async () => (await doc()).edges.filter((e) => e.kind === 'composition').length).toBe(0);
    expect((await doc()).outputs.find((o) => o.id === pt.id)?.frozen).toBeTruthy();
  }, 90_000);

  it('T10.4 / T12.7: a wire dragged out of the master preview onto empty canvas offers outputs; one is added there, wired', async () => {
    const before = (await doc()).outputs.map((o) => o.id);
    const spot = await emptySpot();
    await drag(main().locator('.react-flow__handle[data-handleid="out"]'), spot);
    await page.getByRole('menu', { name: 'Add & connect' }).getByRole('menuitem', { name: 'Output 1080×1350 px' }).click();
    await expect.poll(async () => (await doc()).outputs.length).toBe(before.length + 1);
    const added = (await doc()).outputs.find((o) => !before.includes(o.id));
    expect(added).toMatchObject({ label: '1080×1350 px', size: { width: 1080, height: 1350, unit: 'px' } });
    expect((await doc()).edges).toContainEqual(expect.objectContaining({ from: 'main', to: added?.id }));
    // The new node sits where the wire was dropped (its input handle under the pointer).
    const handle = await centre(page.locator(`.react-flow__node-outputNode[data-id="out:${added?.id}"] .sc-handle--composition`));
    expect(Math.abs(handle.x - spot.x)).toBeLessThan(30);
    expect(Math.abs(handle.y - spot.y)).toBeLessThan(80);
  }, 60_000);

  it('T12.2: typed ports — a wire dropped on the wrong kind of port is refused, with the reason', async () => {
    const before = (await doc()).edges.length;
    const out = (await doc()).outputs[0];
    if (!out) throw new Error('no output');
    await drag(inputHandle('Logo'), page.locator(`.react-flow__node-outputNode[data-id="out:${out.id}"] .sc-handle--composition`));
    // T12.4: inputs go onto an output's layer rows, not its master preview port.
    await expect.poll(() => page.getByRole('alert').innerText()).toBe('An input wires into a layer row of an output.');
    expect((await doc()).edges.length).toBe(before);
    // Ports are typed by class (layer / composition) for their colours.
    expect(await inputHandle('Logo').getAttribute('class')).toContain('sc-handle--layer');
    expect(await main().locator('.react-flow__handle[data-handleid="out"]').getAttribute('class')).toContain('sc-handle--composition');
  }, 60_000);
});
