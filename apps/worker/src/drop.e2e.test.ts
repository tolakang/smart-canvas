/**
 * T8.3 end to end: drop an image file from the desktop onto an input node. Picture inputs take their kind
 * (PNG/JPEG/WebP or SVG); a fill background takes a photo and becomes an image background (D9).
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import type { ProjectDoc } from '@smart-canvas/core';
import type { Locator, Page } from 'playwright';
import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100"><rect width="200" height="100" fill="#0a7"/></svg>';

describe.skipIf(!adminUrl)('drop an image onto an input (T8.3)', () => {
  let stack: Stack;
  let page: Page;
  let url = '';
  let png = '';

  beforeAll(async () => {
    stack = await startStack();
    png = (await sharp({ create: { width: 40, height: 30, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } } }).png().toBuffer()).toString('base64');
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const { teamId, projectId } = await setupAndCreateProject(page, stack.env.webUrl, 'Drop');
    url = `${stack.env.webUrl}api/teams/${teamId}/projects/${projectId}`;
  }, 120_000);
  afterAll(async () => {
    await stack?.close();
  });

  const saved = () => page.getByRole('status').getByText('All changes saved').waitFor({ timeout: 15_000 });
  const doc = async (): Promise<ProjectDoc> => (await (await page.request.get(url)).json()).doc;
  const node = (label: string) => page.locator('.react-flow__node-inputNode').filter({ has: page.locator('.sc-node__title', { hasText: new RegExp(`^${label}$`) }) });

  /** A desktop file drag: dragenter/dragover then drop, with the file in the DataTransfer. */
  async function dropFile(target: Locator, file: { name: string; type: string; base64?: string; text?: string }) {
    const dt = await page.evaluateHandle((f) => {
      const data = new DataTransfer();
      const bytes = f.base64 ? Uint8Array.from(atob(f.base64), (c) => c.charCodeAt(0)) : new TextEncoder().encode(f.text ?? '');
      data.items.add(new File([bytes], f.name, { type: f.type }));
      return data;
    }, file);
    await target.dispatchEvent('dragenter', { dataTransfer: dt });
    await target.dispatchEvent('dragover', { dataTransfer: dt });
    await target.dispatchEvent('drop', { dataTransfer: dt });
  }

  it('a PNG dropped on the Subject becomes its image', async () => {
    await dropFile(node('Subject').locator('.sc-node__meta'), { name: 'subject.png', type: 'image/png', base64: png });
    await node('Subject').locator('img.sc-thumb').waitFor();
    await saved();
    const subject = (await doc()).sources.find((s) => s.id === 'subject');
    expect(subject?.content.kind === 'image' && subject.content.assetId).toBeTruthy();
  }, 60_000);

  it('an SVG dropped on the Logo works; a PNG there is refused with a message', async () => {
    await dropFile(node('Logo').locator('.sc-node__meta'), { name: 'logo.png', type: 'image/png', base64: png });
    await node('Logo').getByRole('alert').getByText('This input takes SVG files.').waitFor();
    await dropFile(node('Logo').locator('.sc-node__meta'), { name: 'logo.svg', type: 'image/svg+xml', text: SVG });
    await node('Logo').locator('img.sc-thumb').waitFor();
    await expect.poll(() => node('Logo').getByRole('alert').count()).toBe(0);
  }, 60_000);

  it('a photo dropped on the fill Background makes it an image background (D9); undo restores the fill', async () => {
    expect((await doc()).sources.find((s) => s.id === 'background')?.kind).toBe('fill');
    await dropFile(node('Background').locator('.sc-node__meta'), { name: 'bg.png', type: 'image/png', base64: png });
    await node('Background').locator('img.sc-thumb').waitFor();
    await saved();
    const bg = (await doc()).sources.find((s) => s.id === 'background');
    expect(bg).toMatchObject({ kind: 'image', behavesLike: 'background', content: { kind: 'image', focal: { x: 0.5, y: 0.5 } } });
    expect(await node('Background').locator('.sc-node__meta').innerText()).toContain('image · background');

    await page.locator('.react-flow__pane').click({ position: { x: 10, y: 10 } });
    await page.keyboard.press('Control+z');
    await node('Background').locator('.sc-swatch').waitFor();
    await saved();
    expect((await doc()).sources.find((s) => s.id === 'background')?.kind).toBe('fill');

    // And back from a photo to a colour with the button.
    await page.keyboard.press('Control+Shift+z');
    await node('Background').locator('img.sc-thumb').waitFor();
    await node('Background').getByRole('button', { name: 'Use a colour instead' }).click();
    await node('Background').locator('.sc-swatch').waitFor();
    await saved();
    expect((await doc()).sources.find((s) => s.id === 'background')).toMatchObject({ kind: 'fill', content: { kind: 'fill', fill: { type: 'solid' } } });
  }, 60_000);

  it('the text input ignores dropped files, and a file dropped on the canvas does not leave the board', async () => {
    await dropFile(node('Headline').locator('.sc-node__meta'), { name: 'x.png', type: 'image/png', base64: png });
    await dropFile(page.locator('.react-flow__pane'), { name: 'x.png', type: 'image/png', base64: png });
    await page.waitForTimeout(300);
    expect(page.url()).toContain('#/t/');
    expect(await node('Headline').getByRole('alert').count()).toBe(0);
  }, 30_000);
});
