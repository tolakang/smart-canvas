/**
 * D77 (owner, 2026-11-03): a Logo node's sets. The slot headings — Square, Vertical, Horizontal — show once, over the
 * rows; each row is one set (its square picture and D74's vertical and horizontal ones), deleted with its row's bin.
 * Every Preview picks the set's picture for its layout. Only the set in use is drawn; the switch over the rows (with
 * two sets or more) changes it, and the row in use is outlined. "Add logo set" adds an empty row.
 */
import { addLogoSet, addPicturesToStack, deleteLogoSet, logoSetInUse, setLogoSet, type AssetStack, type InputSource } from '@smart-canvas/core';
import { useState } from 'react';
import { assetUrl, uploadAsset } from '../api';
import { setAsset, setVariant, withSource } from './content';
import { useBoard } from './context';
import { newId } from './ids';
import { Icon } from './LayerRow';
import { Slot } from './Slot';
import { NO_CANVAS } from './pinch';
import { labelOf, PICTURE_ACCEPT } from './stack-upload';
import { ADD_BUTTON, iconBtn } from '../ui/button';
import { SEGMENT_OFF, SEGMENT_ON, SWITCH } from '../ui/controls';

const FAMILIES = [
  { key: 'square', name: 'Square' },
  { key: 'vertical', name: 'Vertical' },
  { key: 'horizontal', name: 'Horizontal' },
] as const;
/** Three slots and the row's bin. */
const COLS = 'grid grid-cols-[repeat(3,minmax(0,1fr))_28px] items-center gap-8 pointer-coarse:grid-cols-[repeat(3,minmax(0,1fr))_44px]';

