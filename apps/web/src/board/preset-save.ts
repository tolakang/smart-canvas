/**
 * N5: saves a Preset node's sizes as the team's preset family (sizes the family already has are skipped). Shared by
 * the node's ⋯ menu and the Preset node inspector (UX B6), so both say the same thing.
 */
import { presetFamilies, type OutputNode, type PresetSet } from '@smart-canvas/core';
import { useState } from 'react';
import { api, ApiError } from '../api';
import { useBoard } from './context';

export function useSaveAsFamily(set: PresetSet, outputs: readonly OutputNode[]) {
  const { presets, reloadPresets, teamId } = useBoard();
  const [note, setNote] = useState<string | null>(null);
  async function save() {
    const name = window.prompt('Save these sizes as a team preset family named', set.label)?.trim();
    if (!name) return;
    const family = presetFamilies(presets).find((f) => f.label === name);
    if (family?.presets.some((p) => p.teamId === null)) return setNote(`“${name}” is a built-in preset; pick another name.`);
    const has = new Set(family?.presets.map((p) => `${p.size.width}×${p.size.height}${p.size.unit}`));
    const todo = outputs.filter((o) => !has.has(`${o.size.width}×${o.size.height}${o.size.unit}`));
    try {
      for (const o of todo)
        await api('POST', `/teams/${teamId}/presets`, { group: o.size.unit === 'mm' ? 'print' : 'social', name: `${name} ${o.size.width}×${o.size.height}`, family: name, size: { ...o.size } });
      setNote(`Saved as team preset “${name}” (${(family?.presets.length ?? 0) + todo.length} sizes).`);
      reloadPresets();
    } catch (err) {
      setNote(err instanceof ApiError && err.status === 403 ? 'Only team admins can save presets.' : 'Could not save the preset.');
      reloadPresets();
    }
  }
  return { save, note };
}
