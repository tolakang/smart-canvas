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
  moveStackItem,
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
  deletePresetSet,
  presetSets,
  renameSet,
} from '@smart-canvas/core';
import { useMemo, useState, type ReactNode } from 'react';
import { api, assetUrl } from '../api';
import { newId } from './ids';
import { useBoard } from './context';
import { BackgroundSlots, useAssetUpload } from './editors';
import { NumberField } from '../ui/NumberField';
import { compositionIdOfNode, inputNodeId, outputNodeId, pairNodeId, setIdOfNode, stackNodeId } from './flow';
import { useSaveAsFamily } from './preset-save';
import { HEALTH_PILL, HealthIssues, healthSummary } from './HealthBadge';
import { confirmDelete, Icon } from './LayerRow';
import { BehaviorPicker, SourceEditor } from './nodes';
import { FAMILY_LABEL, useOpenLayout } from './MainNode';
import { OUTPUT_ROW, OutputSettings } from './OutputSettings';
import { ACTIONS, FORM, HINT, ISSUES, LEVEL, OVERVIEW_NAME, PANEL_HEAD, panelClass, SECTION, SECTION_TITLE, STAT, STAT_LABEL, STAT_VALUE, STATS, TIP_KEY, TIPS } from './panel';

/** UX A7 (F17): Delete node is a quiet row at the section's end, not a full-width red button under the pictures. */
const DELETE_NODE = 'sc-btn sc-btn--ghost sc-btn--danger justify-self-start';
/** UX A7: the language switch — two segments; the chosen one raised. */
const SWITCH =
  'items-stretch [&_label]:relative [&_label]:inline-flex [&_label]:cursor-pointer [&_label]:items-center [&_label]:rounded-sm [&_label]:px-(--sp-2) [&_label]:text-xs [&_label]:text-muted [&_label:has(:checked)]:bg-surface [&_label:has(:checked)]:text-fg [&_label:has(:checked)]:[box-shadow:var(--shadow-1)] [&_label:has(:focus-visible)]:[outline:2px_solid_var(--accent)] [&_input]:sr-only';
const KIND_LABEL = { image: 'Image', vector: 'Logo / SVG', text: 'Text', fill: 'Colour / gradient' } as const;
/** A picture of an asset node, in the inspector's grid: contained on a checkerboard. */
const PICK =
  'sc-assets__pick grid aspect-square size-full cursor-pointer [grid-template:minmax(0,1fr)/minmax(0,1fr)] place-items-center rounded-md border border-line p-2 [background:repeating-conic-gradient(var(--checker-a)_0_25%,var(--checker-b)_0_50%)_0_0/12px_12px]';

/** Docked on desktop; on tablets and phones (T13.6) an overlay or a bottom sheet with a close button. */
export function Inspector({ selected, floating, onClose, onHide }: { selected: string | null; floating?: 'overlay' | 'sheet'; onClose?: () => void; onHide?: () => void }) {
  const { doc } = useBoard();
  const source = doc.sources.find((s) => inputNodeId(s.id) === selected);
  const output = doc.outputs.find((o) => outputNodeId(o.id) === selected);
  const composition = compositionIdOfNode(selected);
  const stack = assetStacks(doc).find((st) => stackNodeId(st.id) === selected);
  const pair = languagePairs(doc).find((p) => pairNodeId(p.id) === selected);
  const set = presetSets(doc).find((st) => st.id === setIdOfNode(selected));
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
      ) : set ? (
        <PresetInspector key={set.id} setId={set.id} />
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
              Reset this Preview
            </button>
          )}
        </Section>
      )}
    </>
  );
}

