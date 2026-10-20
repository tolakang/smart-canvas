# Deploying smart-canvas on Dokploy

One Dokploy **Compose** app runs the whole stack from `docker-compose.yml`:

| Service | What it is | Reachable from |
|---|---|---|
| `web` | nginx: the app (static files) plus a `/api` proxy to `api` | **the internet, through your domain** |
| `api` | Fastify. Runs the database migrations on every start, then serves | inside the stack only |
| `worker` | the export worker (headless Chromium): renders PNG / JPG / WebP / PDF / SVG | inside the stack only |
| `postgres` | Postgres 16: projects, users, the export queue (pg-boss) | inside the stack only |
| `minio` | S3 storage for uploads and exported files | inside the stack only |
| `minio-init` | one-shot job that gives the MinIO volume the right owner, then exits | — |

Only `web` needs a domain. Everything else talks on the stack's internal network.

---

## 1. Server

- **Size:** a VPS with Dokploy installed (`curl -sSL https://dokploy.com/install.sh | sh`, as root, on Ubuntu/Debian).
  - **4 GB RAM minimum**, 2+ vCPU, 30 GB disk. The first image build compiles the web app and pulls the Playwright image (about 2 GB). The worker runs Chromium.
  - With 2 GB RAM, add 2–4 GB of swap or the build may be killed.
- **Architecture:** amd64 and arm64 both work; every image is multi-arch.
- **Ports:** open 80 and 443 for the domain, and 3000 for the Dokploy dashboard. Close 3000 again once Dokploy has its own domain.
- **DNS:** create an `A` record (and `AAAA` if you use IPv6) for your domain, for example `canvas.example.com`, pointing at the server's IP. Do this before step 5 so Let's Encrypt can issue the certificate.

## 2. Make the secrets

On any machine with `openssl`, run:

```sh
openssl rand -hex 24   # POSTGRES_PASSWORD
openssl rand -hex 24   # MINIO_ROOT_PASSWORD
openssl rand -hex 32   # RENDER_TOKEN
```

Hex output is URL-safe, which matters because the Postgres password is placed inside `DATABASE_URL`.

Keep these values: changing `POSTGRES_PASSWORD` or `MINIO_ROOT_PASSWORD` after the first start does **not** change the password stored in the existing volume (see Troubleshooting).

## 3. Create the app in Dokploy

1. **Projects → Create Project** (e.g. "smart-canvas").
2. In the project: **Create Service → Compose**.
   - Name: `smart-canvas`
   - Compose type: **Docker Compose** (not Stack).
3. **General** tab → Provider:
   - **GitHub**: connect your GitHub account once under *Settings → Git*. Then pick repository `tolakang/smart-canvas`, branch `main`.
   - (or **Git**: `https://github.com/tolakang/smart-canvas.git`, branch `main`)
   - **Compose Path:** `./docker-compose.yml`
   - Save.

## 4. Environment

**Environment** tab: paste this, replace the three secrets with yours, then **Save**.

```env
POSTGRES_USER=smartcanvas
POSTGRES_PASSWORD=<openssl rand -hex 24>
POSTGRES_DB=smartcanvas

MINIO_ROOT_USER=smartcanvas
MINIO_ROOT_PASSWORD=<openssl rand -hex 24>
S3_BUCKET=smart-canvas

# Shared by api and worker (read-only render access). 32+ characters.
RENDER_TOKEN=<openssl rand -hex 32>

# Dokploy serves HTTPS, so cookies must be Secure.
COOKIE_SECURE=true

# The compose file also publishes web on a host port. Bind it to localhost so the
# app is only reachable through the domain (HTTPS), not via http://<server-ip>:8080.
WEB_PORT=127.0.0.1:8080

IMAGE_REGISTRY=smart-canvas
IMAGE_TAG=latest
```

Notes:
- **`COOKIE_SECURE`:** must be `true` with a domain on HTTPS. With `false` you can sign in over plain http, which you should never do in production.
- **`WEB_PORT`:** `127.0.0.1:8080` keeps the extra host port private. If 8080 is already used on the server, pick another, e.g. `127.0.0.1:18080`.
- **`IMAGE_REGISTRY`, `IMAGE_TAG`:** these only name the images Dokploy builds on the server. Leave them as shown.

## 5. Domain

**Domains** tab → **Add Domain**:

| Field | Value |
|---|---|
| Service Name | `web` |
| Host | `canvas.example.com` |
| Path | `/` |
| Container Port | `80` |
| HTTPS | on |
| Certificate | Let's Encrypt |

Save. Dokploy's Traefik routes the domain to `web:80`, and nginx inside `web` forwards `/api/*` to `api`. So the app and the API share one origin, and the session cookie stays first-party.

## 6. Deploy

1. Click **Deploy**. Watch the **Deployments** log.
   - The first build takes about 5–15 minutes, depending on the server. Later builds reuse the cache.
   - Start order: `minio-init` exits 0 → `postgres` healthy → `minio` → `api` (migrations, then `/health` healthy) → `web` and `worker`.
