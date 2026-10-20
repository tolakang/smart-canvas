/**
 * The one renderer (CLAUDE.md: preview and export use the same OutputRenderer; no second path).
 * Draws a RenderScene on a W×H design-px canvas and scales the whole canvas, so the main preview,
 * output previews, thumbnails and the export page share every coordinate and differ only in `scale`.
 * Pure: no effects, no fetching. Waiting for fonts/images is the caller's job (see RenderPage).
 * Process nodes (T12.5) arrive as layers with an `effect`: crop / mirror / quarter turns are drawn by nesting
 * (core `effectBoxes`), colour adjustments as CSS `filter` and `opacity` — the same DOM in preview and export.
 */
import {
  applyTransform,
  effectBoxes,
  effectFilter,
  fillToCss,
  fontStack,
  isKhmerText,
  lineHeightOf,
  withKhmerBreaks,
  type LayerSource,
  type RenderItem,
  type RenderScene,
} from '@smart-canvas/core';
import { memo, type CSSProperties } from 'react';

export interface OutputRendererProps {
  scene: RenderScene;
  /** Layers by id: inputs and processes (core `layerSources`). */
  sources: readonly LayerSource[];
  /** Intrinsic asset sizes (layout deps), needed to draw a crop. */
  assetSizes?: Readonly<Record<string, { width: number; height: number }>>;
  assetUrl: (assetId: string) => string;
  /** Output pixels per design px. Export uses exportScaleOf(); previews fit a box. */
  scale: number;
  /** 'preview' draws placeholders for inputs that have no file yet; 'export' draws nothing for them. */
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

function Layer({ item, source, assetSizes, assetUrl, mode }: { item: RenderItem; source: LayerSource; assetSizes?: OutputRendererProps['assetSizes']; assetUrl: (id: string) => string; mode: 'preview' | 'export' }) {
  const { frame } = item;
  const { effect } = source;
  const box: CSSProperties = {
    position: 'absolute',
    left: frame.x,
    top: frame.y,
    width: frame.w,
    height: frame.h,
    ...(frame.rotation ? { transform: `rotate(${frame.rotation}deg)`, transformOrigin: '50% 50%' } : {}),
    ...(effect && effect.opacity !== 1 ? { opacity: effect.opacity } : {}),
    ...(effect && effectFilter(effect) ? { filter: effectFilter(effect) } : {}),
  };
  const data = { 'data-source-id': source.id, 'data-kind': source.kind };
  const { content } = source;

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
      if (effect && (effect.crop || effect.flipX || effect.rotate)) {
        const turn = `rotate(${effect.rotate}deg)${effect.flipX ? ' scaleX(-1)' : ''}`;
        if (!size) {
          // Size not known yet: mirror / turn the whole picture (a crop needs the size).
          return <img {...data} src={assetUrl(content.assetId)} alt="" draggable={false} style={{ ...box, objectFit: cover ? 'cover' : 'contain', transform: [box.transform, turn].filter(Boolean).join(' ') }} />;
        }
        const b = effectBoxes(frame, size, effect, cover, content.focal);
        const at = (r: { x: number; y: number; w: number; h: number }): CSSProperties => ({ position: 'absolute', left: r.x, top: r.y, width: r.w, height: r.h });
        return (
          <div {...data} style={{ ...box, overflow: 'hidden' }}>
            <div style={{ ...at(b.view), overflow: 'hidden' }}>
              <div style={{ ...at(b.pane), overflow: 'hidden', transform: turn, transformOrigin: '50% 50%' }}>
                <img src={assetUrl(content.assetId)} alt="" draggable={false} style={{ ...at(b.img), maxWidth: 'none' }} />
              </div>
            </div>
          </div>
        );
      }
      return (
        <img
          {...data}
          src={assetUrl(content.assetId)}
          alt=""
          draggable={false}
          style={{
            ...box,
            objectFit: cover ? 'cover' : 'contain',
            objectPosition: `${content.focal.x * 100}% ${content.focal.y * 100}%`,
          }}
        />
      );
    }

    case 'text': {
      const style = item.style ? { ...content.style, ...item.style } : content.style;
      const { text } = content;
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

/** A scene scaled to fit a box (main node, output nodes, lists). */
export function RenderThumbnail(props: Omit<OutputRendererProps, 'scale' | 'mode'> & { maxWidth: number; maxHeight: number }) {
  const { maxWidth, maxHeight, ...rest } = props;
  const scale = Math.min(maxWidth / props.scene.width, maxHeight / props.scene.height);
  return <OutputRenderer {...rest} scale={scale} mode="preview" className="sc-render--thumb" />;
}
