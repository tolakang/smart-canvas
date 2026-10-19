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
