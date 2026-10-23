/**
 * The page-3 board (D49, owner 2026-10-22: "Use new structure core and UI UX from pdf"): asset nodes — Logo,
 * Headline (Khmer / English), Text (text slots), Image, Background (vertical / horizontal) — wired into one Layer
 * Comp (the master, with its square / vertical / horizontal layouts, D42) beside its Core Rule, which feeds Preset
 * nodes, each size wired to its Preview. Nothing else is on the board.
 *
 * `boardStructure` brings any document into that shape, keeping what fits (process nodes, other master previews
 * and Core Rule nodes left the document in the v3 migration, D56): inputs outside a node join the node of their kind (logo, text, picture); an output outside a Preset
 * node joins a "Sizes" preset node; a missing Logo / Headline / Text / Image / Background node is added. (The Layer Comp's vertical and horizontal
 * layouts are added when first opened; until then outputs follow the master on the stretched grid.) It returns `doc` itself
 * when the document is already in shape. Pure; ids of what it adds are derived from the doc, so it is repeatable.
 */
import { MAIN } from './graph';
import { addLanguagePair, languagePairs, pairInputs } from './languages';
import { orderLayers } from './layer-order';
import type { ProjectDoc } from './model';
import { PREVIEW_OFFSET } from './preset-sets';
import { createProjectDoc } from './project';
import { connectSource } from './ports';
import { addSource } from './sources';
import { addStack, assetStacks, stackKind } from './stacks';

/** Where the page-3 nodes go on a new board (board px). */
export const BOARD_LAYOUT = {
  logo: { x: 0, y: 0 },
  headline: { x: 320, y: 0 },
  text: { x: 640, y: 0 },
  image: { x: 960, y: 0 },
  background: { x: 1280, y: 0 },
  comp: { x: 420, y: 560 },
  preset: { x: 420, y: 1160 },
} as const;

const uniqueId = (doc: ProjectDoc, base: string): string => {
  const taken = new Set([...doc.sources.map((s) => s.id), ...doc.compositions.map((c) => c.id), ...doc.outputs.map((o) => o.id), ...(doc.stacks ?? []).map((s) => s.id), ...(doc.headlines ?? []).map((p) => p.id), ...(doc.presetSets ?? []).map((s) => s.id)]);
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
};

const step = (doc: ProjectDoc, r: { ok: true; doc: ProjectDoc } | { ok: false }): ProjectDoc => (r.ok ? r.doc : doc);

/** The document in the page-3 shape (see above); `doc` itself when nothing changes. */
export function boardStructure(doc: ProjectDoc): ProjectDoc {
  let next = doc;
  // 1. The asset nodes. Inputs outside a node join the first node of their kind: logos the Logo node, text the
  // Text node, other pictures the Image node (backgrounds are each their own Background node). Each kind of
  // node exists at least once.
  const inCards = new Set([...assetStacks(next).flatMap((s) => s.items), ...languagePairs(next).flatMap(pairInputs)]);
  const kindOf = (b: string, k: string): 'logo' | 'text' | 'image' | null => (b === 'background' ? null : b === 'logo' ? 'logo' : b === 'text' || k === 'text' ? 'text' : 'image');
  for (const kind of ['logo', 'text', 'image'] as const) {
    const loose = next.sources.filter((x) => !inCards.has(x.id) && kindOf(x.behavesLike, x.kind) === kind).map((x) => x.id);
    let card = assetStacks(next).find((st) => stackKind(st) === kind);
    if (!card) {
      next = step(next, addStack(next, { id: uniqueId(next, kind === 'image' ? 'images' : `${kind}s`), board: BOARD_LAYOUT[kind], ...(kind === 'image' ? { label: 'Image' } : { kind }) }));
      card = assetStacks(next).find((st) => stackKind(st) === kind);
    }
    if (card && loose.length) {
      const id = card.id;
      next = { ...next, stacks: assetStacks(next).map((st) => (st.id === id ? { ...st, items: [...st.items, ...loose] } : st)) };
    }
  }
  if (languagePairs(next).length === 0) {
    const id = uniqueId(next, 'headline');
    next = step(next, addLanguagePair(next, { id, km: uniqueId(next, `${id}-km`), en: uniqueId(next, `${id}-en`), board: BOARD_LAYOUT.headline }));
  }
  if (!next.sources.some((s) => s.behavesLike === 'background')) {
    const id = uniqueId(next, 'background');
    next = step(next, addSource(next, { id, kind: 'image', label: 'Background', behavesLike: 'background', board: BOARD_LAYOUT.background }));
    next = step(next, connectSource(next, id));
  }

  // 2. Outputs outside a Preset node join a "Sizes" preset node.
  const inSets = new Set((next.presetSets ?? []).flatMap((s) => s.outputs));
  const loose2 = next.outputs.filter((o) => !inSets.has(o.id)).map((o) => o.id);
  if (loose2.length) {
    // Its Previews in a column to its right (as a new Preset node's).
    const at = new Map(loose2.map((id, i) => [id, { x: BOARD_LAYOUT.preset.x + PREVIEW_OFFSET.x, y: BOARD_LAYOUT.preset.y + i * PREVIEW_OFFSET.rowGap }]));
    next = {
      ...next,
      outputs: next.outputs.map((o) => (at.has(o.id) ? { ...o, board: at.get(o.id) ?? o.board } : o)),
      presetSets: [...(next.presetSets ?? []), { id: uniqueId(next, 'sizes'), label: 'Sizes', board: { ...BOARD_LAYOUT.preset }, outputs: loose2 }],
    };
  }

  next = orderLayers(next);
  return next === doc ? doc : next;
}

/** A new project on the page-3 board: every asset node wired into the Layer Comp, nothing else. */
export function createBoardProject(name: string): ProjectDoc {
  let doc = createProjectDoc(name);
  // Wired first, so the master's layouts (added by the structure) get every layer too.
  for (const s of doc.sources) doc = step(doc, connectSource(doc, s.id));
  doc = { ...doc, compositions: doc.compositions.map((c) => (c.id === MAIN ? { ...c, label: 'Layer comp', board: { ...BOARD_LAYOUT.comp } } : c)) };
  doc = boardStructure(doc);
  return {
    ...doc,
    sources: doc.sources.map((s) => (s.behavesLike === 'background' ? { ...s, board: { ...BOARD_LAYOUT.background } } : s)),
    ...(doc.stacks ? { stacks: doc.stacks.map((st) => ({ ...st, board: { ...BOARD_LAYOUT[stackKind(st)] } })) } : {}),
  };
}
