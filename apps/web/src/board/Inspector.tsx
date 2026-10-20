/**
 * The right inspector (T13.2): settings of the selected node, so node cards stay small (thumbnail, name, size,
 * health). An output: name, layout health (D35), size / preset / scale / bleed, connection, hand edits. An
 * input: name, behaviour, visibility and its content editor. A composition (main preview, T12.3): name, canvas
 * size, rows and health.
 */
import {
  compositionById,
  compositionHealth,
  renameComposition,
  setCompositionSize,
  computeLayout,
  isOutputConnected,
  outputHealth,
  PROCESS_LABEL,
  renameSource,
  resetOutputOverrides,
  setSourceVisible,
  updateOutput,
  wiredLayers,
  type Health,
  type InputSource,
  type OutputNode,
} from '@smart-canvas/core';
import { useMemo, useState, type ReactNode } from 'react';
import { useBoard } from './context';
import { useAssetUpload } from './editors';
import { NumberField } from '../ui/NumberField';
import { compositionIdOfNode, inputNodeId, MAIN_ID, outputNodeId, processNodeId } from './flow';
import { ProcessSettings } from './ProcessSettings';
import { HealthIssues, healthSummary } from './HealthBadge';
import { Icon } from './LayerRow';
import { BehaviorPicker, SourceEditor } from './nodes';
import { OutputSettings } from './OutputSettings';

const KIND_LABEL = { image: 'Image', vector: 'Logo / SVG', text: 'Text', fill: 'Colour / gradient' } as const;

/** Docked on desktop; on tablets and phones (T13.6) an overlay or a bottom sheet with a close button. */
export function Inspector({ selected, floating, onClose }: { selected: string | null; floating?: 'overlay' | 'sheet'; onClose?: () => void }) {
  const { doc } = useBoard();
  const source = doc.sources.find((s) => inputNodeId(s.id) === selected);
  const output = doc.outputs.find((o) => outputNodeId(o.id) === selected);
  const composition = compositionIdOfNode(selected);
  const process = doc.processes.find((p) => processNodeId(p.id) === selected);
  return (
    <aside className={`sc-inspector-panel${floating ? ` sc-floating sc-floating--${floating} sc-floating--end` : ''}`} aria-label="Inspector">
      {floating && (
        <div className="sc-floating__head">
          <span>Inspector</span>
          <button type="button" className="sc-icon-btn" onClick={onClose} aria-label="Close inspector" title="Close">
            <Icon name="close" />
          </button>
        </div>
      )}
      {source ? (
        <InputInspector key={source.id} source={source} />
      ) : output ? (
        <OutputInspector key={output.id} output={output} />
      ) : process ? (
        <Section key={process.id} title={PROCESS_LABEL[process.op.type]}>
          <ProcessSettings process={process} />
        </Section>
      ) : composition && compositionById(doc, composition) ? (
        <CompositionInspector key={composition} compositionId={composition} />
      ) : (
        <Section title="Nothing selected">
          <p className="sc-muted sc-inspector-panel__hint">Click a node to see its settings here. Drag a wire out of the main preview to add an output; right-click the canvas to add inputs.</p>
        </Section>
      )}
    </aside>
  );
}

function Section({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className="sc-inspector-panel__section">
      <div className="sc-inspector-panel__title">
        <span>{title}</span>
        {aside}
      </div>
      {children}
    </section>
  );
}

