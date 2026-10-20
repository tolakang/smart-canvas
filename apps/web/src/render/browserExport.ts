/**
 * Browser export (D31, T11.1): makes an output's file in the user's browser, so the export server is only
 * used when it must be (see exportRoute). It draws exactly what the worker's render page draws: the same
 * export scene, RenderFrame and OutputRenderer, mounted off-screen at the export scale; then the shared
 * frameToSvg builds the file, and rasters are that SVG drawn on a canvas.
 */
import {
  computeLayout,
  exportCapError,
  renderScaleOf,
  withBleedOf,
  type ExportFormat,
  type ExportOptions,
  type LayoutDeps,
  type ProjectDoc,
} from '@smart-canvas/core';
import { createElement } from 'react';
import { flushSync } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { frameToSvg, svgToRaster } from './exportFile';
import { exportScene, frameReady, RenderFrame } from './RenderPage';

export type BrowserFormat = Exclude<ExportFormat, 'pdf'>;

export interface BrowserExport {
  blob: Blob;
  width: number;
  height: number;
}

export async function exportInBrowser(req: {
  doc: ProjectDoc;
  outputId: string;
  format: BrowserFormat;
  options: ExportOptions;
  layoutDeps: LayoutDeps;
  assetUrl: (assetId: string) => string;
}): Promise<BrowserExport> {
  const { doc, format, options } = req;
  const output = doc.outputs.find((o) => o.id === req.outputId);
  if (!output) throw new Error('output not found');
  const tooLarge = exportCapError(output, format, options);
  if (tooLarge) throw new Error(tooLarge);
  if (format === 'svg' && options.outlineText) throw new Error('outlined text is made on the server');

  const scene = exportScene(computeLayout(doc, output.id, req.layoutDeps), output, withBleedOf(output, options));
  const scale = renderScaleOf(output, format, options);

  // Off-screen, at full size (a scaled-down or hidden frame would draw differently).
  const host = document.createElement('div');
  host.setAttribute('aria-hidden', 'true');
  host.style.cssText = 'position:fixed;left:-200000px;top:0;pointer-events:none;';
  document.body.append(host);
  const root = createRoot(host);
  try {
    flushSync(() => root.render(createElement(RenderFrame, { scene, sources: doc.sources, assetUrl: req.assetUrl, scale })));
    const frame = host.querySelector<HTMLElement>('.sc-render-frame');
    if (!frame) throw new Error('render: nothing drawn');
    await frameReady(frame, scene, doc.sources);
    const svg = await frameToSvg(frame);
    if (!svg.width || !svg.height) throw new Error('render: nothing drawn');
    if (format === 'svg') return { blob: new Blob([svg.svg], { type: 'image/svg+xml' }), width: svg.width, height: svg.height };
    const size = { width: Number(frame.dataset.exportWidth), height: Number(frame.dataset.exportHeight) };
    return { blob: await svgToRaster(svg, size, format, options.quality), ...size };
  } finally {
    root.unmount();
    host.remove();
  }
}
