import { hash, verify } from '@node-rs/argon2';

// OWASP argon2id baseline: m=19 MiB, t=2, p=1.
// `algorithm: 2` is Algorithm.Argon2id (a const enum, not importable under verbatimModuleSyntax).
const OPTIONS = { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 256;

export function hashPassword(password: string): Promise<string> {
  return hash(password, OPTIONS);
}

// Verified against when the email is unknown, so both paths cost the same.
let dummyHash: Promise<string> | undefined;

export async function verifyPassword(storedHash: string | null, password: string): Promise<boolean> {
  if (storedHash === null) {
    dummyHash ??= hashPassword('dummy-password-for-timing');
    await verify(await dummyHash, password);
    return false;
  }
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}