export function LogoSets(props: {
  stack: AssetStack;
  items: InputSource[];
  selected: boolean;
  /** Replaces a set's square (main) picture, keeping its place in every layout. */
  onReplace: (id: string, file: File) => void;
  replacing: string | null;
}) {
  const { stack, items } = props;
  const { teamId, readOnly, run, stackFocus, setStackFocus, rememberAsset, layoutDeps } = useBoard();
  const [busy, setBusy] = useState<string | null>(null);
  const [focus, setFocus] = useState<string | null>(null);
  const use = logoSetInUse(stack);
  const putVariant = async (id: string, family: 'vertical' | 'horizontal', file: File) => {
    setBusy(`${id}:${family}`);
    try {
      const asset = await uploadAsset(teamId, file);
      if (asset.kind !== 'image' && asset.kind !== 'vector') return;
      rememberAsset(asset);
      run((d) => ({ ok: true, doc: withSource(d, id, (x) => setVariant(x, family, asset.id)) }));
    } catch {
      // as a replace: a failed upload leaves the slot as it was
    } finally {
      setBusy(null);
    }
  };
  const setName = (i: number) => `Set ${i + 1}`;
  /** An empty node's ready row: a file put in one of its slots makes the first set (D68: no empty layer before that). */
  const firstSet = async (family: (typeof FAMILIES)[number]['key'], file: File) => {
    setBusy(`new:${family}`);
    try {
      const asset = await uploadAsset(teamId, file);
      if (asset.kind !== 'image' && asset.kind !== 'vector') return;
      rememberAsset(asset);
      const id = newId();
      const kind = asset.kind;
      run((d) => {
        if (family === 'square') return addPicturesToStack(d, stack.id, [{ id, label: labelOf(file.name), kind, assetId: asset.id }]);
        const made = addLogoSet(d, stack.id, id);
        return made.ok ? { ok: true, doc: withSource(made.doc, id, (x) => setVariant(x, family, asset.id)) } : made;
      });
    } catch {
      // a failed upload leaves the row empty
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={`sc-logo-sets grid gap-10 ${NO_CANVAS}`}>
      {items.length > 1 && (
        <div className={`${SWITCH} justify-self-start`} role="radiogroup" aria-label={`${stack.label} set in use`}>
          {items.map((s, i) => (
            <label key={s.id} className={use === s.id ? SEGMENT_ON : SEGMENT_OFF}>
              <input
                className="absolute inset-0 m-0 cursor-pointer opacity-0"
                type="radio"
                name={`use-${stack.id}`}
                checked={use === s.id}
                disabled={readOnly}
                onChange={() => run((d) => setLogoSet(d, stack.id, s.id, layoutDeps?.assets))}
              />
              {setName(i)}
            </label>
          ))}
        </div>
      )}
      {(items.length > 0 || !readOnly) && (
        <div className={`${COLS} px-6 text-[12px] font-[600] text-muted`} aria-hidden="true">
          {FAMILIES.map((f) => (
            <span key={f.key}>{f.name}</span>
          ))}
        </div>
      )}
      {items.length === 0 && !readOnly && (
        <div className={`sc-logo-set sc-logo-set--new ${COLS} rounded-[14px] p-6`} role="group" aria-label={`${stack.label}: first set`}>
          {FAMILIES.map((f) => (
            <Slot
              key={f.key}
              bare
              src={null}
              alt=""
              busy={busy === `new:${f.key}`}
              accept={PICTURE_ACCEPT}
              emptyText={f.key === 'square' ? 'Add the square logo' : `Add the ${f.key} logo`}
              names={{ select: `${f.name} logo`, file: `${f.name} logo for ${stack.label}` }}
              onFile={(file) => void firstSet(f.key, file)}
            />
          ))}
          <span />
        </div>
      )}
      <ul className="m-0 grid list-none gap-8 p-0" aria-label={`${stack.label} sets`}>
        {items.map((s, i) => {
          const pic = s.content.kind === 'image' || s.content.kind === 'vector' ? s.content : null;
          const inUse = use === s.id && items.length > 1;
          return (
            <li
              key={s.id}
              className={`sc-logo-set group/set ${COLS} rounded-[14px] p-6 [transition:background_var(--t-fast),box-shadow_var(--t-fast)] ${inUse ? 'bg-[color-mix(in_srgb,var(--accent-soft)_55%,transparent)] [box-shadow:inset_0_0_0_1.5px_var(--accent)]' : ''}`}
              role="group"
              aria-label={`${s.label}: square, vertical and horizontal`}
            >
              {FAMILIES.map((f) => {
                const asset = f.key === 'square' ? pic?.assetId : pic?.variants?.[f.key];
                const key = `${s.id}:${f.key}`;
                const own = f.key === 'square';
                return (
                  <Slot
                    key={f.key}
                    bare
                    src={asset ? assetUrl(teamId, asset) : null}
                    alt={own ? `${s.label} preview` : `${s.label} ${f.key} preview`}
                    busy={own ? props.replacing === s.id : busy === key}
                    focused={props.selected && (own ? stackFocus === s.id && !focus?.startsWith(`${s.id}:`) : focus === key)}
                    dimmed={!s.visible}
                    readOnly={readOnly}
                    accept={PICTURE_ACCEPT}
                    emptyText={own ? `Add the square logo of ${setName(i)}` : `${f.name} logo (empty: the square one is used)`}
                    names={
                      own
                        ? { select: `Select ${s.label}`, file: `Replace ${s.label}`, remove: `Remove picture from ${s.label}` }
                        : { select: `${s.label} ${f.key}`, file: `${f.name} logo for ${s.label}`, remove: `Clear ${f.key} logo of ${s.label}` }
                    }
                    onSelect={() => {
                      setStackFocus(s.id);
                      setFocus(own ? null : key);
                    }}
                    onFile={(file) => (f.key === 'square' ? props.onReplace(s.id, file) : void putVariant(s.id, f.key, file))}
                    onRemovePicture={() =>
                      run((d) => ({ ok: true, doc: withSource(d, s.id, (x) => (f.key === 'square' ? setAsset(x, null) : setVariant(x, f.key, null))) }))
                    }
                  />
                );
              })}
              {!readOnly ? (
                <button
                  type="button"
                  className={`${iconBtn({ size: 'size-28', round: 'rounded-[8px]', transition: '[transition:opacity_var(--t-fast)]' })} sc-logo-set__delete opacity-0 group-hover/set:opacity-100 group-focus-within/set:opacity-100 [@media(hover:none)]:opacity-100`}
                  aria-label={`Delete ${setName(i)} of ${stack.label}`}
                  title="Delete this logo set (its three pictures)"
                  onClick={() => window.confirm(`Delete ${setName(i)} (its square, vertical and horizontal logos)?`) && run((d) => deleteLogoSet(d, stack.id, s.id, layoutDeps?.assets))}
                >
                  <Icon name="trash" size={14} />
                </button>
              ) : (
                <span />
              )}
            </li>
          );
        })}
      </ul>
      {!readOnly && (
        <button type="button" className={`${ADD_BUTTON} sc-logo-sets__add`} onClick={() => run((d) => addLogoSet(d, stack.id, newId()))}>
          <Icon name="plus" size={14} /> Add logo set
        </button>
      )}
    </div>
  );
}
