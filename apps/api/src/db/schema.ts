/**
 * Postgres schema (Drizzle). Tables per the docs/DATA-MODEL.ts header:
 * users, teams, memberships, invites, sessions, projects, project_versions, review_comments, output_approvals, assets,
 * library_items, presets, export_jobs.
 * `projects.doc` holds the whole ProjectDoc as JSONB; `projects.rev` is the optimistic-lock revision.
 * `project_versions` (D62) keeps earlier docs of a project for its history. `review_comments` and `output_approvals`
 * (D63) are the team's review of its Previews, kept outside the doc (viewers comment; undo and restore leave them).
 * Layout results are never stored.
 */
import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
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
/** D62: why a project version was kept. */
export const versionKind = pgEnum('version_kind', ['auto', 'before-delete', 'before-restore', 'named']);

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
    /** T7.3: a team template — listed apart; "New from template" copies its doc. */
    isTemplate: boolean('is_template').notNull().default(false),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    /** D62: who saved the current doc (shown on the history version it later becomes). */
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('projects_team_idx').on(t.teamId)],
);

/**
 * D62: project history. A copy of a project's doc as it was at `rev`, kept on save (every VERSION_EVERY_MS of
 * editing, or before an edit that removes inputs or sizes), before a restore, or when someone names one.
 * `createdBy` is who made that state (who saved it, or who named it).
 */
export const projectVersions = pgTable(
  'project_versions',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    rev: integer('rev').notNull(),
    kind: versionKind('kind').notNull(),
    /** Named: the name given; before-delete: what was removed ("1 input", "2 sizes"); else empty. */
    label: text('label').notNull().default(''),
    doc: jsonb('doc').$type<ProjectDoc>().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
  },
  (t) => [index('project_versions_project_idx').on(t.projectId, t.createdAt)],
);

/**
 * D63: a comment on a Preview (`outputId`, an id inside the project's doc, so a Preview brought back by a restore gets
 * its comments back). Top-level comments may be pinned to a point (0..1 of the Preview) and resolved; replies
 * (`parentId`) are neither.
 */
export const reviewComments = pgTable(
  'review_comments',
  {
    id: id(),
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    outputId: text('output_id').notNull(),
    parentId: uuid('parent_id').references((): AnyPgColumn => reviewComments.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id').references(() => users.id, { onDelete: 'set null' }),
    text: text('text').notNull(),
    pinX: real('pin_x'),
    pinY: real('pin_y'),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolvedBy: uuid('resolved_by').references(() => users.id, { onDelete: 'set null' }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index('review_comments_project_idx').on(t.projectId, t.createdAt)],
);

/** D63: a Preview approved, with the fingerprint of what it looked like then (`previewFingerprint`). */
export const outputApprovals = pgTable(
  'output_approvals',
  {
    projectId: uuid('project_id').notNull().references(() => projects.id, { onDelete: 'cascade' }),
    outputId: text('output_id').notNull(),
    fingerprint: text('fingerprint').notNull(),
    approvedBy: uuid('approved_by').references(() => users.id, { onDelete: 'set null' }),
    approvedAt: timestamp('approved_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.projectId, t.outputId] })],
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
    /** N5: the Preset node family this size belongs to (e.g. 'GDN'); null = a single size. */
    family: text('family'),
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

