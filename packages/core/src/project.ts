import { MAIN, newComposition } from './graph';
import type { ProjectDoc } from './model';
import { defaultSources } from './sources';

/**
 * A new project document: the master preview at the default size with the 4 default inputs (D8) as its rows
 * (front to back: Logo, Headline, Subject, Background), nothing wired yet.
 */
export function createProjectDoc(name: string): ProjectDoc {
  const sources = defaultSources();
  return {
    schema: 4,
    rev: 0,
    name,
    compositions: [{ ...newComposition(MAIN, 'Master preview', { x: 0, y: 0 }), layers: ['logo', 'headline', 'subject', 'background'] }],
    sources,
    outputs: [],
    edges: [],
  };
}

/** T7.3: a copy of a project's document under a new name (duplicate, template ↔ project). */
export function copyProjectDoc(doc: ProjectDoc, name: string): ProjectDoc {
  const copy = JSON.parse(JSON.stringify(doc)) as ProjectDoc;
  return { ...copy, name: name.trim() || doc.name, rev: 0 };
}
