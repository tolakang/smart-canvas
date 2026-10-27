/**
 * Text panel (T3.4): font, size, weight, colour, align, max lines, line height and language
 * (auto / Khmer / English) for the selected text input. Edits go through core setTextStyle (clamped).
 */
import {
  BUNDLED_FONTS,
  fontStack,
  isKhmerText,
  LINE_HEIGHT,
  setOverrideStyle,
  setTextStyle,
  TEXT_LIMITS,
  type InputSource,
  type TextStyle,
  type TextStylePatch,
} from '@smart-canvas/core';
import { useBoard } from '../board/context';
import { setText } from '../board/content';
import { NumberField } from '../ui/NumberField';
import { NOTE, PANEL_TITLE, PROPS, PROPS_BODY, PROPS_ROW, TEXT } from './panels';

const WEIGHT_NAME: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

/**
 * Without `outputId` it edits the source (master); with it, it edits that output's style override (T5.1):
 * shown values are the source style with the override on top, and the text itself stays shared.
 */
export function TextPanel({ source, outputId }: { source: InputSource & { content: { kind: 'text' } }; outputId?: string }) {
  const { doc, run, editSource, readOnly, teamFonts, author } = useBoard();
  const { text } = source.content;
  const override = outputId ? doc.outputs.find((o) => o.id === outputId)?.overrides.find((o) => o.sourceId === source.id)?.style : undefined;
  const style: TextStyle = { ...source.content.style, ...override };
  const patch = (p: TextStylePatch) =>
    run((d) => (outputId ? setOverrideStyle(d, outputId, source.id, p, author()) : setTextStyle(d, source.id, p)));
  const autoLh = isKhmerText(style, text) ? LINE_HEIGHT.khmer : LINE_HEIGHT.latin;
  const families = [...new Set([...BUNDLED_FONTS.map((f) => f.family), ...teamFonts.map((f) => f.family), style.fontFamily])];

  return (
    <aside className={PROPS} aria-label="Text">
      <div className={PANEL_TITLE}>Text · {source.label}</div>
      <fieldset className={PROPS_BODY} disabled={readOnly}>
        {outputId ? (
          <p className={`sc-muted ${NOTE}`}>Text is shared by every Preview; edit it on the Layer Comp. Style changes here apply to this Preview only.</p>
        ) : (
        <label className="sc-field sc-field--col">
          Text
          <textarea
            className={TEXT}
            aria-label="Text content"
            rows={3}
            value={text}
            lang={isKhmerText(style, text) ? 'km' : undefined}
            style={{ fontFamily: fontStack(style.fontFamily), fontWeight: style.fontWeight }}
            onChange={(e) => editSource(source.id, (s) => setText(s, e.target.value))}
          />
        </label>
        )}
        <label className="sc-field sc-field--col">
          Font
          <select value={style.fontFamily} onChange={(e) => patch({ fontFamily: e.target.value })} style={{ fontFamily: fontStack(style.fontFamily) }}>
            {families.map((f) => (
              <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>
                {f}
                {teamFonts.some((t) => t.family === f) ? ' (team)' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className={PROPS_ROW}>
          <NumberField
            label="Size (px)"
            value={style.fontSizePx}
            min={TEXT_LIMITS.minFontPx}
            max={TEXT_LIMITS.maxFontPx}
            step={1}
            disabled={readOnly}
            onCommit={(n) => n !== null && patch({ fontSizePx: n })}
          />
          <label className="sc-field sc-field--col">
            Weight
            <select value={style.fontWeight} onChange={(e) => patch({ fontWeight: Number(e.target.value) })}>
              {TEXT_LIMITS.weights.map((w) => (
                <option key={w} value={w}>
                  {w} {WEIGHT_NAME[w]}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className={PROPS_ROW}>
          <label className="sc-field sc-field--col">
            Colour
            <input type="color" value={style.color} onChange={(e) => patch({ color: e.target.value })} />
          </label>
          <div className="sc-field sc-field--col">
            Align
            <div className="sc-seg" role="radiogroup" aria-label="Align">
              {(['left', 'center', 'right'] as const).map((a) => (
                <label key={a}>
                  <input type="radio" name={`align-${source.id}`} checked={style.align === a} onChange={() => patch({ align: a })} />
                  {a[0]?.toUpperCase() + a.slice(1)}
                </label>
              ))}
            </div>
          </div>
        </div>
        <div className={PROPS_ROW}>
          <NumberField
            label="Max lines"
            value={style.maxLines}
            min={1}
            max={TEXT_LIMITS.maxLines}
            step={1}
            disabled={readOnly}
            onCommit={(n) => n !== null && patch({ maxLines: n })}
          />
          <NumberField
            label="Line height"
            value={style.lineHeight ?? ''}
            placeholder={`Auto (${autoLh})`}
            min={TEXT_LIMITS.minLineHeight}
            max={TEXT_LIMITS.maxLineHeight}
            step={0.05}
            disabled={readOnly}
            onCommit={(n) => patch({ lineHeight: n })}
          />
        </div>
        <label className="sc-field sc-field--col">
          Language
          <select value={style.language ?? 'auto'} onChange={(e) => patch({ language: e.target.value as TextStyle['language'] })}>
            <option value="auto">Auto (detect Khmer)</option>
            <option value="km">Khmer</option>
            <option value="en">English / Latin</option>
          </select>
        </label>
      </fieldset>
    </aside>
  );
}