/** A name field that commits on blur / Enter. */
function NameField({ label, value, onCommit }: { label: string; value: string; onCommit: (name: string) => void }) {
  const { readOnly } = useBoard();
  const [draft, setDraft] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    setShown(value);
    setDraft(value);
  }
  const commit = () => (draft.trim() && draft.trim() !== value ? onCommit(draft.trim()) : setDraft(value));
  return (
    <label className="sc-field sc-field--col">
      Name
      <input aria-label={label} value={draft} maxLength={200} disabled={readOnly} onChange={(e) => setDraft(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
    </label>
  );
}

function HealthSection({ health }: { health: Health }) {
  return (
    <Section title="Layout health" aside={<span className={`sc-inspector-panel__level sc-health--${health.level}`}>{healthSummary(health)}</span>}>
      {health.issues.length > 0 ? <HealthIssues health={health} className="sc-inspector-panel__issues" /> : null}
    </Section>
  );
}

function OutputInspector({ output }: { output: OutputNode }) {
  const { doc, run, readOnly, layoutDeps, missingFonts, openOutputEditor } = useBoard();
  const connected = isOutputConnected(doc, output.id);
  const health = useMemo(() => (layoutDeps ? outputHealth(doc, output.id, computeLayout(doc, output.id, layoutDeps), missingFonts) : null), [doc, output.id, layoutDeps, missingFonts]);
  return (
    <>
      <Section title="Output" aside={<button type="button" className="sc-btn" onClick={() => openOutputEditor(output.id)}>{readOnly ? 'View' : 'Edit'}</button>}>
        <NameField label="Output name" value={output.label} onCommit={(label) => run((d) => updateOutput(d, output.id, { label }))} />
      </Section>
      {health && <HealthSection health={health} />}
      <Section title="Size and export">
        <div className="sc-inspector-panel__form">
          <OutputSettings output={output} connected={connected} />
        </div>
      </Section>
      {output.overrides.length > 0 && (
        <Section title="Edited by hand">
          <p className="sc-muted sc-inspector-panel__hint">
            {output.overrides.length} {output.overrides.length === 1 ? 'layer differs' : 'layers differ'} from the automatic layout on this output.
          </p>
          {!readOnly && (
            <button type="button" className="sc-btn" onClick={() => window.confirm(`Reset all overridden layers of “${output.label}” to auto?`) && run((d) => resetOutputOverrides(d, output.id))}>
              Reset output
            </button>
          )}
        </Section>
      )}
    </>
  );
}

function InputInspector({ source }: { source: InputSource }) {
  const { run, readOnly } = useBoard();
  const upload = useAssetUpload(source);
  return (
    <>
      <Section title={KIND_LABEL[source.kind]}>
        <NameField label="Input name" value={source.label} onCommit={(label) => run((d) => renameSource(d, source.id, label))} />
        <label className="sc-field sc-field--col">
          Behaves like
          <BehaviorPicker source={source} />
        </label>
        <label className="sc-check">
          <input type="checkbox" checked={source.visible} disabled={readOnly} onChange={(e) => run((d) => setSourceVisible(d, source.id, e.target.checked))} /> Visible
        </label>
      </Section>
      <Section title="Content">
        <div className="sc-inspector-panel__form" {...upload.dropProps}>
          <SourceEditor source={source} upload={upload} />
        </div>
      </Section>
    </>
  );
}

function CompositionInspector({ compositionId }: { compositionId: string }) {
  const { doc, run, missingFonts, openMainEditor, readOnly } = useBoard();
  const comp = compositionById(doc, compositionId);
  if (!comp) return null;
  const health = compositionHealth(doc, compositionId, missingFonts);
  const wired = wiredLayers(doc, comp.id);
  const outputs = doc.edges.filter((e) => e.kind === 'composition' && e.from === comp.id).length;
  const setSize = (patch: Partial<typeof comp.size>) => run((d) => setCompositionSize(d, comp.id, { ...comp.size, ...patch }));
  return (
    <>
      <Section title="Main preview" aside={<button type="button" className="sc-btn" onClick={() => openMainEditor(comp.id)}>{readOnly ? 'View' : 'Edit'}</button>}>
        {comp.id === MAIN_ID ? (
          <p className="sc-inspector-panel__hint">{comp.label}</p>
        ) : (
          <NameField label="Main preview name" value={comp.label} onCommit={(label) => run((d) => renameComposition(d, comp.id, label))} />
        )}
        <p className="sc-inspector-panel__hint">
          {wired.size} of {comp.layers.length} layers wired · {outputs} {outputs === 1 ? 'output follows' : 'outputs follow'} it
        </p>
      </Section>
      <HealthSection health={health} />
      <Section title="Canvas">
        <div className="sc-output__row">
          <NumberField label="Width" value={comp.size.width} min={1} max={100000} step={1} disabled={readOnly} onCommit={(n) => n && setSize({ width: n })} />
          <NumberField label="Height" value={comp.size.height} min={1} max={100000} step={1} disabled={readOnly} onCommit={(n) => n && setSize({ height: n })} />
          <span className="sc-muted">{comp.size.unit}</span>
        </div>
      </Section>
    </>
  );
}
