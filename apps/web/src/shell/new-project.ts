/**
 * UX C1 (guided start, amends D49): what the New project dialog adds to a new board before it opens — a Preset node
 * for each size family picked (in a column under Main Comps, each clear of the one above, as + Add places them) and
 * the artwork files: logos (SVG, or a PDF page) into the Logo node, other pictures into the Image node. Pure.
 */
import { addPicturesToStack, addPresetSet, assetStacks, BOARD_LAYOUT, LIMITS, stackKind, type ProjectDoc, type SizePreset, type StackPicture } from '@smart-canvas/core';
import { familySetSpec, familySize } from '../board/preset-family';
import { GAP, presetBlock } from '../board/tidy';

/** Where a picture goes: a vector (SVG, a PDF page) is taken for a logo, anything else for a picture. */
export const pictureNode = (p: Pick<StackPicture, 'kind'>): 'logo' | 'image' => (p.kind === 'vector' ? 'logo' : 'image');

export function seedNewProject(doc: ProjectDoc, setup: { presets: readonly SizePreset[]; families: readonly string[]; pictures: readonly StackPicture[] }, newId: () => string): ProjectDoc {
  let next = doc;
  let y: number = BOARD_LAYOUT.preset.y;
  for (const family of setup.families) {
    const rows = familySize(setup.presets, family);
    if (!rows || next.outputs.length + rows > LIMITS.maxOutputs) continue;
    const r = addPresetSet(next, familySetSpec(setup.presets, family, { x: BOARD_LAYOUT.preset.x, y }, newId));
    if (!r.ok) continue;
    next = r.doc;
    y += presetBlock(rows).h + GAP;
  }
  for (const kind of ['logo', 'image'] as const) {
    const pictures = setup.pictures.filter((p) => pictureNode(p) === kind);
    const card = assetStacks(next).find((st) => stackKind(st) === kind);
    if (!pictures.length || !card) continue;
    const r = addPicturesToStack(next, card.id, pictures);
    if (r.ok) next = r.doc;
  }
  return next;
}
