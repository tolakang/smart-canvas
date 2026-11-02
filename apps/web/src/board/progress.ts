/**
 * UX C1 (D71): the guided start's four steps and whether each is done — artwork in, sizes picked, every Preview
 * approved, a first export. Worked out from the doc and the review each render; only "exported" is remembered
 * (in this browser, per project). Pure.
 */
import { isEmptyLayer, type ProjectDoc } from '@smart-canvas/core';
import type { ApprovalState } from './review';

export type GuideStepId = 'assets' | 'sizes' | 'review' | 'export';
export interface GuideStep {
  id: GuideStepId;
  label: string;
  done: boolean;
}

export function guideSteps(doc: ProjectDoc, approvals: ReadonlyMap<string, ApprovalState>, exported: boolean): GuideStep[] {
  const sized = doc.outputs.length > 0;
  return [
    { id: 'assets', label: 'Artwork', done: doc.sources.some((s) => s.content.kind !== 'fill' && !isEmptyLayer(s)) },
    { id: 'sizes', label: 'Sizes', done: sized },
    { id: 'review', label: 'Review', done: sized && doc.outputs.every((o) => approvals.get(o.id)?.state === 'approved') },
    { id: 'export', label: 'Export', done: exported },
  ];
}

/** The step to do next: the first one not done (none once all are). */
export const nextStep = (steps: readonly GuideStep[]): GuideStepId | null => steps.find((s) => !s.done)?.id ?? null;
