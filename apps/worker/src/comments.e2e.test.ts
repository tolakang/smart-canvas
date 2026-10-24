/**
 * D63 comments on Previews: an editor pins a comment with the Comment tool, the Preview node counts it, a viewer
 * replies (and can't resolve someone else's thread), the editor sees the reply and resolves the thread; on a phone a
 * tap pins a comment.
 */
import { adminUrl } from '@smart-canvas/api/src/test/db';
import { addOutput, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import type { BrowserContext, Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { setupAndCreateProject, startStack, type Stack } from './test/stack';

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

describe.skipIf(!adminUrl)('comments on Previews (D63)', () => {
  let stack: Stack;
  let page: Page;
  let board = '';
  let url = '';
  let teamId = '';
  let viewerCtx: BrowserContext;

  beforeAll(async () => {
    stack = await startStack();
    page = await stack.env.browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const ids = await setupAndCreateProject(page, stack.env.webUrl, 'Comments');
    teamId = ids.teamId;
    url = `${stack.env.webUrl}api/teams/${ids.teamId}/projects/${ids.projectId}`;
    const p = (await (await page.request.get(url)).json()) as { rev: number; doc: ProjectDoc };
    const doc = ok(addOutput(p.doc, { id: 'banner', label: 'Banner', size: { width: 1500, height: 500, unit: 'px' } }));
    expect((await page.request.put(url, { data: { rev: p.rev, doc } })).status()).toBe(200);
    board = page.url();
    await page.reload();
    await node(page).waitFor();
  }, 120_000);
  afterAll(async () => {
    await viewerCtx?.close();
    await stack?.close();
  });

  const node = (p: Page) => p.locator('.react-flow__node-outputNode[data-id="out:banner"]');
  const editor = (p: Page) => p.getByRole('dialog', { name: 'Preview editor Banner' });
  const panel = (p: Page) => editor(p).getByRole('complementary', { name: 'Comments' });

  it('an editor pins a comment with the Comment tool; the Preview node counts it', async () => {
    await node(page).getByRole('button', { name: 'Edit Preview Banner' }).click();
    await editor(page).getByRole('button', { name: 'Comment', exact: true }).click();
    expect(await editor(page).getByRole('complementary', { name: 'Design' }).count()).toBe(0); // Comments in its place
    await panel(page).getByText('Click or tap the Preview to pin a comment there.').waitFor();
    const surface = editor(page).getByTestId('point-surface');
    const box = await surface.boundingBox();
    await surface.click({ position: { x: (box?.width ?? 0) * 0.8, y: (box?.height ?? 0) * 0.25 } });
    await panel(page).getByRole('textbox', { name: 'New comment' }).fill('Logo too close to the edge');
    await panel(page).getByRole('button', { name: 'Post' }).click();
    const pin = editor(page).getByRole('button', { name: 'Comment 1' });
    await pin.waitFor();
    await panel(page).getByText('Logo too close to the edge').waitFor();
    const review = (await (await page.request.get(`${url}/review`)).json()) as { comments: { pinX: number; pinY: number }[] };
    expect(review.comments[0]?.pinX).toBeCloseTo(0.8, 1);
    expect(review.comments[0]?.pinY).toBeCloseTo(0.25, 1);
    // A comment on the whole Preview: no pin.
    await panel(page).getByRole('textbox', { name: 'Comment on the whole Preview' }).fill('Try a warmer background');
    await panel(page).getByRole('button', { name: 'Comment', exact: true }).click();
    await panel(page).getByText('Try a warmer background').waitFor();
    expect(await editor(page).locator('.sc-pin:not(.sc-pin--inline)').count()).toBe(1);
    if (process.env.SC_SHOTS) await page.screenshot({ path: `${process.env.SC_SHOTS}/comments-editor.png` });
    await editor(page).getByRole('button', { name: 'Close', exact: true }).click();
    await node(page).getByRole('button', { name: '2 open comments on Banner' }).waitFor();
  }, 60_000);

  it('a viewer opens the comments from the node and replies; they cannot resolve the editor’s thread', async () => {
    const invite = await page.request.post(`${stack.env.webUrl}api/teams/${teamId}/invites`, { data: { role: 'viewer' } });
    const { token } = (await invite.json()) as { token: string };
    viewerCtx = await stack.env.browser.newContext({ viewport: { width: 1600, height: 1000 } });
    expect((await viewerCtx.request.post(`${stack.env.webUrl}api/invites/${token}/accept`, { data: { email: 'vee@example.com', password: 'password123', name: 'Vee' } })).ok()).toBe(true);
    const vee = await viewerCtx.newPage();
    await vee.goto(board);
    await node(vee).getByRole('button', { name: '2 open comments on Banner' }).click();
    const thread = panel(vee).locator('.sc-comments__thread').filter({ hasText: 'Logo too close to the edge' });
    await thread.waitFor();
    expect(await thread.getByRole('button', { name: 'Resolve' }).count()).toBe(0);
    await thread.getByRole('button', { name: 'Reply' }).click();
    await thread.getByRole('textbox', { name: 'Reply' }).fill('Agreed, 20 px more');
    await thread.getByRole('button', { name: 'Reply' }).click();
    // Their own reply (posted, not the text still in the box): they can edit and delete it.
    const reply = thread.locator('.sc-comments__reply');
    await reply.getByText('Agreed, 20 px more').waitFor();
    expect(await reply.getByRole('button', { name: 'Edit' }).count()).toBe(1);
    expect(await reply.getByRole('button', { name: 'Delete' }).count()).toBe(1);
  }, 60_000);

  it('the editor sees the reply when the window gets focus, and resolves the thread', async () => {
    await node(page).getByRole('button', { name: '2 open comments on Banner' }).click();
    await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    const thread = panel(page).locator('.sc-comments__thread').filter({ hasText: 'Logo too close to the edge' });
    await thread.locator('.sc-comments__reply').getByText('Agreed, 20 px more').waitFor();
    await thread.getByText('Vee', { exact: true }).waitFor();
    await thread.getByRole('button', { name: 'Resolve' }).click();
    await thread.waitFor({ state: 'detached' });
    expect(await editor(page).getByRole('button', { name: 'Comment 1' }).count()).toBe(0);
    await panel(page).getByLabel('Show resolved').check();
    await panel(page).locator('.sc-comments__thread').filter({ hasText: 'Logo too close to the edge' }).getByText('Resolved by Ada').waitFor();
    await editor(page).getByRole('button', { name: 'Close', exact: true }).click();
    await node(page).getByRole('button', { name: '1 open comment on Banner' }).waitFor();
  }, 60_000);

  it('on a phone, a tap on the Preview pins a comment', async () => {
    const ctx = await stack.env.browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    try {
      await ctx.addCookies(await page.context().cookies());
      const phone = await ctx.newPage();
      await phone.goto(board);
      await node(phone).waitFor();
      // Zoomed out on touch, the first tap on a panel zooms to it (D58, Q8); the second presses Edit.
      const edit = node(phone).getByRole('button', { name: 'Edit Preview Banner' });
      await edit.tap();
      await phone.waitForTimeout(400);
      if (!(await editor(phone).count())) await edit.tap();
      await editor(phone).getByRole('button', { name: 'Comment', exact: true }).tap();
      const box = await editor(phone).getByTestId('point-surface').boundingBox();
      await phone.touchscreen.tap((box?.x ?? 0) + (box?.width ?? 0) / 2, (box?.y ?? 0) + (box?.height ?? 0) / 2);
      await panel(phone).getByRole('textbox', { name: 'New comment' }).fill('From my phone');
      await panel(phone).getByRole('button', { name: 'Post' }).tap();
      await panel(phone).getByText('From my phone').waitFor();
    } finally {
      await ctx.close();
    }
  }, 60_000);
});
