/**
 * T6.1 end to end: real Chromium opens the web app's /render page (Vite dev server), the worker answers
 * its API reads, and the page reports ready at the export pixel size.
 */
import { fileURLToPath } from 'node:url';
import { addOutput, connectSource, createProjectDoc, exportPixels, type ProjectDoc, type SourceResult } from '@smart-canvas/core';
import { chromium, type Browser } from 'playwright';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { isAllowedApiPath, openRender, renderedSize, RenderError, renderUrl, type ApiFetch } from './render';

const TEAM = '11111111-1111-4111-8111-111111111111';
const PROJECT = '22222222-2222-4222-8222-222222222222';
const webRoot = fileURLToPath(new URL('../../web', import.meta.url));

const ok = (r: SourceResult): ProjectDoc => {
  if (!r.ok) throw new Error(r.error);
  return r.doc;
};

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

const json = (v: unknown) => ({ status: 200, contentType: 'application/json', body: Buffer.from(JSON.stringify(v)) });
const doc = sampleDoc();
const requested: string[] = [];
const fakeApi: ApiFetch = async (path) => {
  requested.push(path);
  if (path === `/teams/${TEAM}/projects/${PROJECT}`) return json({ id: PROJECT, rev: 1, doc });
  if (path === `/teams/${TEAM}/fonts` || path === `/teams/${TEAM}/assets`) return json([]);
  return { status: 404, contentType: 'application/json', body: Buffer.from('{}') };
};

describe('render page in Chromium (T6.1)', () => {
  let vite: ViteDevServer;
  let browser: Browser;
  let webUrl = '';

  beforeAll(async () => {
    vite = await createServer({ root: webRoot, configFile: `${webRoot}/vite.config.ts`, logLevel: 'silent', server: { port: 0, host: '127.0.0.1' } });
    await vite.listen();
    webUrl = vite.resolvedUrls?.local[0] ?? '';
    browser = await chromium.launch();
  }, 60_000);
  afterAll(async () => {
    await browser?.close();
    await vite?.close();
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
