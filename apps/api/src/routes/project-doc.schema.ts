/**
 * JSON schema for ProjectDoc (docs/DATA-MODEL.ts) as accepted on save: schema 4 (D61), or schema 3 / 2 / 1 from a
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

const transformOrigin = {
  type: 'object',
  required: ['x', 'y', 'width', 'height', 'scaleX', 'scaleY', 'rotation', 'shear'],
  properties: { x: num, y: num, width: num, height: num, scaleX: num, scaleY: num, rotation: num, shear: num },
} as const;
const transformOp = {
  type: 'object',
  required: ['type'],
  properties: { type: { enum: ['scale', 'shear', 'rotate', 'move'] }, kx: num, ky: num, k: num, axis: { enum: ['lr', 'tb'] }, deg: num, dx: num, dy: num, pivot: point },
} as const;
const transformHistory = {
  type: 'object',
  required: ['origin', 'ops'],
  properties: { origin: transformOrigin, ops: { type: 'array', maxItems: 2000, items: transformOp } },
} as const;
/** D41: saved editor transform histories for one scene. */
const layerTransforms = {
  type: 'object',
  required: ['scene', 'layers'],
  properties: {
    scene: { type: 'object', required: ['width', 'height'], properties: { width: { type: 'number', exclusiveMinimum: 0 }, height: { type: 'number', exclusiveMinimum: 0 } } },
    layers: { type: 'object', additionalProperties: transformHistory },
  },
} as const;

const sourceProps = {
    id,
    label: { type: 'string', maxLength: 200 },
    kind: { enum: ['image', 'vector', 'text', 'fill'] },
    behavesLike: { enum: ['background', 'subject', 'text', 'logo', 'decoration'] },
    visible: { type: 'boolean' },
    locked: { const: true }, // D50
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
  required: ['id', 'label', 'size', 'overrides', 'board'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    presetId: str,
    size,
    dpi: { type: 'number', exclusiveMinimum: 0 },
    exportScale: { type: 'number', minimum: 1, maximum: 4 },
    bleedMm: { type: 'number', minimum: 0 },
    safeMarginPct: { type: 'number', minimum: 0, maximum: 50 },
    overrides: { type: 'array', items: { type: 'object', required: ['sourceId'], properties: { sourceId: id } } },
    frozen: { type: 'object' },
    transforms: layerTransforms,
    layout: { enum: ['square', 'vertical', 'horizontal'] }, // D50
    board: point,
  },
} as const;

/** v2 limits and shapes retired in D56, for documents saved by a client that hasn't reloaded yet. */
const V2 = { maxProcesses: 20, maxCompositions: 5 } as const;
/** v1–v3 outputs carried a layout family (retired by D61). */
const outputV3 = { ...output, required: [...output.required, 'family'], properties: { ...output.properties, family: { enum: ['auto', 'stack', 'side'] } } } as const;
const outputV2 = { ...outputV3, properties: { ...outputV3.properties, layers: { type: 'array', maxItems: LIMITS.maxSources, items: id } } } as const;

const wire = { type: 'object', required: ['id', 'from', 'to'], properties: { id, from: id, to: id, port: { type: 'integer', minimum: 0 } } } as const;

const composition = {
  type: 'object',
  required: ['id', 'label', 'size', 'placements', 'layers', 'board'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    size,
    placements: { type: 'object', additionalProperties: frame },
    layers: { type: 'array', maxItems: LIMITS.maxSources, items: id },
    transforms: layerTransforms,
    board: point,
    // D42: a layout guide of another composition.
    guide: { type: 'object', additionalProperties: false, required: ['of', 'family'], properties: { of: id, family: { enum: ['square', 'vertical', 'horizontal'] } } },
  },
} as const;

const compositionV2 = { ...composition, properties: { ...composition.properties, layers: { type: 'array', maxItems: LIMITS.maxSources + V2.maxProcesses, items: id } } } as const;

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

const maxNodes = LIMITS.maxSources + V2.maxProcesses + V2.maxCompositions + LIMITS.maxOutputs;

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

/** D40: an Assets card (its pictures by input id, card order). */
const stack = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'board', 'items'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    board: point,
    kind: { enum: ['image', 'logo', 'text'] }, // D49
    unwired: { const: true }, // D49.1
    items: { type: 'array', maxItems: LIMITS.maxSources, items: id },
  },
} as const;

/** D44: a Headline card (a Khmer and an English input, one in use). */
const headline = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'board', 'km', 'en', 'use'],
  properties: {
    id,
    label: { type: 'string', maxLength: 200 },
    board: point,
    km: id,
    en: id,
    use: { enum: ['km', 'en'] },
    // N3: more pairs in the same card.
    more: { type: 'array', maxItems: LIMITS.maxSources, items: { type: 'object', additionalProperties: false, required: ['km', 'en'], properties: { km: id, en: id } } },
  },
} as const;

/** D46: a Preset node — its sizes are outputs (ids). */
const presetSet = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'label', 'board', 'outputs'],
  properties: { id, label: { type: 'string', maxLength: 200 }, board: point, outputs: { type: 'array', maxItems: LIMITS.maxOutputs, items: id }, hidden: { type: 'array', maxItems: LIMITS.maxOutputs, items: id } },
} as const;

