/**
 * JSON schema for ProjectDoc (docs/DATA-MODEL.ts) as accepted on save: schema 2 (D32), or schema 1 from a
 * client that has not reloaded yet (the route migrates it with migrateProjectDoc before storing).
 * Checks the shape and the caps (LIMITS); deeper rules (rows, wiring) belong to the core helpers.
 */
import { LIMITS } from '@smart-canvas/core';

const num = { type: 'number' } as const;
const str = { type: 'string' } as const;
const id = { type: 'string', minLength: 1, maxLength: 100 } as const;
const point = { type: 'object', required: ['x', 'y'], properties: { x: num, y: num } } as const;
const size = {
  type: 'object',
  required: ['width', 'height', 'unit'],
  properties: { width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 }, unit: { enum: ['px', 'mm'] } },
} as const;
const frame = { type: 'object', required: ['x', 'y', 'w', 'h'], properties: { x: num, y: num, w: num, h: num, rotation: num, shear: num, fitted: { type: 'boolean' } } } as const;

const sourceProps = {
    id,
    label: { type: 'string', maxLength: 200 },
    kind: { enum: ['image', 'vector', 'text', 'fill'] },
    behavesLike: { enum: ['background', 'subject', 'text', 'logo', 'decoration'] },
    visible: { type: 'boolean' },
    content: { type: 'object', required: ['kind'], properties: { kind: { enum: ['image', 'vector', 'text', 'fill'] } } },
    libraryItemId: str,
    board: point,
} as const;
const source = { type: 'object', required: ['id', 'label', 'kind', 'behavesLike', 'visible', 'content', 'board'], properties: sourceProps } as const;
const sourceV1 = {
  type: 'object',
  required: ['id', 'label', 'kind', 'behavesLike', 'port', 'visible', 'content', 'board'],
  properties: { ...sourceProps, port: { type: 'integer', minimum: 0, maximum: LIMITS.maxSources - 1 } },
} as const;

const output = {
  type: 'object',
  required: ['id', 'label', 'size', 'family', 'overrides', 'board'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    presetId: str,
    size,
    dpi: { type: 'number', exclusiveMinimum: 0 },
    exportScale: { type: 'number', minimum: 1, maximum: 4 },
    bleedMm: { type: 'number', minimum: 0 },
    safeMarginPct: { type: 'number', minimum: 0, maximum: 50 },
    family: { enum: ['auto', 'stack', 'side'] },
    overrides: { type: 'array', items: { type: 'object', required: ['sourceId'], properties: { sourceId: id } } },
    frozen: { type: 'object' },
    layers: { type: 'array', maxItems: LIMITS.maxSources, items: id },
    board: point,
  },
} as const;

const wire = { type: 'object', required: ['id', 'from', 'to'], properties: { id, from: id, to: id, port: { type: 'integer', minimum: 0 } } } as const;

const composition = {
  type: 'object',
  required: ['id', 'label', 'size', 'placements', 'layers', 'board'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    size,
    placements: { type: 'object', additionalProperties: frame },
    layers: { type: 'array', maxItems: LIMITS.maxSources + LIMITS.maxProcesses, items: id },
    board: point,
  },
} as const;

const processNode = {
  type: 'object',
  required: ['id', 'label', 'op', 'board'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    op: { type: 'object', required: ['type'], properties: { type: { enum: ['crop', 'adjust', 'flip', 'textVariant', 'recolor'] } } },
    board: point,
  },
} as const;

const edge = { type: 'object', required: ['id', 'from', 'to', 'kind'], properties: { id: { type: 'string', minLength: 1, maxLength: 210 }, from: id, to: id, kind: { enum: ['layer', 'composition'] }, points: { type: 'array', maxItems: 10, items: point } } } as const;

const maxNodes = LIMITS.maxSources + LIMITS.maxProcesses + LIMITS.maxCompositions + LIMITS.maxOutputs;

/** T13.7: a board group (members by id; its box is computed on the board). */
const group = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'color', 'nodes'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    color: { enum: ['grey', 'blue', 'purple', 'green', 'orange', 'red'] },
    nodes: { type: 'array', maxItems: maxNodes, items: id },
    collapsed: { type: 'boolean' },
  },
} as const;

export const projectDocV2Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'rev', 'name', 'compositions', 'sources', 'processes', 'outputs', 'edges'],
  properties: {
    schema: { const: 2 },
    rev: { type: 'integer', minimum: 0 }, // ignored on save: the server owns rev
    name: { type: 'string', minLength: 1, maxLength: 200 },
    compositions: { type: 'array', minItems: 1, maxItems: LIMITS.maxCompositions, items: composition },
    sources: { type: 'array', maxItems: LIMITS.maxSources, items: source },
    processes: { type: 'array', maxItems: LIMITS.maxProcesses, items: processNode },
    outputs: { type: 'array', maxItems: LIMITS.maxOutputs, items: output },
    edges: { type: 'array', maxItems: maxNodes * 4, items: edge },
    groups: { type: 'array', maxItems: LIMITS.maxGroups, items: group },
  },
} as const;

/** Before D32. */
export const projectDocV1Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'rev', 'name', 'master', 'sources', 'outputs', 'wires'],
  properties: {
    schema: { const: 1 },
    rev: { type: 'integer', minimum: 0 },
    name: { type: 'string', minLength: 1, maxLength: 200 },
    master: {
      type: 'object',
      required: ['size', 'placements', 'board'],
      properties: { size, placements: { type: 'object', additionalProperties: frame }, board: point },
    },
    sources: { type: 'array', maxItems: LIMITS.maxSources, items: sourceV1 },
    outputs: { type: 'array', maxItems: LIMITS.maxOutputs, items: output },
    wires: { type: 'array', maxItems: LIMITS.maxSources + LIMITS.maxOutputs, items: wire },
  },
} as const;

export const projectDocSchema = { anyOf: [projectDocV2Schema, projectDocV1Schema] } as const;
