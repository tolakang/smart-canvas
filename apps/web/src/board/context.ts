import type { InputSource, LayoutDeps, OverrideAuthor, ProjectDoc, SizePreset, SourceResult, TeamRole } from '@smart-canvas/core';
import type { AssetMeta } from '../api';
import type { TeamFont } from '../fonts/loader';
import type { ApprovalState, ReviewData } from './review';
import { createContext, useContext } from 'react';

/** What node editors need from the board: where to upload, whether edits are allowed, how to apply them. */
export interface BoardActions {
  teamId: string;
  readOnly: boolean;
  /** D63: who is signed in and their role in the team (comments: who may edit, resolve, delete). */
  userId: string;
  role: TeamRole;
  /** D63: the project's API path, and its review of Previews (comments, approvals); null until loaded. */
  projectUrl: string;
  review: ReviewData | null;
  reloadReview: () => void;
  /** D63: each approved Preview's state (approved as it looks now, or changed since); others aren't listed. */
  approvals: ReadonlyMap<string, ApprovalState>;
  /** D63: approves a Preview as `fingerprint` (what it looks like now), or withdraws its approval (null). */
  reviewApprove: (outputId: string, fingerprint: string | null) => Promise<void>;
  /** The current project document (follows every edit). */
  doc: ProjectDoc;
  /** Opens the master preview editor on a composition (default: the master preview). */
  openMainEditor: (compositionId?: string) => void;
  /** `comments`: open with the Comment tool on (D63). */
  openOutputEditor: (outputId: string, opts?: { comments?: boolean }) => void;
  /** Opens the export dialog with these outputs chosen (T13.7: export a group); N6: or a Preset node's sizes, as one ZIP. */
  exportOutputs: (outputIds: string[], presetSetId?: string) => void;
  /** Stamp for override writes: the signed-in user, now. */
  author: () => OverrideAuthor;
  /** Uploaded team fonts (registered as @font-face rules), for font pickers. */
  teamFonts: TeamFont[];
  /** Current number of inputs. */
  sourceCount: number;
  editSource: (id: string, edit: (s: InputSource) => InputSource) => void;
  /** Engine deps for live output previews; null until text fonts are loaded. */
  layoutDeps: LayoutDeps | null;
  /** Text font families that failed to load (D35: an error on the nodes that use them). */
  missingFonts: readonly string[];
  /** Size presets for output pickers (built-in + team). */
  presets: readonly SizePreset[];
  /** N5: loads the presets again (after the team's presets changed). */
  reloadPresets: () => void;
  /** Records a newly uploaded asset's size for the engine. */
  rememberAsset: (asset: AssetMeta) => void;
  /** Disconnects an output, freezing its current layout (D20). */
  disconnectOutput: (outputId: string) => void;
  /** Reconnects an output to a composition (default main): silently, or after asking when it has overrides (D21). */
  reconnectOutput: (outputId: string, compositionId?: string) => void;
  /** D40: the picture of an Assets card shown in the inspector (while its card is selected). */
  stackFocus: string | null;
  setStackFocus: (sourceId: string | null) => void;
  /** Applies a core source operation; returns its error, if any. `silent` skips the undo step (metadata saves). */
  run: (op: (doc: ProjectDoc) => SourceResult, opts?: { silent?: boolean }) => SourceResult;
  /** UX B2: adds a Preset node of a family's sizes (null: a custom one) under the Main Comps group. */
  addSizes: (family: string | null) => void;
  /** D69 (UX B3): brings one panel close (selects it and zooms to it, at most 100%). */
  zoomTo: (nodeId: string) => void;
}

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoard(): BoardActions {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard outside <BoardContext>');
  return ctx;
}
