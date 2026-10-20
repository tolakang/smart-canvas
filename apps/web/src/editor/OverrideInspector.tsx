/**
 * Override inspector (T5.2): for the selected layer of an output, which fields its override changes and
 * what the automatic layout would give instead.
 */
import { overrideDiff, type OverrideField } from '@smart-canvas/core';
import { useBoard } from '../board/context';

const LABEL: Record<string, string> = {
  x: 'X',
  y: 'Y',
  w: 'Width',
  h: 'Height',
  rotation: 'Rotation',
  hidden: 'Hidden',
  fontSizePx: 'Font size (fixed, no auto-fit)',
  fontFamily: 'Font',
  fontWeight: 'Weight',
  color: 'Colour',
  align: 'Align',
  maxLines: 'Max lines',
  lineHeight: 'Line height',
  language: 'Language',
  textTransform: 'Transform',
  letterSpacingEm: 'Letter spacing',
};

const show = (v: OverrideField['auto']) => (v === undefined ? 'auto' : typeof v === 'number' ? String(Math.round(v * 10) / 10) : String(v));

export function OverrideInspector({ outputId, sourceId }: { outputId: string; sourceId: string }) {
  const { doc, layoutDeps } = useBoard();
  const fields = layoutDeps ? overrideDiff(doc, outputId, sourceId, layoutDeps) : [];
  const override = doc.outputs.find((o) => o.id === outputId)?.overrides.find((o) => o.sourceId === sourceId);
  return (
    <section className="sc-inspector" aria-label="Overrides">
      <div className="sc-layers__title">{override ? '🔒 Overridden on this output' : 'Automatic layout'}</div>
      {fields.length === 0 ? (
        <p className="sc-muted sc-props__note">{override ? 'Same as auto.' : 'No overrides: this layer follows the main preview.'}</p>
      ) : (
        <table className="sc-inspector__table">
          <thead>
            <tr>
              <th>Field</th>
              <th>Auto</th>
              <th>Override</th>
            </tr>
          </thead>
          <tbody>
            {fields.map((f) => (
              <tr key={f.field} data-field={f.field}>
                <td>{LABEL[f.field] ?? f.field}</td>
                <td className="sc-muted">{show(f.auto)}</td>
                <td>{show(f.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {override && (
        <p className="sc-muted sc-props__note">
          Last changed {new Date(override.updatedAt).toLocaleString()}
        </p>
      )}
    </section>
  );
}
