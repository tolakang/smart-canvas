# smart-canvas

Artwork adaptation web app: one master artwork → many sizes via a flow board (asset nodes → Layer Comp + Core Rule → Preset nodes → Previews).

Status: v1 built (backlog P1–P18 done; documents are schema 3, D56). Spec in `docs/` — start with `docs/00-READ-FIRST.md`, then `docs/HANDOVER.md`; proposed next work at the end of `docs/BACKLOG.md`.

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
TEST_DATABASE_URL=postgres://… pnpm test    # also runs the DB integration tests on fresh empty DBs
```

The API needs `DATABASE_URL` and object storage (MinIO / any S3 API): `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY` (optional `S3_REGION`); the bucket is created on start if missing. Session cookies are `Secure` unless `COOKIE_SECURE=false` (plain-http local dev).
First run: `POST /auth/setup` creates the first admin and team; after that, people join through invite links.

## Docker / Dokploy

```
cp .env.example .env                         # set passwords; COOKIE_SECURE=false for http://localhost
docker compose up --build                    # web on http://localhost:8080, API under /api
docker buildx bake -f docker-bake.hcl --push # multi-arch images (amd64 + arm64) to IMAGE_REGISTRY
```

Services: `web` (nginx: SPA + `/api` proxy, the only published port), `api` (runs migrations, then serves),
`worker`, `postgres`, `minio`. In Dokploy, create a Compose app from this repo, paste the `.env` values,
and attach the domain to service `web`, port 80. Step by step: [docs/DEPLOY-DOKPLOY.md](docs/DEPLOY-DOKPLOY.md).
