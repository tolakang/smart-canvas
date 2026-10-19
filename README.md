# smart-canvas

Artwork adaptation web app: one master artwork → many sizes via a flow board (input sources → main preview → output nodes).

Status: monorepo scaffold (T1.1). Spec in `docs/` — start with `docs/00-READ-FIRST.md`, next ticket in `docs/BACKLOG.md`.

```
pnpm i          # install (Node >= 22, pnpm 10)
pnpm test       # vitest, all workspaces
pnpm typecheck  # tsc --noEmit per workspace
pnpm lint       # eslint
pnpm build      # build (web)
pnpm dev        # web (Vite) + api (Fastify :3000) + worker
```

Database (Postgres, Drizzle; run in `apps/api`):

```
DATABASE_URL=postgres://… pnpm db:migrate   # apply migrations
pnpm db:generate --name <change>            # new migration after editing src/db/schema.ts
TEST_DATABASE_URL=postgres://… pnpm test    # also runs the migration test on a fresh empty DB
```
