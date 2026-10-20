# syntax=docker/dockerfile:1
# One Dockerfile, three images: --target web | api | worker. Multi-arch via docker-bake.hcl.

FROM node:22-trixie-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=true
RUN corepack enable
WORKDIR /repo

# ---- build: install, typecheck/build web, bundle api + worker, collect prod deps ----
FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json apps/web/
COPY apps/api/package.json apps/api/
COPY apps/worker/package.json apps/worker/
COPY packages/core/package.json packages/core/
COPY packages/presets/package.json packages/presets/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store pnpm install --frozen-lockfile
COPY . .
RUN pnpm build
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm --filter @smart-canvas/api deploy --prod --legacy /out/api \
 && pnpm --filter @smart-canvas/worker deploy --prod --legacy /out/worker

# ---- api: migrations on start, then the server ----
FROM node:22-trixie-slim AS api
ENV NODE_ENV=production PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /out/api ./
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=20s \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/health').then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"]
CMD ["sh", "-c", "node dist/db/migrate-cli.js && exec node dist/main.js"]

# ---- worker (export, D27): Playwright's image ships Chromium and its system libraries; the version must
#      match apps/worker's playwright dependency. Fonts come from the web app it renders (D3). ----
FROM mcr.microsoft.com/playwright:v1.56.1-noble AS worker
ENV NODE_ENV=production PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
WORKDIR /app
COPY --from=build --chown=pwuser:pwuser /out/worker ./
USER pwuser
CMD ["node", "dist/main.js"]

# ---- web: static SPA + /api reverse proxy ----
FROM nginx:1.30-alpine AS web
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 80