/** `headline`: the picture of a Headline node's language (UX A4: named for what it is, not its file kind). */
function InputInspector({ source, headline }: { source: InputSource; headline?: boolean }) {
  const { run, readOnly } = useBoard();
  const upload = useAssetUpload(source);
  return (
    <>
      <Section title={headline ? 'Headline picture' : KIND_LABEL[source.kind]}>
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
        {/* UX A7 (F17): a segmented switch, not native radios (the radios stay, hidden, for the keyboard and screen readers). */}
        <div className={`sc-seg ${SWITCH}`} role="radiogroup" aria-label="Language every Preview uses">
          {(['km', 'en'] as const).map((lang) => (
            <label key={lang}>
              <input type="radio" name={`inspector-use-${pair.id}`} checked={pair.use === lang} disabled={readOnly} onChange={() => run((d) => setLanguage(d, pair.id, lang, layoutDeps?.assets))} />
              {LANGUAGE_LABEL[lang]}
            </label>
          ))}
        </div>
        <p className={HINT}>Every Preview draws the language in use. Switching swaps the picture only: it keeps its place and size (V4).</p>
        {!readOnly && (
          <button type="button" className={DELETE_NODE} aria-label={`Delete ${pair.label}`} onClick={() => window.confirm(`Delete “${pair.label}” with both languages? Their wires and edits on Previews go with them.`) && run((d) => deletePair(d, pair.id))}>
            <Icon name="trash" /> Delete node
          </button>
        )}
      </Section>
      {focused && <InputInspector key={focused.id} source={focused} headline />}
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
          <div className="sc-assets sc-assets--inspector my-8 grid list-none p-0 grid-cols-[repeat(2,minmax(0,1fr))] gap-12" role="list" aria-label={kind === 'text' ? 'Text slots' : 'Pictures'}>
            {items.map((s) => {
              const asset = s.content.kind === 'image' || s.content.kind === 'vector' ? s.content.assetId : null;
              return (
                <button key={s.id} type="button" role="listitem" className={`${PICK}${s.id === focused?.id ? ' sc-assets__item--focus [outline:2px_solid_var(--accent)] outline-offset-1 focus-visible:outline-offset-2' : ''}`} title={s.label} aria-label={`Set ${s.label}`} onClick={() => setStackFocus(s.id)}>
                  {asset ? <img className="size-full object-contain" src={assetUrl(teamId, asset)} alt="" draggable={false} /> : (
                    // UX A7 (F17): an empty slot shows what it holds, not a "?".
                    <span className="text-muted" aria-hidden="true">
                      <Icon name={s.content.kind === 'text' ? 'text' : 'image'} />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        )}
        {!readOnly && focused && items.length > 1 && (
          // UX B4 (F9): the card's drag-to-reorder, without dragging (WCAG 2.5.7): the picture set below moves one place.
          <div className="sc-assets__move flex flex-wrap gap-6" role="group" aria-label={`Move ${focused.label}`}>
            {(['left', 'right'] as const).map((dir) => {
              const at = items.findIndex((x) => x.id === focused.id);
              const to = dir === 'left' ? at - 1 : at + 1;
              return (
                <button key={dir} type="button" className="sc-btn" disabled={to < 0 || to >= items.length} aria-label={`Move ${focused.label} ${dir}`} onClick={() => run((d) => moveStackItem(d, stack.id, focused.id, to))}>
                  <Icon name={dir === 'left' ? 'back' : 'forward'} /> Move {dir}
                </button>
              );
            })}
          </div>
        )}
        {!readOnly && (
          <button type="button" className={DELETE_NODE} aria-label={`Delete ${stack.label}`} onClick={() => window.confirm(`Delete “${stack.label}” and its ${items.length} ${kind === 'text' ? 'text slots' : 'pictures'}? Their wires and edits on Previews go with them.`) && run((d) => deleteStack(d, stack.id))}>
            <Icon name="trash" /> Delete node
          </button>
        )}
      </Section>
      {focused && <InputInspector key={focused.id} source={focused} />}
    </>
  );
}

/** UX B6 (F12): a selected Preset node — its name, its sizes, Export and Save as team preset; sizes are added on the card. */
function PresetInspector({ setId }: { setId: string }) {
  const { doc, run, readOnly, exportOutputs } = useBoard();
  const set = presetSets(doc).find((st) => st.id === setId);
  const outputs = (set?.outputs ?? []).flatMap((id) => doc.outputs.filter((o) => o.id === id));
  const saving = useSaveAsFamily(set ?? { id: setId, label: '', board: { x: 0, y: 0 }, outputs: [] }, outputs);
  if (!set) return null;
  return (
    <Section
      title="Preset node"
      aside={
        outputs.length > 0 && (
          <button type="button" className="sc-btn" onClick={() => exportOutputs(outputs.map((o) => o.id), set.id)}>
            <Icon name="export" /> Export {outputs.length}
          </button>
        )
      }
    >
      <NameField label="Preset node name" value={set.label} onCommit={(label) => run((d) => renameSet(d, set.id, label))} />
      <p className={`sc-muted ${HINT}`}>
        {outputs.length ? `${outputs.length} ${outputs.length === 1 ? 'size' : 'sizes'}, each its own Preview.` : 'No sizes yet.'} Add sizes with “Add a size” on the node.
      </p>
      {outputs.length > 0 && (
        <ul className="sc-preset-inspector__sizes m-0 grid list-none gap-2 p-0 text-[12.5px]" aria-label="Sizes">
          {outputs.map((o) => (
            <li key={o.id} className="flex justify-between gap-8">
              <span className="overflow-hidden text-ellipsis whitespace-nowrap">{o.label}</span>
              <span className="flex-none text-muted [font-variant-numeric:tabular-nums]">
                {o.size.width} × {o.size.height} {o.size.unit}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!readOnly && outputs.length > 0 && (
        <button type="button" className="sc-btn justify-self-start" onClick={() => void saving.save()}>
          <Icon name="library" /> Save as team preset
        </button>
      )}
      {saving.note && (
        <p className={`sc-muted ${HINT}`} role="status">
          {saving.note}
        </p>
      )}
      {!readOnly && (
        <button type="button" className={DELETE_NODE} aria-label={`Delete ${set.label}`} onClick={() => window.confirm(`Delete “${set.label}” and its ${outputs.length} sizes?`) && run((d) => deletePresetSet(d, set.id))}>
          <Icon name="trash" /> Delete node
        </button>
      )}
    </Section>
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
      <Section title="Main Comps">
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
        <p className={`sc-muted ${HINT}`}>Each size uses the layout closest to its shape; change that in the Export Group.</p>
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
  const hasArtwork = doc.sources.some((s) => (s.content.kind === 'image' || s.content.kind === 'vector' ? Boolean(s.content.assetId) : s.content.kind === 'text' && s.content.text.trim() !== ''));
  const approved = doc.outputs.filter((o) => approvals.get(o.id)?.state === 'approved').length;
  const open = (review?.comments ?? []).filter((c) => !c.parentId && !c.resolvedAt && doc.outputs.some((o) => o.id === c.outputId)).length;
  const stats = [
    { label: previews === 1 ? 'Preview' : 'Previews', value: previews },
    { label: 'Approved', value: `${approved}/${previews}` },
    { label: 'Comments', value: open },
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
        {!readOnly && previews === 0 && (
          // UX B2 (F3): a new project's three steps, the next one marked.
          <ol className="sc-overview__steps m-0 grid list-none gap-6 p-0 text-[12.5px]" aria-label="Getting started">
            {[
              { label: 'Add your artwork to the asset nodes', done: hasArtwork },
              { label: 'Add sizes in the Export Group', done: false },
              { label: 'Export', done: false },
            ].map((step, i, all) => {
              const next = !step.done && all.slice(0, i).every((s) => s.done);
              return (
                <li key={step.label} className={`flex items-center gap-8 ${step.done ? 'text-muted line-through' : next ? 'font-[600] text-fg' : 'text-muted'}`} aria-current={next ? 'step' : undefined}>
                  <span className={`grid size-20 flex-none place-items-center rounded-[50%] text-[11px] font-[700] ${step.done ? 'bg-ok-soft text-ok' : next ? 'bg-accent text-on-accent' : 'bg-surface-2'}`} aria-hidden="true">
                    {step.done ? <Icon name="check" size={12} /> : i + 1}
                  </span>
                  {step.label}
                  {step.done && <span className="sr-only">(done)</span>}
                </li>
              );
            })}
          </ol>
        )}
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
              <strong className={TIP_KEY}>Drag a wire</strong> out of the Main Comps group: a Preset node of sizes.
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
