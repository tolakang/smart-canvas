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
  setCompositionSize,
  computeLayout,
  isOutputConnected,
  outputHealth,
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
import { compositionIdOfNode, inputNodeId, outputNodeId, pairNodeId, stackNodeId } from './flow';
import { HEALTH_PILL, HealthIssues, healthSummary } from './HealthBadge';
import { confirmDelete, Icon } from './LayerRow';
import { BehaviorPicker, SourceEditor } from './nodes';
import { FAMILY_LABEL, useOpenLayout } from './MainNode';
import { OUTPUT_ROW, OutputSettings } from './OutputSettings';
import { ACTIONS, FORM, HINT, ISSUES, LEVEL, OVERVIEW_NAME, PANEL_HEAD, panelClass, SECTION, SECTION_TITLE, STAT, STAT_LABEL, STAT_VALUE, STATS, TIP_KEY, TIPS } from './panel';

const KIND_LABEL = { image: 'Image', vector: 'Logo / SVG', text: 'Text', fill: 'Colour / gradient' } as const;

/** Docked on desktop; on tablets and phones (T13.6) an overlay or a bottom sheet with a close button. */
export function Inspector({ selected, floating, onClose, onHide }: { selected: string | null; floating?: 'overlay' | 'sheet'; onClose?: () => void; onHide?: () => void }) {
  const { doc } = useBoard();
  const source = doc.sources.find((s) => inputNodeId(s.id) === selected);
  const output = doc.outputs.find((o) => outputNodeId(o.id) === selected);
  const composition = compositionIdOfNode(selected);
  const stack = assetStacks(doc).find((st) => stackNodeId(st.id) === selected);
  const pair = languagePairs(doc).find((p) => pairNodeId(p.id) === selected);
  return (
    <aside className={panelClass(floating)} aria-label="Inspector">
      {floating && (
        <div className={PANEL_HEAD}>
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
      ) : composition && compositionById(doc, composition) ? (
        <CompositionInspector key={composition} compositionId={composition} />
      ) : (
        <ProjectOverview onHide={onHide} />
      )}
    </aside>
  );
}

