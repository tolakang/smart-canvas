/**
 * D46 / D49: the spec of a Preset node holding every size of a preset family (e.g. the 7 GDN sizes), for
 * `addPresetSet`. Shared by the board's "Add sizes" and the New project dialog (UX C1).
 */
import { presetFamilies, type SizePreset } from '@smart-canvas/core';
import { presetSettings } from './OutputNode';

export function familySetSpec(presets: readonly SizePreset[], family: string, board: { x: number; y: number }, newId: () => string) {
  const sizes = presetFamilies(presets).find((f) => f.label === family)?.presets ?? [];
  return { id: newId(), label: family, board, sizes: sizes.map((p) => ({ id: newId(), label: p.name, ...presetSettings(p), size: { ...p.size } })) };
}

/** How many sizes a family has. */
export const familySize = (presets: readonly SizePreset[], family: string): number => presetFamilies(presets).find((f) => f.label === family)?.presets.length ?? 0;
