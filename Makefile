# Makefile to control the Development and Production environments

# --------------------------
# Development (Local)
# --------------------------

# Start the dev environment (Hot Reloading)
dev:
	docker compose up --build -d

# Start ONLY the database (Useful if you run 'npm run dev' locally)
dev-db:
	docker compose up postgres -d

# Stop the dev environment
down:
	docker compose down

# View logs for dev
logs:
	docker compose logs -f

# Setup dev environment
setup-backend:
	cd ./backend && npm install

setup-frontend:
	cd ./frontend && npm install

setup:
	cd ./backend && npm install
	cd ./frontend && npm install

# --------------------------
# Utilities
# --------------------------

# Remove all stopped containers, unused networks, and dangling images
prune:
	docker system prune -f