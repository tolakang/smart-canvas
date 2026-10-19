import { DEFAULTS, type ProjectDoc } from './model';

/**
 * A new, empty project document: master at the default size, nothing wired.
 * The 4 default input sources are added by T2.3.
 */
export function createProjectDoc(name: string): ProjectDoc {
  return {
    schema: 1,
    rev: 0,
    name,
    master: { size: { ...DEFAULTS.masterSize }, placements: {}, board: { x: 0, y: 0 } },
    sources: [],
    outputs: [],
    wires: [],
  };
}
