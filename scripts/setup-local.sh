#!/usr/bin/env bash
# scripts/setup-local.sh — first-time local setup for sd-core-platform.
#
# After you've cloned this repo:
#   $ cd sd-core-platform
#   $ ./scripts/setup-local.sh
#
# What this script does:
#   1. Verifies Docker is installed and running.
#   2. Checks the two .env files this project needs are present
#      (.env at the repo root and frontend/.env). If missing, prints
#      exactly which and stops — get them from a teammate or the team
#      password manager.
#   3. Runs `docker compose up --build -d` to bring up the whole core
#      platform stack (postgres, redis, core-backend, core-frontend,
#      gateway, logging stack).
#
# Prerequisites (one time per machine):
#   • Docker Desktop installed and running (≥ 4 CPU / ≥ 8 GB RAM).
#   • git + SSH access to SalesDuo on GitHub.
#
# Side-by-side with sd-listings-optimizer:
#   This repo is the platform foundation. Set it up first; listings (and
#   other satellite tools) connect to its gateway at http://api.lvh.me/
#   and rely on its sessions in shared-redis.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd -P)"

GREEN=$'\033[0;32m'; YELLOW=$'\033[0;33m'; RED=$'\033[0;31m'; CYAN=$'\033[0;36m'; NC=$'\033[0m'
step() { echo; echo "${CYAN}==> $*${NC}"; }
ok()   { echo "${GREEN}    ✓ $*${NC}"; }
warn() { echo "${YELLOW}    ⚠ $*${NC}"; }
fail() { echo "${RED}    ✗ $*${NC}" >&2; exit 1; }

step "1. Docker"
command -v docker >/dev/null || fail "Docker not found. Install Docker Desktop: https://www.docker.com/products/docker-desktop/"
docker info >/dev/null 2>&1  || fail "Docker daemon not running. Open Docker Desktop and wait for the whale icon to settle."
ok "Docker available and responsive"

step "2. .env files"
# Two .env files matter for the docker-only flow:
#   .env          — referenced by `env_file: ./.env` in docker-compose.yml
#                   for prod-db and core-backend (DB creds, Redis password,
#                   PORT, etc.).
#   frontend/.env — picked up by Vite at FE-image build time (VITE_* vars
#                   like VITE_GOOGLE_CLIENT_ID, VITE_STRIPE_PUBLISHABLE_KEY).
# backend/.env exists in the repo for `npm run dev` native workflow but is
# NOT loaded by docker-compose; skipping it is safe for the onboarding flow.
MISSING=()
for f in .env frontend/.env; do
    [ -f "$REPO_ROOT/$f" ] || MISSING+=("$f")
done
if [ ${#MISSING[@]} -gt 0 ]; then
    warn "Missing .env files (ask a teammate or pull from the team password manager):"
    for f in "${MISSING[@]}"; do echo "        $REPO_ROOT/$f"; done
    echo
    echo "${CYAN}Place them at the paths above, then re-run this script.${NC}"
    exit 1
fi
ok ".env + frontend/.env present"

step "3. Bring up the stack (docker compose up --build -d)"
cd "$REPO_ROOT"
# First build is slow (~5–10 min on a fresh clone) because the frontend
# image bundles a full Vite build inside Dockerfile Stage 1. Subsequent
# runs are cached and finish in seconds.
docker compose up --build -d 2>&1 \
    | grep -E "Building|Started|Created|Recreated|healthy" \
    | sed 's/^/    /'

# Wait for prod-db healthcheck so the apps don't race the DB on first run.
step "4. Wait for postgres healthy"
for i in {1..30}; do
    st=$(docker inspect -f '{{.State.Health.Status}}' prod-db 2>/dev/null || echo "starting")
    [[ "$st" == "healthy" ]] && break
    sleep 2
done
if [[ "$st" == "healthy" ]]; then
    ok "prod-db healthy"
else
    warn "prod-db not healthy after 60s (status: $st) — check 'docker logs prod-db'"
fi

step "5. Container status"
docker compose ps --format "table {{.Name}}\t{{.Status}}" | sed 's/^/    /'

step "Done."
echo
echo "${CYAN}Open:${NC}"
echo "  API:       http://api.lvh.me/"
echo "  Frontend:  http://app.lvh.me/"
echo
echo "${CYAN}Next:${NC} if you also need sd-listings-optimizer running, follow that"
echo "       repo's docs/onboarding-local.md."
