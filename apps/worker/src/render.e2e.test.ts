/**
 * T6.1 end to end: real Chromium opens the web app's /render page (Vite dev server), the worker answers
 * its API reads, and the page reports ready at the export pixel size.
 */
import { addOutput, connectSource, createProjectDoc, exportPixels, type ProjectDoc } from '@smart-canvas/core';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAllowedApiPath, openRender, renderedSize, RenderError, renderUrl } from './render';
import { fakeApi as makeApi, ok, PROJECT, startRenderEnv, TEAM } from './test/render-env';

function sampleDoc(): ProjectDoc {
  let doc = createProjectDoc('E2E');
  for (const id of ['background', 'headline']) doc = ok(connectSource(doc, id));
  doc = {
    ...doc,
    sources: doc.sources.map((s) =>
      s.id === 'background' ? { ...s, content: { kind: 'fill', fill: { type: 'solid', color: '#ff0000' } } } : s.id === 'headline' && s.content.kind === 'text' ? { ...s, content: { ...s.content, text: 'Hello សួស្តី' } } : s,
    ),
  };
  doc = ok(addOutput(doc, { id: 'post', label: 'Post', size: { width: 200, height: 100, unit: 'px' }, exportScale: 2 }));
  doc = ok(addOutput(doc, { id: 'card', label: 'Card', size: { width: 85, height: 55, unit: 'mm' }, dpi: 150, bleedMm: 3 }));
  return doc;
}

const doc = sampleDoc();
const { fetch: fakeApi, requested } = makeApi(doc);

describe('render page in Chromium (T6.1)', () => {
  let env: Awaited<ReturnType<typeof startRenderEnv>>;
  let browser: Awaited<ReturnType<typeof startRenderEnv>>['browser'];
  let webUrl = '';

  beforeAll(async () => {
    env = await startRenderEnv();
    ({ browser, webUrl } = env);
  }, 60_000);
  afterAll(async () => {
    await env?.close();
  });

  it('renders an output at its export pixel size once fonts and images are ready', async () => {
    const page = await openRender(browser, webUrl, { teamId: TEAM, projectId: PROJECT, target: 'post' }, fakeApi);
    const out = doc.outputs.find((o) => o.id === 'post');
    if (!out) throw new Error('no output');
    expect(await renderedSize(page)).toEqual({ width: exportPixels(out, true).w, height: exportPixels(out, true).h }); // 400×200 at 2×
    expect(await page.locator('[data-source-id=headline]').innerText()).toContain('Hello');
    const fill = await page.locator('[data-source-id=background]').evaluate((e) => getComputedStyle(e).backgroundColor);
    expect(fill).toBe('rgb(255, 0, 0)');
    await page.close();
  }, 60_000);

  it('includes the bleed by default and crops to trim with bleed=0', async () => {
    const card = doc.outputs.find((o) => o.id === 'card');
    if (!card) throw new Error('no output');
    const full = await openRender(browser, webUrl, { teamId: TEAM, projectId: PROJECT, target: 'card' }, fakeApi);
    expect(await renderedSize(full)).toEqual({ width: exportPixels(card, true).w, height: exportPixels(card, true).h });
    await full.close();
    const trim = await openRender(browser, webUrl, { teamId: TEAM, projectId: PROJECT, target: 'card', bleed: false }, fakeApi);
    expect(await renderedSize(trim)).toEqual({ width: exportPixels(card, false).w, height: exportPixels(card, false).h });
    await trim.close();
  }, 60_000);

  it('fails with the page error for an unknown output', async () => {
    await expect(openRender(browser, webUrl, { teamId: TEAM, projectId: PROJECT, target: 'nope' }, fakeApi, 20_000)).rejects.toThrow(RenderError);
  }, 30_000);

  it('only forwards allow-listed reads', () => {
    expect(requested.every(isAllowedApiPath)).toBe(true);
    expect(isAllowedApiPath(`/teams/${TEAM}/projects/${PROJECT}`)).toBe(true);
    expect(isAllowedApiPath(`/teams/${TEAM}/invites`)).toBe(false);
    expect(isAllowedApiPath('/auth/me')).toBe(false);
    expect(renderUrl('http://web/', { teamId: TEAM, projectId: PROJECT, target: 'o', bleed: false, scale: 2 })).toBe(`http://web/render/${TEAM}/${PROJECT}/o?bleed=0&scale=2`);
  });
});
