import { defineProject } from 'vitest/config';

export default defineProject({
  // The flow tests create, migrate and drop a real Postgres database (some inside a test); under a full parallel
  // run that can take longer than vitest's 5 s default, so they get 30 s.
  test: { name: 'api', environment: 'node', testTimeout: 30_000, hookTimeout: 30_000 },
});
