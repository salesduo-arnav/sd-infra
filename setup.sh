#!/usr/bin/env bash
set -euo pipefail

# ╔══════════════════════════════════════════════════════════════════════════════╗
# ║  SD Core Platform — Unified Setup Script                                   ║
# ║  Local dev, CI simulation, and AWS deployment in one place.                ║
# ║                                                                            ║
# ║  Usage:                                                                    ║
# ║    ./setup.sh              Full local dev setup                            ║
# ║    ./setup.sh --deps-only  Install npm dependencies only                   ║
# ║    ./setup.sh --lint       Run linting (backend + frontend)                ║
# ║    ./setup.sh --test       Run tests in CI mode                            ║
# ║    ./setup.sh --ci         Full CI simulation (lint + test)                ║
# ║    ./setup.sh deploy [..] AWS ECS infrastructure deployment               ║
# ╚══════════════════════════════════════════════════════════════════════════════╝

# ── Paths ─────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$SCRIPT_DIR"
cd "$PROJECT_ROOT"

COMPOSE_CI="docker compose -f docker-compose.yml -f docker-compose.ci.yml"

# ── Colors & helpers (matching infra/setup.sh style) ──────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()   { echo -e "${GREEN}[✓]${NC} $*"; }
info()  { echo -e "${CYAN}[i]${NC} $*"; }
warn()  { echo -e "${YELLOW}[!]${NC} $*"; }
error() { echo -e "${RED}[✗]${NC} $*" >&2; }
step()  { echo -e "\n${CYAN}━━━ $* ━━━${NC}"; }

# ══════════════════════════════════════════════════════════════════════════════
# Local dev helpers
# ══════════════════════════════════════════════════════════════════════════════

check_prereqs() {
  step "Checking prerequisites"

  local missing=0

  # Node.js 20+
  if command -v node &>/dev/null; then
    NODE_VERSION=$(node -v | sed 's/v//' | cut -d. -f1)
    if [ "$NODE_VERSION" -ge 20 ] 2>/dev/null; then
      log "Node.js $(node -v)"
    else
      warn "Node.js $(node -v) found — version 20+ required"
      missing=1
    fi
  else
    warn "Node.js not found"
    missing=1
  fi

  # npm
  if command -v npm &>/dev/null; then
    log "npm $(npm -v)"
  else
    warn "npm not found"
    missing=1
  fi

  # Docker
  if command -v docker &>/dev/null; then
    log "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
  else
    warn "Docker not found"
    missing=1
  fi

  # docker compose
  if docker compose version &>/dev/null; then
    log "docker compose $(docker compose version --short)"
  else
    warn "docker compose not found"
    missing=1
  fi

  if [ "$missing" -ne 0 ]; then
    error "Missing prerequisites — install the items above and retry."
    exit 1
  fi

  log "All prerequisites satisfied"
}

setup_env_files() {
  step "Setting up .env files"

  for dir in "." "backend" "frontend"; do
    if [ ! -f "$dir/.env" ]; then
      if [ -f "$dir/.env.example" ]; then
        cp "$dir/.env.example" "$dir/.env"
        log "Copied $dir/.env.example → $dir/.env"
      else
        warn "No .env.example in $dir/ — skipping"
      fi
    else
      log "$dir/.env already exists"
    fi
  done
}

install_deps() {
  step "Installing dependencies"

  info "Installing backend dependencies..."
  (cd backend && npm ci)
  log "Backend dependencies installed"

  info "Installing frontend dependencies..."
  (cd frontend && npm ci)
  log "Frontend dependencies installed"
}

wait_for_postgres() {
  local compose_cmd="${1:-docker compose}"
  info "Waiting for Postgres to be ready..."
  local retries=30
  until $compose_cmd exec -T postgres pg_isready -U myuser -d mydb &>/dev/null; do
    retries=$((retries - 1))
    if [ "$retries" -le 0 ]; then
      error "Postgres did not become ready in time."
      exit 1
    fi
    sleep 2
  done
  log "Postgres is ready"
}

run_migrations() {
  info "Running database migrations..."
  docker compose exec -T backend npm run migrate:up
  log "Migrations complete"
}

# ══════════════════════════════════════════════════════════════════════════════
# Commands
# ══════════════════════════════════════════════════════════════════════════════

