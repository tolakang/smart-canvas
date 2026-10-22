/**
 * The page-3 board (D49, owner 2026-10-22: "Use new structure core and UI UX from pdf"): asset nodes — Logo,
 * Headline (Khmer / English), Image (an Assets card), Background (vertical / horizontal) — wired into one Layer
 * Comp (the master, with its square / vertical / horizontal layouts, D42) beside its Core Rule, which feeds Preset
 * nodes, each size wired to its Preview. Nothing else is on the board.
 *
 * `boardStructure` brings any document into that shape, keeping what fits: text inputs, process nodes, other
 * master previews and Core Rule nodes are removed (their wires and rows with them); loose pictures move into the
 * Image node; an output outside a Preset node joins a "Sizes" preset node; a missing Logo / Headline / Image /
 * Background node is added, wired; the master gets its vertical and horizontal layouts. It returns `doc` itself
 * when the document is already in shape. Pure; ids of what it adds are derived from the doc, so it is repeatable.
 */
import { edgeId, MAIN } from './graph';
import { addGuides, familyOfShape, GUIDE_FAMILIES, guidesOf } from './guides';
import { addLanguagePair, languagePairs } from './languages';
import { orderLayers } from './layer-order';
import { LIMITS, type GuideFamily, type ProjectDoc } from './model';
import { deleteComposition } from './compositions';
import { deleteProcess } from './processes';
import { createProjectDoc } from './project';
import { sizeInDesignPx } from './render';
import { connectSource } from './ports';
import { addSource, deleteSource } from './sources';
import { addStack, assetStacks } from './stacks';

/** Where the page-3 nodes go on a new board (board px). */
export const BOARD_LAYOUT = {
  logo: { x: 0, y: 0 },
  headline: { x: 320, y: 0 },
  image: { x: 640, y: 0 },
  background: { x: 960, y: 0 },
  comp: { x: 300, y: 520 },
  preset: { x: 300, y: 1100 },
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
  // 1. Off the board: process nodes, other master previews (not the master's own layouts), text inputs, Core Rule nodes.
  for (const p of next.processes) next = step(next, deleteProcess(next, p.id));
  for (const c of next.compositions) {
    if (c.id === MAIN || c.guide?.of === MAIN) continue;
    // Its outputs follow the master instead.
    const outs = next.edges.filter((e) => e.kind === 'composition' && e.from === c.id).map((e) => e.to);
    next = step(next, deleteComposition(next, c.id));
    next = { ...next, edges: [...next.edges, ...outs.filter((o) => !next.edges.some((e) => e.kind === 'composition' && e.to === o)).map((o) => ({ id: edgeId(MAIN, o, 'composition'), from: MAIN, to: o, kind: 'composition' as const }))] };
  }
  for (const s of next.sources.filter((x) => x.kind === 'text' || x.behavesLike === 'text')) next = step(next, deleteSource(next, s.id));
  if (next.coreRules) {
    next = { ...next };
    delete next.coreRules;
  }

  // 2. The asset nodes: loose pictures join the Image node; each kind of node exists at least once.
  const inCards = new Set([...assetStacks(next).flatMap((s) => s.items), ...languagePairs(next).flatMap((p) => [p.km, p.en])]);
  const loose = next.sources.filter((s) => !inCards.has(s.id) && s.behavesLike !== 'logo' && s.behavesLike !== 'background');
  if (assetStacks(next).length === 0 || loose.length) {
    let stack = assetStacks(next)[0];
    if (!stack) {
      const id = uniqueId(next, 'images');
      next = step(next, addStack(next, { id, label: 'Image', board: BOARD_LAYOUT.image }));
      stack = assetStacks(next)[0];
    }
    if (stack && loose.length) {
      const sid = stack.id;
      next = { ...next, stacks: assetStacks(next).map((s) => (s.id === sid ? { ...s, items: [...s.items, ...loose.map((l) => l.id)] } : s)) };
    }
  }
  if (!next.sources.some((s) => s.behavesLike === 'logo')) {
    const id = uniqueId(next, 'logo');
    next = step(next, addSource(next, { id, kind: 'vector', label: 'Logo', behavesLike: 'logo', board: BOARD_LAYOUT.logo }));
    next = step(next, connectSource(next, id));
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

  // 3. The Layer Comp's three layouts: the master's own shape plus a vertical and a horizontal (or square) one.
  const master = next.compositions.find((c) => c.id === MAIN);
  if (master) {
    const own = familyOfShape(sizeInDesignPx(master.size));
    const have = new Set(guidesOf(next, MAIN).map((g) => g.guide?.family));
    const missing = GUIDE_FAMILIES.filter((f) => f !== own && !have.has(f));
    if (missing.length && next.compositions.length + missing.length <= LIMITS.maxCompositions) {
      const ids: Partial<Record<GuideFamily, string>> = {};
      for (const f of missing) ids[f] = uniqueId(next, `layout-${f}`);
      next = step(next, addGuides(next, MAIN, ids));
    }
  }

  // 4. Outputs outside a Preset node join a "Sizes" preset node.
  const inSets = new Set((next.presetSets ?? []).flatMap((s) => s.outputs));
  const loose2 = next.outputs.filter((o) => !inSets.has(o.id)).map((o) => o.id);
  if (loose2.length) next = { ...next, presetSets: [...(next.presetSets ?? []), { id: uniqueId(next, 'sizes'), label: 'Sizes', board: { ...BOARD_LAYOUT.preset }, outputs: loose2 }] };

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
  const place = (b: string) => (b === 'logo' ? BOARD_LAYOUT.logo : b === 'background' ? BOARD_LAYOUT.background : null);
  return {
    ...doc,
    sources: doc.sources.map((s) => {
      const at = place(s.behavesLike);
      return at ? { ...s, board: { ...at } } : s;
    }),
    ...(doc.stacks ? { stacks: doc.stacks.map((st, i) => (i === 0 ? { ...st, board: { ...BOARD_LAYOUT.image } } : st)) } : {}),
  };
}
