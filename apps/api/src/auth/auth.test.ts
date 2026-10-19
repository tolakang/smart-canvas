import { describe, expect, it } from 'vitest';
import { hashPassword, verifyPassword } from './password';
import { hasRole, minRoleForMethod } from './roles';
import { hashToken, newToken } from './tokens';

describe('password', () => {
  it('hashes with argon2id and verifies', async () => {
    const h = await hashPassword('correct horse');
    expect(h.startsWith('$argon2id$')).toBe(true);
    expect(await verifyPassword(h, 'correct horse')).toBe(true);
    expect(await verifyPassword(h, 'wrong')).toBe(false);
  });

  it('returns false for an unknown user or a malformed hash', async () => {
    expect(await verifyPassword(null, 'anything')).toBe(false);
    expect(await verifyPassword('not-a-hash', 'anything')).toBe(false);
  });
});

describe('tokens', () => {
  it('are random and hash deterministically', () => {
    const a = newToken();
    expect(a).not.toBe(newToken());
    expect(a.length).toBeGreaterThanOrEqual(43);
    expect(hashToken(a)).toBe(hashToken(a));
    expect(hashToken(a)).not.toBe(a);
  });
});

describe('roles', () => {
  it('ranks admin > editor > viewer', () => {
    expect(hasRole('admin', 'editor')).toBe(true);
    expect(hasRole('editor', 'editor')).toBe(true);
    expect(hasRole('viewer', 'editor')).toBe(false);
    expect(hasRole('editor', 'admin')).toBe(false);
  });

  it('makes viewers read-only', () => {
    expect(minRoleForMethod('GET')).toBe('viewer');
    expect(minRoleForMethod('head')).toBe('viewer');
    for (const m of ['POST', 'PUT', 'PATCH', 'DELETE']) expect(minRoleForMethod(m)).toBe('editor');
  });
});