cmd_full_setup() {
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  Local Development Setup                                   ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"

  check_prereqs
  setup_env_files
  install_deps

  step "Building and starting Docker services"
  docker compose up --build -d
  log "Docker services started"

  wait_for_postgres "docker compose"
  run_migrations

  step "Setup complete!"
  echo ""
  echo -e "${GREEN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${GREEN}║  Local dev environment is ready!                           ║${NC}"
  echo -e "${GREEN}╠══════════════════════════════════════════════════════════════╣${NC}"
  echo -e "${GREEN}║${NC}  Gateway:   ${CYAN}http://localhost:${GATEWAY_PORT:-80}${NC}"
  echo -e "${GREEN}║${NC}  Backend:   ${CYAN}http://localhost:3000${NC}"
  echo -e "${GREEN}║${NC}  Frontend:  ${CYAN}http://localhost:5173${NC}"
  echo -e "${GREEN}║${NC}  Grafana:   ${CYAN}http://localhost:3001${NC}  (admin/admin)"
  echo -e "${GREEN}╚══════════════════════════════════════════════════════════════╝${NC}"
}

cmd_lint() {
  step "Running linters"

  info "Linting backend..."
  (cd backend && npm run lint)
  log "Backend lint passed"

  info "Linting frontend..."
  (cd frontend && npm run lint)
  log "Frontend lint passed"
}

cmd_test() {
  step "Running tests (CI mode)"

  info "Building and starting services with CI override..."
  $COMPOSE_CI up --build -d
  log "CI services started"

  sleep 10
  $COMPOSE_CI ps

  wait_for_postgres "$COMPOSE_CI"

  info "Creating test database 'mydb_test' if needed..."
  $COMPOSE_CI exec -T postgres psql -U myuser -d mydb -c "SELECT 1 FROM pg_database WHERE datname = 'mydb_test'" | grep -q 1 \
    || $COMPOSE_CI exec -T postgres createdb -U myuser mydb_test
  log "Test database ready"

  info "Running backend tests..."
  $COMPOSE_CI exec -T backend npm test
  log "Backend tests passed"

  info "Installing Playwright dependencies..."
  (cd frontend && npx playwright install --with-deps)

  info "Running frontend E2E tests..."
  (cd frontend && CI_DOCKER=true npx playwright test)
  log "Frontend tests passed"

  info "Tearing down CI services..."
  $COMPOSE_CI down
  log "CI teardown complete"
}

cmd_ci() {
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  Full CI Simulation (lint + test)                          ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"

  check_prereqs
  cmd_lint
  cmd_test

  step "CI simulation complete!"
}

cmd_deploy() {
  if [[ ! -f "$PROJECT_ROOT/infra/setup.sh" ]]; then
    error "infra/setup.sh not found. Cannot run deployment."
    exit 1
  fi
  exec bash "$PROJECT_ROOT/infra/setup.sh" "$@"
}

cmd_help() {
  echo ""
  echo -e "${CYAN}╔══════════════════════════════════════════════════════════════╗${NC}"
  echo -e "${CYAN}║  SD Core Platform — Setup Script                           ║${NC}"
  echo -e "${CYAN}╚══════════════════════════════════════════════════════════════╝${NC}"
  echo ""
  echo "Usage: ./setup.sh [COMMAND]"
  echo ""
  echo -e "${CYAN}Local Development:${NC}"
  echo "  (no args)     Full local dev setup (prereqs → env → deps → docker → migrations)"
  echo "  --deps-only   Install npm dependencies only (backend + frontend)"
  echo ""
  echo -e "${CYAN}CI / Quality:${NC}"
  echo "  --lint         Run linting (backend + frontend)"
  echo "  --test         Run tests in CI mode (docker, Jest, Playwright)"
  echo "  --ci           Full CI simulation (lint + test)"
  echo ""
  echo -e "${CYAN}AWS Deployment:${NC}"
  echo "  deploy         Run AWS ECS infrastructure setup (infra/setup.sh)"
  echo "                 Interactive prompts for project, env, region, etc."
  echo ""
  echo "  --help, -h     Show this help message"
  echo ""
}

# ══════════════════════════════════════════════════════════════════════════════
# Main dispatcher
# ══════════════════════════════════════════════════════════════════════════════

case "${1:-}" in
  deploy)
    shift
    cmd_deploy "$@"
    ;;
  --deps-only)
    check_prereqs
    install_deps
    ;;
  --lint)
    check_prereqs
    cmd_lint
    ;;
  --test)
    check_prereqs
    cmd_test
    ;;
  --ci)
    cmd_ci
    ;;
  --help|-h)
    cmd_help
    ;;
  "")
    cmd_full_setup
    ;;
  *)
    error "Unknown command: $1"
    cmd_help
    exit 1
    ;;
esac
