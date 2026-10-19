import type { InputSource, ProjectDoc, SourceResult } from '@smart-canvas/core';
import { createContext, useContext } from 'react';

/** What node editors need from the board: where to upload, whether edits are allowed, how to apply them. */
export interface BoardActions {
  teamId: string;
  readOnly: boolean;
  /** Current number of inputs (for the 10-input cap). */
  sourceCount: number;
  editSource: (id: string, edit: (s: InputSource) => InputSource) => void;
  /** Applies a core source operation; returns its error, if any. */
  run: (op: (doc: ProjectDoc) => SourceResult) => SourceResult;
}

export const BoardContext = createContext<BoardActions | null>(null);

export function useBoard(): BoardActions {
  const ctx = useContext(BoardContext);
  if (!ctx) throw new Error('useBoard outside <BoardContext>');
  return ctx;
}
