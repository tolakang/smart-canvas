/**
 * Override inspector (T5.2): for the selected layer of an output, which fields its override changes and
 * what the automatic layout would give instead.
 */
import { overrideDiff, resetOverride, type OverrideField } from '@smart-canvas/core';
import { useBoard } from '../board/context';
import { INSPECTOR, INSPECTOR_ACTIONS, INSPECTOR_NOTE, INSPECTOR_TABLE, PANEL_TITLE } from './panels';

const LABEL: Record<string, string> = {
  x: 'X',
  y: 'Y',
  w: 'Width',
  h: 'Height',
  rotation: 'Rotation',
  shear: 'Skew',
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
  const { doc, layoutDeps, run, readOnly } = useBoard();
  const fields = layoutDeps ? overrideDiff(doc, outputId, sourceId, layoutDeps) : [];
  const override = doc.outputs.find((o) => o.id === outputId)?.overrides.find((o) => o.sourceId === sourceId);
  return (
    <section className={INSPECTOR} aria-label="Overrides">
      <div className={PANEL_TITLE}>{override ? 'Edited by hand on this Preview' : 'Automatic layout'}</div>
      {fields.length === 0 ? (
        <p className={`sc-muted ${INSPECTOR_NOTE}`}>{override ? 'Same as auto.' : 'No overrides: this layer follows the Layer Comp.'}</p>
      ) : (
        <table className={INSPECTOR_TABLE}>
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
        <p className={`sc-muted ${INSPECTOR_NOTE}`}>
          Last changed {new Date(override.updatedAt).toLocaleString()}
        </p>
      )}
      {override && !readOnly && (
        <div className={INSPECTOR_ACTIONS}>
          <button type="button" onClick={() => run((d) => resetOverride(d, outputId, sourceId))}>
            Reset layer
          </button>
        </div>
      )}
    </section>
  );
}
