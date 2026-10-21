import type { InputSource, LayoutDeps, OverrideAuthor, ProjectDoc, SizePreset, SourceResult } from '@smart-canvas/core';
import type { AssetMeta } from '../api';
import type { TeamFont } from '../fonts/loader';
import { createContext, useContext } from 'react';

/** What node editors need from the board: where to upload, whether edits are allowed, how to apply them. */
export interface BoardActions {
  teamId: string;
  readOnly: boolean;
  /** The current project document (follows every edit). */
  doc: ProjectDoc;
  /** Opens the master preview editor on a composition (default: the master preview). */
  openMainEditor: (compositionId?: string) => void;
  openOutputEditor: (outputId: string) => void;
  /** Opens the export dialog with these outputs chosen (T13.7: export a group). */
  exportOutputs: (outputIds: string[]) => void;
  /** Stamp for override writes: the signed-in user, now. */
  author: () => OverrideAuthor;
  /** Uploaded team fonts (registered as @font-face rules), for font pickers. */
  teamFonts: TeamFont[];
  /** Current number of inputs (for the 10-input cap). */
  sourceCount: number;
  editSource: (id: string, edit: (s: InputSource) => InputSource) => void;
  /** Engine deps for live output previews; null until text fonts are loaded. */
  layoutDeps: LayoutDeps | null;
  /** Text font families that failed to load (D35: an error on the nodes that use them). */
  missingFonts: readonly string[];
  /** Size presets for output pickers (built-in + team). */
  presets: readonly SizePreset[];
  /** Records a newly uploaded asset's size for the engine. */
  rememberAsset: (asset: AssetMeta) => void;
  /** Disconnects an output, freezing its current layout (D20). */
  disconnectOutput: (outputId: string) => void;
  /** Reconnects an output to a composition (default main): silently, or after asking when it has overrides (D21). */
  reconnectOutput: (outputId: string, compositionId?: string) => void;
  /** Applies a core source operation; returns its error, if any. */
  run: (op: (doc: ProjectDoc) => SourceResult) => SourceResult;
}

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoard(): BoardActions {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard outside <BoardContext>');
  return ctx;
}
