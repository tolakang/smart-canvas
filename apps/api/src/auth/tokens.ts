import { createHash, randomBytes } from 'node:crypto';

/** Opaque random token for cookies and invite links. Only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString('base64url');
}

export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}
