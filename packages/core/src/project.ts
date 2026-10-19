import { DEFAULTS, type ProjectDoc } from './model';
import { defaultSources } from './sources';

/**
 * A new project document: master at the default size, the 4 default inputs (D8), nothing wired yet.
 */
export function createProjectDoc(name: string): ProjectDoc {
  return {
    schema: 1,
    rev: 0,
    name,
    master: { size: { ...DEFAULTS.masterSize }, placements: {}, board: { x: 0, y: 0 } },
    sources: defaultSources(),
    outputs: [],
    wires: [],
  };
}
