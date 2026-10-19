/**
 * Postgres schema (Drizzle). Tables per the docs/DATA-MODEL.ts header:
 * users, teams, memberships, invites, sessions, projects, assets, library_items, presets, export_jobs.
 * `projects.doc` holds the whole ProjectDoc as JSONB; `projects.rev` is the optimistic-lock revision.
 * Layout results are never stored.
 */
import { sql } from 'drizzle-orm';
import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import type {
  Behavior,
  ExportFormat,
  ExportJob,
  ExportOptions,
  PresetGroup,
  ProjectDoc,
  SourceContent,
  SourceKind,
  TeamRole,
  Unit,
} from '@smart-canvas/core';

// ---------- enums (values must match the core model unions; checked below) ----------
export const teamRole = pgEnum('team_role', ['admin', 'editor', 'viewer']);
export const unit = pgEnum('unit', ['px', 'mm']);
export const sourceKind = pgEnum('source_kind', ['image', 'vector', 'text', 'fill']);
export const behavior = pgEnum('behavior', ['background', 'subject', 'text', 'logo', 'decoration']);
export const presetGroup = pgEnum('preset_group', ['print', 'social']);
export const assetKind = pgEnum('asset_kind', ['image', 'vector', 'font']);
export const exportFormat = pgEnum('export_format', ['png', 'jpg', 'webp', 'svg', 'pdf']);
export const exportStatus = pgEnum('export_status', ['queued', 'running', 'done', 'failed']);

type Same<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
type EnumOf<E extends { enumValues: readonly string[] }> = E['enumValues'][number];
const enumsMatchModel: [
  Same<EnumOf<typeof teamRole>, TeamRole>,
  Same<EnumOf<typeof unit>, Unit>,
  Same<EnumOf<typeof sourceKind>, SourceKind>,
  Same<EnumOf<typeof behavior>, Behavior>,
  Same<EnumOf<typeof presetGroup>, PresetGroup>,
  Same<EnumOf<typeof assetKind>, 'image' | 'vector' | 'font'>,
  Same<EnumOf<typeof exportFormat>, ExportFormat>,
  Same<EnumOf<typeof exportStatus>, ExportJob['status']>,
] = [true, true, true, true, true, true, true, true];
void enumsMatchModel;

const id = () => uuid('id').primaryKey().defaultRandom();
const createdAt = () => timestamp('created_at', { withTimezone: true }).notNull().defaultNow();
const updatedAt = () => timestamp('updated_at', { withTimezone: true }).notNull().defaultNow();

// ---------- auth and teams ----------
export const users = pgTable(
  'users',
  {
    id: id(),
    email: text('email').notNull(),
    name: text('name').notNull().default(''),
    passwordHash: text('password_hash').notNull(), // argon2id (T1.3)
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
);

export const teams = pgTable('teams', {
  id: id(),
  name: text('name').notNull(),
  createdAt: createdAt(),
});

export const memberships = pgTable(
  'memberships',
  {
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    role: teamRole('role').notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.teamId, t.userId] }), index('memberships_user_idx').on(t.userId)],
);

export const invites = pgTable(
  'invites',
  {
    id: id(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    role: teamRole('role').notNull(),
    tokenHash: text('token_hash').notNull().unique(), // only the hash of the link token is stored
    email: text('email'), // optional: invite bound to one address
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    acceptedBy: uuid('accepted_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('invites_team_idx').on(t.teamId)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(), // hash of the cookie token
    userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index('sessions_user_idx').on(t.userId)],
);

// ---------- projects ----------
export const projects = pgTable(
  'projects',
  {
    id: id(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    doc: jsonb('doc').$type<ProjectDoc>().notNull(),
    rev: integer('rev').notNull().default(0),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_team_idx').on(t.teamId)],
);

// ---------- team-level records ----------
export const assets = pgTable(
  'assets',
  {
    id: id(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    kind: assetKind('kind').notNull(),
    mime: text('mime').notNull(),
    bytes: integer('bytes').notNull(), // capped at LIMITS.maxUploadMB, fits int4
    sha256: text('sha256').notNull(),
    storageKey: text('storage_key').notNull(),
    width: integer('width'),
    height: integer('height'),
    fontFamily: text('font_family'),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex('assets_team_sha256_uq').on(t.teamId, t.sha256)],
);

export const libraryItems = pgTable(
  'library_items',
  {
    id: id(),
    teamId: uuid('team_id').notNull().references(() => teams.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    tags: text('tags').array().notNull().default(sql`'{}'::text[]`),
    kind: sourceKind('kind').notNull(),
    behavesLike: behavior('behaves_like').notNull(),
    content: jsonb('content').$type<SourceContent>().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('library_items_team_idx').on(t.teamId)],
);

export const presets = pgTable(
  'presets',
  {
    id: id(),
    teamId: uuid('team_id').references(() => teams.id, { onDelete: 'cascade' }), // null = built-in
    group: presetGroup('group').notNull(),
    name: text('name').notNull(),
    width: doublePrecision('width').notNull(),
    height: doublePrecision('height').notNull(),
    unit: unit('unit').notNull(),
    dpi: integer('dpi'),
    bleedMm: real('bleed_mm'),
    createdAt: createdAt(),
  },
  (t) => [index('presets_team_idx').on(t.teamId)],
);

export const exportJobs = pgTable(
  'export_jobs',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    outputIds: text('output_ids').array().notNull(),
    format: exportFormat('format').notNull(),
    options: jsonb('options').$type<ExportOptions>().notNull().default({}),
    status: exportStatus('status').notNull().default('queued'),
    progress: real('progress').notNull().default(0), // 0..1
    resultAssetId: uuid('result_asset_id').references(() => assets.id, { onDelete: 'set null' }),
    error: text('error'),
    createdBy: uuid('created_by').notNull().references(() => users.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('export_jobs_project_idx').on(t.projectId)],
);

