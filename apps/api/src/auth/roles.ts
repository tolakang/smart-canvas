import type { TeamRole } from '@smart-canvas/core';

const RANK: Record<TeamRole, number> = { viewer: 0, editor: 1, admin: 2 };

export function hasRole(role: TeamRole, min: TeamRole): boolean {
  return RANK[role] >= RANK[min];
}

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Minimum role for a request inside a team: viewers are read-only. */
export function minRoleForMethod(method: string): TeamRole {
  return READ_METHODS.has(method.toUpperCase()) ? 'viewer' : 'editor';
}