2. **Logs** tab, check each service:
   - `api`: migrations applied, then `Server listening at http://0.0.0.0:3000`.
   - `worker`: `export-worker ready (concurrency 2)`.
   - `minio-init`: shows **Exited (0)**. That is expected; it runs once per deploy.
3. Open `https://canvas.example.com`. You should see the sign-in page.

## 7. First run

1. On the sign-in page click **First run? Set up the workspace**.
2. Enter your name, team name, email and password. This creates the **first admin** and the team. It only works while the database has no users.
3. Invite people. Invites exist in the API (T1.3), but the web app has **no invite screen yet**. Until it does, use the browser console:
   - **The admin**, signed in on the site, opens DevTools → Console and runs this (the team id is the `t/<id>` part of a board URL):
     ```js
     await (await fetch('/api/teams/<teamId>/invites', { method: 'POST', headers: { 'content-type': 'application/json' },
       body: JSON.stringify({ role: 'editor', email: 'sam@example.com' }) })).json()
     ```
     The role can be `admin`, `editor` or `viewer`. Copy the `token` from the result and send it to the person.
   - **The new person**, on the site's sign-in page (not signed in), runs this in the console, then reloads:
     ```js
     await fetch('/api/invites/<token>/accept', { method: 'POST', headers: { 'content-type': 'application/json' },
       body: JSON.stringify({ name: 'Sam', email: 'sam@example.com', password: 'a-long-password' }) })
     ```

Smoke check:
1. Create a project, upload an image to *Subject* and type a headline.
2. Connect the inputs and add an output (e.g. *Instagram square*).
3. Click **Export**, choose PNG and download the file. If the download works, `web → api → postgres/minio → worker` all work.

## 8. Updates

- **Automatic:** in the **General** tab enable **Autodeploy**. With the GitHub provider, every push to `main` redeploys. With the plain Git provider, add the Dokploy webhook URL from the **Deployments** tab to the GitHub repo's webhooks instead.
- **Manual:** click **Deploy** (or **Rebuild**) after merging.
- **Database migrations:** these run automatically when `api` starts. Never edit the database by hand.
- **Data:** the named volumes `pgdata` and `miniodata` hold all data and survive redeploys. Never use "delete volumes" unless you mean to wipe everything.

## 9. Backups

Back up both: Postgres holds the projects and users, MinIO holds the uploaded files and exports.

These commands run on the server. Find the container names with `docker ps --filter name=smart-canvas`; Dokploy prefixes them with the app name.

```sh
# Database (daily; keep several days)
docker exec <postgres-container> pg_dump -U smartcanvas -d smartcanvas -Fc > /backups/smartcanvas-$(date +%F).dump

# Files: copy the MinIO volume
docker run --rm -v <app>_miniodata:/data:ro -v /backups:/backups busybox \
  tar czf /backups/minio-$(date +%F).tgz -C /data .
```

To restore the database:

```sh
docker exec -i <postgres-container> pg_restore -U smartcanvas -d smartcanvas --clean --if-exists < smartcanvas-2026-10-20.dump
```

Run the backups from cron (or Dokploy's *Schedules*, if your version has them), and copy them off the server.

## 10. Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Deploy fails: `set POSTGRES_PASSWORD in .env` (or `MINIO_ROOT_PASSWORD`, `RENDER_TOKEN`) | That variable is missing in the **Environment** tab. Save it and deploy again. |
| `api` restarts with `password authentication failed` | `POSTGRES_PASSWORD` changed after the first start. Postgres keeps the original password in `pgdata`. Put the old value back, or change it inside Postgres (`ALTER USER smartcanvas PASSWORD '…'`) and then in Dokploy. |
| Sign-in "works" but you are signed out again at once | `COOKIE_SECURE=true` while the site is opened over **http**. Use the https domain. Check the certificate was issued (Domains tab), then redeploy. |
| Exports stay **queued** | The `worker` is not running. Check its logs. `RENDER_TOKEN` must be 32+ characters and the same for `api` and `worker` (the compose file passes the one variable to both). |
| Exports **fail** with a render error | Check the worker log. It opens `http://web/render/...` inside the stack, so `web` must be running. |
| Build is killed (`exit code 137`) | Out of memory. Add swap or use a bigger server. |
| `502 Bad Gateway` on the domain | `web` is not up yet; it waits for `api` to be healthy. Check the `api` logs, usually the database connection or migrations. |
| Uploads above about 50 MB are refused | By design (50 MB cap). nginx allows 51 MB for the form framing. |
| Port 8080 already in use | Set `WEB_PORT=127.0.0.1:<free port>`. The domain doesn't use this port. |

## Optional: prebuilt images

To avoid building on the server, you can push multi-arch images to GHCR from a build machine:

```sh
docker buildx bake -f docker-bake.hcl --push
```

This uses `IMAGE_REGISTRY=ghcr.io/tolakang/smart-canvas`. Then set `IMAGE_REGISTRY=ghcr.io/tolakang/smart-canvas` and a release `IMAGE_TAG` in Dokploy. The compose file still has `build:` sections, so Dokploy builds by default. Pulling only would need a compose file without them. The default (build on the server) is the simplest and is what CI tests.
