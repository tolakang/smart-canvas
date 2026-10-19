/**
 * Text panel (T3.4): font, size, weight, colour, align, max lines, line height and language
 * (auto / Khmer / English) for the selected text input. Edits go through core setTextStyle (clamped).
 */
import {
  BUNDLED_FONTS,
  fontStack,
  isKhmerText,
  LINE_HEIGHT,
  setTextStyle,
  TEXT_LIMITS,
  type InputSource,
  type TextStyle,
  type TextStylePatch,
} from '@smart-canvas/core';
import { useBoard } from '../board/context';
import { setText } from '../board/content';
import { NumberField } from '../ui/NumberField';

const WEIGHT_NAME: Record<number, string> = { 100: 'Thin', 200: 'Extra light', 300: 'Light', 400: 'Regular', 500: 'Medium', 600: 'Semibold', 700: 'Bold', 800: 'Extra bold', 900: 'Black' };

export function TextPanel({ source }: { source: InputSource & { content: { kind: 'text' } } }) {
  const { run, editSource, readOnly, teamFonts } = useBoard();
  const { style, text } = source.content;
  const patch = (p: TextStylePatch) => run((d) => setTextStyle(d, source.id, p));
  const autoLh = isKhmerText(style, text) ? LINE_HEIGHT.khmer : LINE_HEIGHT.latin;
  const families = [...new Set([...BUNDLED_FONTS.map((f) => f.family), ...teamFonts.map((f) => f.family), style.fontFamily])];

  return (
    <aside className="sc-props" aria-label="Text">
      <div className="sc-layers__title">Text · {source.label}</div>
      <fieldset className="sc-props__body" disabled={readOnly}>
        <label className="sc-field sc-field--col">
          Text
          <textarea
            className="sc-text"
            aria-label="Text content"
            rows={3}
            value={text}
            lang={isKhmerText(style, text) ? 'km' : undefined}
            style={{ fontFamily: fontStack(style.fontFamily), fontWeight: style.fontWeight }}
            onChange={(e) => editSource(source.id, (s) => setText(s, e.target.value))}
          />
        </label>
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
        <div className="sc-props__row">
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
        <div className="sc-props__row">
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
        <div className="sc-props__row">
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
