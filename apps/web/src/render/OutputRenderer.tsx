/**
 * The one renderer (CLAUDE.md: preview and export use the same OutputRenderer; no second path).
 * Draws a RenderScene on a W×H design-px canvas and scales the whole canvas, so the master preview,
 * output previews, thumbnails and the export page share every coordinate and differ only in `scale`.
 * Pure: no effects, no fetching. Waiting for fonts/images is the caller's job (see RenderPage).
 */
import {
  applyTransform,
  fillBoxes,
  isFittable,
  fillToCss,
  frameTransform,
  fontStack,
  isKhmerText,
  lineHeightOf,
  withKhmerBreaks,
  type AssetSize,
  type LayerSource,
  type RenderItem,
  type RenderScene,
} from '@smart-canvas/core';
import { memo, type CSSProperties } from 'react';

export interface OutputRendererProps {
  scene: RenderScene;
  /** Layers by id: the inputs (core `layerSources`). */
  sources: readonly LayerSource[];
  /** Intrinsic asset sizes (layout deps), needed to draw a fitted picture (D37). */
  assetSizes?: Readonly<Record<string, AssetSize>>;
  assetUrl: (assetId: string) => string;
  /** Output pixels per design px. Export uses exportScaleOf(); previews fit a box. */
  scale: number;
  /** 'preview' draws placeholders for inputs that have no file or text yet; 'export' draws nothing for them. */
  mode?: 'preview' | 'export';
  className?: string;
}

export const OutputRenderer = memo(function OutputRenderer({ scene, sources, assetSizes, assetUrl, scale, mode = 'export', className }: OutputRendererProps) {
  const byId = new Map(sources.map((s) => [s.id, s]));
  return (
    <div
      className={`sc-render${className ? ` ${className}` : ''}`}
      style={{ position: 'relative', overflow: 'hidden', width: scene.width * scale, height: scene.height * scale }}
      data-design-width={scene.width}
      data-design-height={scene.height}
    >
      <div
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          width: scene.width,
          height: scene.height,
          transform: `scale(${scale})`,
          transformOrigin: '0 0',
        }}
      >
        {scene.items.map((item) => {
          const source = byId.get(item.sourceId);
          return source ? <Layer key={item.sourceId} item={item} source={source} assetSizes={assetSizes} assetUrl={assetUrl} mode={mode} /> : null;
        })}
      </div>
    </div>
  );
});

function Layer({
  item,
  source,
  assetSizes,
  assetUrl,
  mode,
}: {
  item: RenderItem;
  source: LayerSource;
  assetSizes?: OutputRendererProps['assetSizes'];
  assetUrl: (id: string) => string;
  mode: 'preview' | 'export';
}) {
  const { frame } = item;
  const box: CSSProperties = {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    ...(frame.rotation || frame.shear ? { transform: frameTransform(frame), transformOrigin: '50% 50%' } : {}),
  };
  const data = { 'data-source-id': source.id, 'data-kind': source.kind };
  // D43: this output's slot (a background's vertical / horizontal picture) in place of the main picture.
  const content = item.assetId && (source.content.kind === 'image' || source.content.kind === 'vector') ? { ...source.content, assetId: item.assetId } : source.content;

  switch (content.kind) {
    case 'fill':
      return <div {...data} style={{ ...box, background: fillToCss(content.fill) }} />;

    case 'image':
    case 'vector': {
      if (!content.assetId) {
        return mode === 'preview' ? (
          <div {...data} className="sc-render__placeholder" style={box}>
            {source.label}
          </div>
        ) : null;
      }
      // Backgrounds cover their frame around the focal point; everything else fits inside it.
      const cover = source.behavesLike === 'background';
      const size = assetSizes?.[content.assetId];
      // D37: a fitted frame is the picture's visible part, which fills it (stretched with it). Until the
      // trim is measured, draw it the old way (contain) rather than stretch transparent margins in.
      if (frame.fitted && size?.trim && isFittable(source)) {
        const { img } = fillBoxes(frame, size);
        return (
          <div {...data} style={{ ...box, overflow: 'hidden' }}>
            <img src={assetUrl(content.assetId)} alt="" draggable={false} style={{ position: 'absolute', left: img.x, top: img.y, width: img.w, height: img.h, maxWidth: 'none', objectFit: 'fill' }} />
          </div>
        );
      }
      return <img {...data} src={assetUrl(content.assetId)} alt="" draggable={false} style={{ ...box, objectFit: cover ? 'cover' : 'contain', objectPosition: `${content.focal.x * 100}% ${content.focal.y * 100}%` }} />;
    }

    case 'text': {
      const style = item.style ? { ...content.style, ...item.style } : content.style;
      const { text } = content;
      // D68: an empty text layer gets the same placeholder box as an empty picture in the editors, so it can be found
      // and placed there; export draws nothing for it.
      if (!text.trim()) {
        return mode === 'preview' ? (
          <div {...data} className="sc-render__placeholder" style={box}>
            {source.label}
          </div>
        ) : null;
      }
      const shown = applyTransform(text, style);
      const khmer = isKhmerText(style, shown);
      const fontSize = item.fontSizePx ?? style.fontSizePx;
      return (
        <div
          {...data}
          lang={khmer ? 'km' : undefined}
          style={{
            ...box,
            fontFamily: fontStack(style.fontFamily),
            fontWeight: style.fontWeight,
            fontSize,
            lineHeight: lineHeightOf(style, shown),
            letterSpacing: style.letterSpacingEm ? `${style.letterSpacingEm}em` : undefined,
            color: style.color,
            textAlign: style.align,
            // Engine lines are final: never re-wrap them. Without them, wrap only between words.
            whiteSpace: item.lines ? 'pre' : 'pre-wrap',
            overflowWrap: item.lines ? undefined : 'break-word',
            wordBreak: khmer && !item.lines ? 'keep-all' : undefined,
          }}
        >
          {item.lines
            ? item.lines.map((line, i) => <div key={i}>{applyTransform(line, style)}</div>)
            : khmer
              ? withKhmerBreaks(shown)
              : shown}
        </div>
      );
    }
  }
}

/** A scene scaled to fit a box (main node, output nodes, lists). D68 (UX B10): no placeholders — a board Preview shows
 * only real artwork, as its export will; placeholders for empty layers are drawn in the editors only. */
export function RenderThumbnail(props: Omit<OutputRendererProps, 'scale' | 'mode'> & { maxWidth: number; maxHeight: number }) {
  const { maxWidth, maxHeight, ...rest } = props;
  const scale = Math.min(maxWidth / props.scene.width, maxHeight / props.scene.height);
  return <OutputRenderer {...rest} scale={scale} mode="export" className="sc-render--thumb" />;
}
