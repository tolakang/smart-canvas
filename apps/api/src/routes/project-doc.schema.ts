/**
 * JSON schema for ProjectDoc (docs/DATA-MODEL.ts) as accepted on save.
 * Checks the shape and the caps (LIMITS); deeper rules (port contiguity, wiring) belong to the board tickets.
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
const frame = { type: 'object', required: ['x', 'y', 'w', 'h'], properties: { x: num, y: num, w: num, h: num, rotation: num } } as const;

const source = {
  type: 'object',
  required: ['id', 'label', 'kind', 'behavesLike', 'port', 'visible', 'content', 'board'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    kind: { enum: ['image', 'vector', 'text', 'fill'] },
    behavesLike: { enum: ['background', 'subject', 'text', 'logo', 'decoration'] },
    port: { type: 'integer', minimum: 0, maximum: LIMITS.maxSources - 1 },
    visible: { type: 'boolean' },
    content: { type: 'object', required: ['kind'], properties: { kind: { enum: ['image', 'vector', 'text', 'fill'] } } },
    libraryItemId: str,
    board: point,
  },
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
    board: point,
  },
} as const;

const wire = { type: 'object', required: ['id', 'from', 'to'], properties: { id, from: id, to: id, port: { type: 'integer', minimum: 0 } } } as const;

export const projectDocSchema = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'rev', 'name', 'master', 'sources', 'outputs', 'wires'],
  properties: {
    schema: { const: 1 },
    rev: { type: 'integer', minimum: 0 }, // ignored on save: the server owns rev
    name: { type: 'string', minLength: 1, maxLength: 200 },
    master: {
      type: 'object',
      required: ['size', 'placements', 'board'],
      properties: { size, placements: { type: 'object', additionalProperties: frame }, board: point },
    },
    sources: { type: 'array', maxItems: LIMITS.maxSources, items: source },
    outputs: { type: 'array', maxItems: LIMITS.maxOutputs, items: output },
    wires: { type: 'array', maxItems: LIMITS.maxSources + LIMITS.maxOutputs, items: wire },
  },
} as const;
