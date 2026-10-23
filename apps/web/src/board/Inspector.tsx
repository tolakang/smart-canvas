/**
 * The right inspector (T13.2): settings of the selected node, so node cards stay small (thumbnail, name, size,
 * health). An output: name, layout health (D35), size / preset / scale / bleed, connection, hand edits. An
 * input: name, behaviour, visibility, its content editor and its actions (duplicate, save to library, delete). The
 * Layer Comp group (D49, N1): layer count, the three layout editors, health and the square layout's size.
 */
import {
  deletePair,
  LANGUAGE_LABEL,
  languagePairs,
  pairInputs,
  renamePair,
  setLanguage,
  assetStacks,
  STACK_LABEL,
  stackKind,
  GUIDE_FAMILIES,
  compositionById,
  deleteStack,
  renameStack,
  compositionHealth,
  deleteSource,
  duplicateSource,
  libraryEntryOf,
  LIMITS,
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
import { api, assetUrl } from '../api';
import { newId } from './ids';
import { useBoard } from './context';
import { BackgroundSlots, useAssetUpload } from './editors';
import { NumberField } from '../ui/NumberField';
import { compositionIdOfNode, inputNodeId, MAIN_ID, outputNodeId, pairNodeId, processNodeId, stackNodeId } from './flow';
import { ProcessSettings } from './ProcessSettings';
import { HealthIssues, healthSummary } from './HealthBadge';
import { confirmDelete, Icon } from './LayerRow';
import { BehaviorPicker, SourceEditor } from './nodes';
import { FAMILY_LABEL, useOpenLayout } from './MainNode';
import { OutputSettings } from './OutputSettings';

const KIND_LABEL = { image: 'Image', vector: 'Logo / SVG', text: 'Text', fill: 'Colour / gradient' } as const;

/** Docked on desktop; on tablets and phones (T13.6) an overlay or a bottom sheet with a close button. */
export function Inspector({ selected, floating, onClose }: { selected: string | null; floating?: 'overlay' | 'sheet'; onClose?: () => void }) {
  const { doc } = useBoard();
  const source = doc.sources.find((s) => inputNodeId(s.id) === selected);
  const output = doc.outputs.find((o) => outputNodeId(o.id) === selected);
  const composition = compositionIdOfNode(selected);
  const process = doc.processes.find((p) => processNodeId(p.id) === selected);
  const stack = assetStacks(doc).find((st) => stackNodeId(st.id) === selected);
  const pair = languagePairs(doc).find((p) => pairNodeId(p.id) === selected);
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
      {pair ? (
        <HeadlineInspector key={pair.id} pairId={pair.id} />
      ) : stack ? (
        <AssetsInspector key={stack.id} stackId={stack.id} />
      ) : source ? (
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
          <p className="sc-muted sc-inspector-panel__hint">Click a node to see its settings here. Use + Add or right-click the canvas to add asset and Preset nodes; drag a wire out of the Layer Comp group to add a Preset node.</p>
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
      <Section title="Preview" aside={<button type="button" className="sc-btn" onClick={() => openOutputEditor(output.id)}>{readOnly ? 'View' : 'Edit'}</button>}>
        <NameField label="Preview name" value={output.label} onCommit={(label) => run((d) => updateOutput(d, output.id, { label }))} />
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
      {source.behavesLike === 'background' && source.content.kind !== 'text' && (
        <Section title="For vertical and horizontal outputs">
          <p className="sc-muted sc-inspector-panel__hint">Optional: a picture for vertical outputs and one for horizontal outputs. Each output uses the one for its shape; square outputs use the main picture.</p>
          <BackgroundSlots source={source} />
        </Section>
      )}
      {!readOnly && <InputActions source={source} />}
    </>
  );
}

/** What used to be the icon row on the input node: duplicate, save to the team library, delete. */
function InputActions({ source }: { source: InputSource }) {
  const { run, sourceCount, teamId } = useBoard();
  const [saved, setSaved] = useState<'idle' | 'saved' | 'failed'>('idle');
  const full = sourceCount >= LIMITS.maxSources;
  async function saveToLibrary() {
    const name = window.prompt('Save to the team library as', source.label);
    if (name === null) return;
    try {
      await api('POST', `/teams/${teamId}/library`, { ...libraryEntryOf(source, name), tags: [] });
      setSaved('saved');
    } catch {
      setSaved('failed');
    }
  }
  return (
    <Section title="Actions">
      <div className="sc-inspector-panel__actions">
        <button type="button" className="sc-btn" disabled={full} title={full ? `${LIMITS.maxSources} inputs max` : undefined} aria-label={`Duplicate ${source.label}`} onClick={() => run((d) => duplicateSource(d, source.id, newId()))}>
          <Icon name="plus" /> Duplicate
        </button>
        <button type="button" className="sc-btn" aria-label={`Save ${source.label} to library`} onClick={() => void saveToLibrary()}>
          <Icon name={saved === 'saved' ? 'check' : 'library'} /> {saved === 'saved' ? 'Saved to library' : saved === 'failed' ? 'Try again' : 'Save to library'}
        </button>
        <button type="button" className="sc-btn sc-btn--danger" aria-label={`Delete ${source.label}`} onClick={() => confirmDelete(source.label) && run((d) => deleteSource(d, source.id))}>
          <Icon name="trash" /> Delete
        </button>
      </div>
      <p className="sc-muted sc-inspector-panel__hint">Or select nodes and press Delete.</p>
    </Section>
  );
}

/** D44: a Headline card — its name, the language in use, and the picked language's input settings. */
function HeadlineInspector({ pairId }: { pairId: string }) {
  const { doc, run, readOnly, stackFocus } = useBoard();
  const pair = languagePairs(doc).find((p) => p.id === pairId);
  if (!pair) return null;
  const focusId = stackFocus && pairInputs(pair).includes(stackFocus) ? stackFocus : pair.use === 'km' ? pair.km : pair.en;
  const focused = doc.sources.find((s) => s.id === focusId);
  return (
    <>
      <Section title="Headline node">
        <NameField label="Headline name" value={pair.label} onCommit={(label) => run((d) => renamePair(d, pair.id, label))} />
        <div className="sc-seg" role="radiogroup" aria-label="Language every output uses">
          {(['km', 'en'] as const).map((lang) => (
            <label key={lang}>
              <input type="radio" name={`inspector-use-${pair.id}`} checked={pair.use === lang} disabled={readOnly} onChange={() => run((d) => setLanguage(d, pair.id, lang))} />
              {LANGUAGE_LABEL[lang]}
            </label>
          ))}
        </div>
        <p className="sc-inspector-panel__hint">Every output draws the language in use. Each language keeps its own position and size.</p>
        {!readOnly && (
          <button type="button" className="sc-btn sc-btn--danger" aria-label={`Delete ${pair.label}`} onClick={() => window.confirm(`Delete “${pair.label}” with both languages? Their wires and output overrides go with them.`) && run((d) => deletePair(d, pair.id))}>
            <Icon name="trash" /> Delete node
          </button>
        )}
      </Section>
      {focused && <InputInspector key={focused.id} source={focused} />}
    </>
  );
}

/** D40: an Assets card — its name and pictures; the picture picked on the card (or here) is set below. */
function AssetsInspector({ stackId }: { stackId: string }) {
  const { doc, run, readOnly, stackFocus, setStackFocus, teamId } = useBoard();
  const stack = assetStacks(doc).find((st) => st.id === stackId);
  if (!stack) return null;
  const kind = stackKind(stack);
  const items = stack.items.flatMap((id) => doc.sources.find((s) => s.id === id) ?? []);
  const focused = items.find((s) => s.id === stackFocus) ?? items[0];
  return (
    <>
      <Section title={`${STACK_LABEL[kind]} node`}>
        <NameField label={`${STACK_LABEL[kind]} node name`} value={stack.label} onCommit={(label) => run((d) => renameStack(d, stack.id, label))} />
        <p className="sc-inspector-panel__hint">
          {items.length} {kind === 'text' ? (items.length === 1 ? 'text slot' : 'text slots') : items.length === 1 ? 'picture' : 'pictures'}, each its own layer.{kind === 'text' ? ' Add slots on the node.' : ' Drop more files on the node.'}
        </p>
        {items.length > 0 && (
          <div className="sc-assets sc-assets--inspector" role="list" aria-label={kind === 'text' ? 'Text slots' : 'Pictures'}>
            {items.map((s) => {
              const asset = s.content.kind === 'image' || s.content.kind === 'vector' ? s.content.assetId : null;
              return (
                <button key={s.id} type="button" role="listitem" className={`sc-assets__pick${s.id === focused?.id ? ' sc-assets__item--focus' : ''}`} title={s.label} aria-label={`Set ${s.label}`} onClick={() => setStackFocus(s.id)}>
                  {asset ? <img src={assetUrl(teamId, asset)} alt="" draggable={false} /> : '?'}
                </button>
              );
            })}
          </div>
        )}
        {!readOnly && (
          <button type="button" className="sc-btn sc-btn--danger" aria-label={`Delete ${stack.label}`} onClick={() => window.confirm(`Delete “${stack.label}” and its ${items.length} ${kind === 'text' ? 'text slots' : 'pictures'}? Their wires and output overrides go with them.`) && run((d) => deleteStack(d, stack.id))}>
            <Icon name="trash" /> Delete node
          </button>
        )}
      </Section>
      {focused && <InputInspector key={focused.id} source={focused} />}
    </>
  );
}

function CompositionInspector({ compositionId }: { compositionId: string }) {
  const { doc, run, missingFonts, readOnly } = useBoard();
  const openLayout = useOpenLayout(compositionId);
  const comp = compositionById(doc, compositionId);
  if (!comp) return null;
  const health = compositionHealth(doc, compositionId, missingFonts);
  const wired = wiredLayers(doc, comp.id);
  const outputs = doc.edges.filter((e) => e.kind === 'composition' && e.from === comp.id).length;
  const setSize = (patch: Partial<typeof comp.size>) => run((d) => setCompositionSize(d, comp.id, { ...comp.size, ...patch }));
  return (
    <>
      <Section title="Layer Comp">
        {comp.id === MAIN_ID ? null : <NameField label="Layer comp name" value={comp.label} onCommit={(label) => run((d) => renameComposition(d, comp.id, label))} />}
        <p className="sc-inspector-panel__hint">
          {wired.size} of {comp.layers.length} layers wired · {outputs} {outputs === 1 ? 'size follows' : 'sizes follow'} it
        </p>
        <div className="sc-inspector-panel__actions" role="group" aria-label="Layouts">
          {GUIDE_FAMILIES.map((f) => (
            <button key={f} type="button" className="sc-btn" onClick={() => openLayout(f)} aria-label={`${readOnly ? 'View' : 'Edit'} ${FAMILY_LABEL[f]} layout`}>
              {FAMILY_LABEL[f]}
            </button>
          ))}
        </div>
        <p className="sc-muted sc-inspector-panel__hint">Each size uses the layout closest to its shape; change that in the Core Preset Guide.</p>
      </Section>
      <HealthSection health={health} />
      <Section title="Square layout size">
        <div className="sc-output__row">
          <NumberField label="Width" value={comp.size.width} min={1} max={100000} step={1} disabled={readOnly} onCommit={(n) => n && setSize({ width: n })} />
          <NumberField label="Height" value={comp.size.height} min={1} max={100000} step={1} disabled={readOnly} onCommit={(n) => n && setSize({ height: n })} />
          <span className="sc-muted">{comp.size.unit}</span>
        </div>
      </Section>
    </>
  );
}