/** D47: a Core Rule node — which master preview, and where. */
const coreRule = {
  type: 'object',
  additionalProperties: false,
  required: ['id', 'composition', 'board'],
  properties: { id, composition: id, board: point },
} as const;

/** The current document (D61): the master and its layouts, inputs, outputs, and the board's nodes. */
export const projectDocV4Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'rev', 'name', 'compositions', 'sources', 'outputs', 'edges'],
  properties: {
    schema: { const: 4 },
    rev: { type: 'integer', minimum: 0 }, // ignored on save: the server owns rev
    name: { type: 'string', minLength: 1, maxLength: 200 },
    compositions: { type: 'array', minItems: 1, maxItems: LIMITS.maxCompositions, items: composition },
    sources: { type: 'array', maxItems: LIMITS.maxSources, items: source },
    outputs: { type: 'array', maxItems: LIMITS.maxOutputs, items: output },
    edges: { type: 'array', maxItems: maxNodes * 4, items: edge },
    groups: { type: 'array', maxItems: LIMITS.maxGroups, items: group },
    stacks: { type: 'array', maxItems: LIMITS.maxSources, items: stack },
    headlines: { type: 'array', maxItems: LIMITS.maxSources, items: headline },
    presetSets: { type: 'array', maxItems: LIMITS.maxOutputs, items: presetSet },
    layerOrder: { type: 'array', minItems: 4, maxItems: 4, uniqueItems: true, items: { enum: ['logo', 'headline', 'elements', 'background'] } },
  },
} as const;


/** D56–D60: as v4, with `output.family`, for documents saved by a client that hasn't reloaded yet. */
export const projectDocV3Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'rev', 'name', 'compositions', 'sources', 'outputs', 'edges'],
  properties: {
    schema: { const: 3 },
    rev: { type: 'integer', minimum: 0 }, // ignored on save: the server owns rev
    name: { type: 'string', minLength: 1, maxLength: 200 },
    compositions: { type: 'array', minItems: 1, maxItems: LIMITS.maxCompositions, items: composition },
    sources: { type: 'array', maxItems: LIMITS.maxSources, items: source },
    outputs: { type: 'array', maxItems: LIMITS.maxOutputs, items: outputV3 },
    edges: { type: 'array', maxItems: maxNodes * 4, items: edge },
    groups: { type: 'array', maxItems: LIMITS.maxGroups, items: group },
    stacks: { type: 'array', maxItems: LIMITS.maxSources, items: stack },
    headlines: { type: 'array', maxItems: LIMITS.maxSources, items: headline },
    presetSets: { type: 'array', maxItems: LIMITS.maxOutputs, items: presetSet },
    layerOrder: { type: 'array', minItems: 4, maxItems: 4, uniqueItems: true, items: { enum: ['logo', 'headline', 'elements', 'background'] } },
  },
} as const;

/** D32–D55. */
export const projectDocV2Schema = {
  type: 'object',
  additionalProperties: false,
  required: ['schema', 'rev', 'name', 'compositions', 'sources', 'processes', 'outputs', 'edges'],
  properties: {
    schema: { const: 2 },
    rev: { type: 'integer', minimum: 0 }, // ignored on save: the server owns rev
    name: { type: 'string', minLength: 1, maxLength: 200 },
    compositions: { type: 'array', minItems: 1, maxItems: V2.maxCompositions, items: compositionV2 },
    sources: { type: 'array', maxItems: LIMITS.maxSources, items: source },
    processes: { type: 'array', maxItems: V2.maxProcesses, items: processNode },
    outputs: { type: 'array', maxItems: LIMITS.maxOutputs, items: outputV2 },
    edges: { type: 'array', maxItems: maxNodes * 4, items: edge },
    groups: { type: 'array', maxItems: LIMITS.maxGroups, items: group },
    stacks: { type: 'array', maxItems: LIMITS.maxSources, items: stack },
    headlines: { type: 'array', maxItems: LIMITS.maxSources, items: headline },
    presetSets: { type: 'array', maxItems: LIMITS.maxOutputs, items: presetSet },
    coreRules: { type: 'array', maxItems: V2.maxCompositions, items: coreRule },
    layerOrder: { type: 'array', minItems: 4, maxItems: 4, uniqueItems: true, items: { enum: ['logo', 'headline', 'elements', 'background'] } },
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
    outputs: { type: 'array', maxItems: LIMITS.maxOutputs, items: outputV3 },
    wires: { type: 'array', maxItems: LIMITS.maxSources + LIMITS.maxOutputs, items: wire },
  },
} as const;

/**
 * Picked by `schema` (not anyOf: with additional properties removed, a failed branch would strip fields the next
 * branch needs).
 */
export const projectDocSchema = {
  type: 'object',
  required: ['schema'],
  properties: { schema: { enum: [1, 2, 3, 4] } },
  if: { properties: { schema: { const: 4 } } },
  then: projectDocV4Schema,
  else: {
    if: { properties: { schema: { const: 3 } } },
    then: projectDocV3Schema,
    else: { if: { properties: { schema: { const: 2 } } }, then: projectDocV2Schema, else: projectDocV1Schema },
  },
} as const;
