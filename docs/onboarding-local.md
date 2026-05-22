# Local setup — sd-core-platform

Quick-start for getting the core platform stack running on your machine. This is the foundation everything else (sd-listings-optimizer, etc.) connects to, so set it up first.

Expected time: ~10 minutes the first time, mostly the initial Docker image builds.

## 1. Install these tools

| Tool | Where | Notes |
|---|---|---|
| **Docker Desktop** | https://www.docker.com/products/docker-desktop/ | Open it after install. In **Settings → Resources** give it **≥ 4 CPUs and ≥ 8 GB RAM**. |
| **git** | preinstalled on macOS; otherwise `brew install git` or your package manager | If `git --version` triggers an "Install developer tools?" prompt on macOS, accept it. |

Verify:
```bash
git --version
docker --version
docker info        # must succeed; if not, open Docker Desktop and wait
```

> You do NOT need Node.js installed for the docker-only flow — the frontend is built inside the Docker image. Install Node only if you intend to run `npm run dev` natively.

## 2. Get GitHub access

You need an SSH key on your GitHub account, and that account must be in the `SalesDuo` org.

1. Create a key if you don't have one: `ssh-keygen -t ed25519 -C "your.email@salesduo.com"`
2. Add `~/.ssh/id_ed25519.pub` to GitHub → Settings → SSH and GPG keys.
3. Ask an admin to add you to the `SalesDuo` org.
4. Configure the `salesduo-git` SSH alias in `~/.ssh/config`:
   ```sshconfig
   Host salesduo-git
       HostName github.com
       User git
       IdentityFile ~/.ssh/id_ed25519
       IdentitiesOnly yes
   ```
5. Test: `ssh -T git@salesduo-git` → should greet you.

## 3. Clone the repo from `dev`

Pick any parent folder you like (`~/code`, `~/work`, `~/Projects`, etc.). **Clone the `dev` branch** — that's where active fixes land first; `main` may lag.

```bash
cd ~/code   # or wherever you keep code
git clone --branch dev git@salesduo-git:SalesDuo/sd-core-platform.git
```

## 4. Place the two `.env` files

This repo needs two `.env` files. Ask a teammate or pull from the team password manager and put them at:

```
sd-core-platform/.env             # root — loaded by docker-compose for prod-db + core-backend
sd-core-platform/frontend/.env    # Vite (frontend) build-time vars (VITE_GOOGLE_CLIENT_ID, etc.)
```

| File | Loaded by | Holds |
|---|---|---|
| `./.env` | Docker Compose for `prod-db` + `core-backend` services | DB creds, Redis password, PORT (4001), etc. |
| `./frontend/.env` | Vite at FE-image build time (inside the Docker stage-1 build) | `VITE_GOOGLE_CLIENT_ID`, `VITE_STRIPE_PUBLISHABLE_KEY`, `VITE_API_BASE_URL`, etc. |

> `backend/.env` also exists in the repo, but it's only used for running the Node backend natively via `npm run dev`. The docker-only onboarding flow doesn't need it.

## 5. Run the setup script

From inside this repo:

```bash
cd sd-core-platform
./scripts/setup-local.sh
```

What it does:
1. Verifies Docker is running.
2. Confirms `.env` and `frontend/.env` are present (stops cleanly with a list if not).
3. Runs `docker compose up --build -d` to build images and start every container.
4. Waits for `prod-db` to be healthy before reporting "done".

The first run is slow (~5–10 min) because Compose builds:
- The Node backend image (Dockerfile in `backend/`).
- The frontend image with a full Vite build inside Stage 1 of `frontend/Dockerfile`.

Subsequent runs are layer-cached and finish in seconds.

## 6. Open the app

When the script finishes you'll see:

```
==> Done.
Open:
  API:       http://api.lvh.me/
  Frontend:  http://app.lvh.me/
```

`*.lvh.me` resolves to `127.0.0.1` automatically — no `/etc/hosts` edits needed. Hard-refresh (⌘⇧R / Ctrl-Shift-R) if the page looks stale.

## 7. Daily use

From the repo folder:

```bash
# Start the stack:
make dev                          # = docker compose up --build -d

# Stop the stack:
make down                         # = docker compose down

# View logs:
make logs                         # = docker compose logs -f

# Pull the latest code:
git pull
```

## 8. Common issues

| Problem | Fix |
|---|---|
| `Cannot connect to the Docker daemon` | Open Docker Desktop and wait for the whale icon to stop animating. |
| `Permission denied (publickey)` when cloning | SSH key not set up — redo step 2. |
| Script says `.env files are missing` | Place `.env` and `frontend/.env` (step 4) and re-run. |
| Frontend image build very slow / OOM | Raise Docker Desktop's CPU/RAM in **Settings → Resources**. |
| `port already allocated` for 5432 | Another local Postgres is running on the same port — stop it or change the host port mapping in `docker-compose.yml`. |
| `shared-redis` keeps restarting | Usually a Redis password mismatch between `.env` and an old volume. `docker volume rm sd-core-platform_redisdata` then re-run setup (you lose Redis state but not Postgres data). |

Logs:
```bash
docker logs -f core-backend
docker logs -f core-frontend
docker logs -f prod-db
docker logs -f shared-redis
```

## 9. After this — set up sd-listings-optimizer

Once core-platform is healthy, you can clone and set up sd-listings-optimizer (and any other satellite tools) in a sibling folder. Each has its own `docs/onboarding-local.md`.