function Section({ title, children, aside }: { title: ReactNode; children: ReactNode; aside?: ReactNode }) {
  return (
    <section className={SECTION}>
      <div className={SECTION_TITLE}>
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
    <Section title="Layout health" aside={<span className={`${LEVEL} sc-health--${health.level} ${HEALTH_PILL[health.level]}`}>{healthSummary(health)}</span>}>
      {health.issues.length > 0 ? <HealthIssues health={health} className={ISSUES} /> : null}
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
        <div className={FORM}>
          <OutputSettings output={output} connected={connected} />
        </div>
      </Section>
      {output.overrides.length > 0 && (
        <Section title="Edited by hand">
          <p className={`sc-muted ${HINT}`}>
            {output.overrides.length} {output.overrides.length === 1 ? 'layer differs' : 'layers differ'} from the automatic layout on this Preview.
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
        <div className={FORM} {...upload.dropProps}>
          <SourceEditor source={source} upload={upload} />
        </div>
      </Section>
      {source.behavesLike === 'background' && source.content.kind !== 'text' && (
        <Section title="Square, vertical and horizontal">
          <p className={`sc-muted ${HINT}`}>Each Preview uses the picture of its group (Square, Vertical or Horizontal). An empty slot uses the square picture.</p>
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
      <div className={ACTIONS}>
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
      <p className={`sc-muted ${HINT}`}>Or select nodes and press Delete.</p>
    </Section>
  );
}

/** D44: a Headline card — its name, the language in use, and the picked language's input settings. */
function HeadlineInspector({ pairId }: { pairId: string }) {
  const { doc, run, readOnly, stackFocus, layoutDeps } = useBoard();
  const pair = languagePairs(doc).find((p) => p.id === pairId);
  if (!pair) return null;
  const focusId = stackFocus && pairInputs(pair).includes(stackFocus) ? stackFocus : pair.use === 'km' ? pair.km : pair.en;
  const focused = doc.sources.find((s) => s.id === focusId);
  return (
    <>
      <Section title="Headline node">
        <NameField label="Headline name" value={pair.label} onCommit={(label) => run((d) => renamePair(d, pair.id, label))} />
        <div className="sc-seg" role="radiogroup" aria-label="Language every Preview uses">
          {(['km', 'en'] as const).map((lang) => (
            <label key={lang}>
              <input type="radio" name={`inspector-use-${pair.id}`} checked={pair.use === lang} disabled={readOnly} onChange={() => run((d) => setLanguage(d, pair.id, lang, layoutDeps?.assets))} />
              {LANGUAGE_LABEL[lang]}
            </label>
          ))}
        </div>
        <p className={HINT}>Every Preview draws the language in use. Each language keeps its own position and size.</p>
        {!readOnly && (
          <button type="button" className="sc-btn sc-btn--danger" aria-label={`Delete ${pair.label}`} onClick={() => window.confirm(`Delete “${pair.label}” with both languages? Their wires and edits on Previews go with them.`) && run((d) => deletePair(d, pair.id))}>
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
        <p className={HINT}>
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
          <button type="button" className="sc-btn sc-btn--danger" aria-label={`Delete ${stack.label}`} onClick={() => window.confirm(`Delete “${stack.label}” and its ${items.length} ${kind === 'text' ? 'text slots' : 'pictures'}? Their wires and edits on Previews go with them.`) && run((d) => deleteStack(d, stack.id))}>
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
        <p className={HINT}>
          {wired.size} of {comp.layers.length} layers wired · {outputs} {outputs === 1 ? 'size follows' : 'sizes follow'} it
        </p>
        <div className={ACTIONS} role="group" aria-label="Layouts">
          {GUIDE_FAMILIES.map((f) => (
            <button key={f} type="button" className="sc-btn" onClick={() => openLayout(f)} aria-label={`${readOnly ? 'View' : 'Edit'} ${FAMILY_LABEL[f]} layout`}>
              {FAMILY_LABEL[f]}
            </button>
          ))}
        </div>
        <p className={`sc-muted ${HINT}`}>Each size uses the layout closest to its shape; change that in the Core preset.</p>
      </Section>
      <HealthSection health={health} />
      <Section title="Square layout size">
        <div className={OUTPUT_ROW}>
          <NumberField label="Width" value={comp.size.width} min={1} max={100000} step={1} disabled={readOnly} onCommit={(n) => n && setSize({ width: n })} />
          <NumberField label="Height" value={comp.size.height} min={1} max={100000} step={1} disabled={readOnly} onCommit={(n) => n && setSize({ height: n })} />
          <span className="sc-muted">{comp.size.unit}</span>
        </div>
      </Section>
    </>
  );
}

/**
 * U2: with nothing selected, the panel says how the project stands — its Previews, approvals and open comments —
 * with Export all at hand and the three ways to add panels; "Hide panel" gives the canvas the room.
 */
function ProjectOverview({ onHide }: { onHide?: () => void }) {
  const { doc, review, approvals, exportOutputs, readOnly } = useBoard();
  const previews = doc.outputs.length;
  const approved = doc.outputs.filter((o) => approvals.get(o.id)?.state === 'approved').length;
  const open = (review?.comments ?? []).filter((c) => !c.parentId && !c.resolvedAt && doc.outputs.some((o) => o.id === c.outputId)).length;
  const stats = [
    { label: previews === 1 ? 'Preview' : 'Previews', value: previews },
    { label: 'Approved', value: `${approved}/${previews}` },
    { label: open === 1 ? 'Comment' : 'Comments', value: open },
  ];
  return (
    <>
      <section className={`${SECTION} sc-overview`}>
        <div className={SECTION_TITLE}>
          <span className={OVERVIEW_NAME} title={doc.name}>
            {doc.name}
          </span>
          {onHide && (
            <button type="button" className="sc-icon-btn" onClick={onHide} aria-label="Hide panel" title="Hide the side panel">
              <Icon name="panel" />
            </button>
          )}
        </div>
        <p className={`sc-muted ${HINT}`}>Nothing selected. Click a panel on the board to see its settings here.</p>
        <dl className={STATS}>
          {stats.map((s) => (
            <div key={s.label} className={STAT}>
              <dt className={STAT_LABEL}>{s.label}</dt>
              <dd className={STAT_VALUE}>{s.value}</dd>
            </div>
          ))}
        </dl>
        {!readOnly && previews > 0 && (
          <button type="button" className="sc-btn sc-btn--primary" onClick={() => exportOutputs(doc.outputs.map((o) => o.id))}>
            <Icon name="export" /> Export all {previews}
          </button>
        )}
      </section>
      {!readOnly && (
        <section className={SECTION}>
          <div className={SECTION_TITLE}>Add to the board</div>
          <ul className={TIPS}>
            <li>
              <strong className={TIP_KEY}>+ Add</strong> in the top bar, or right-click the canvas: asset nodes and Preset nodes.
            </li>
            <li>
              <strong className={TIP_KEY}>Drag a wire</strong> out of the Layer Comp group: a Preset node of sizes.
            </li>
            <li>
              <strong className={TIP_KEY}>Drop pictures</strong> on the canvas: an Image node with them.
            </li>
          </ul>
        </section>
      )}
    </>
  );
}
