# sd-infra

Welcome to `sd-infra`! This repository contains the source code for the SalesDuo base / core platform infrastructure, including the frontend application and backend services.

## Project Overview

The project is structured as a monorepo with the following main components:

-   **Frontend**: A React application built with Vite, TypeScript, Shadcn UI, and Tailwind CSS.
-   **Backend**: A Node.js Express application using TypeScript and PostgreSQL.
-   **Infrastructure**: Dockerized setup for easy development and deployment.

## Tech Stack

### Frontend
-   **Framework**: React, Vite
-   **Language**: TypeScript
-   **UI Library**: Shadcn UI, Tailwind CSS
-   **Testing**: Playwright
-   **State Management**: React Query, Context API

### Backend
-   **Framework**: Express.js
-   **Language**: TypeScript
-   **Database**: PostgreSQL
-   **ORM**: Sequelize
-   **Caching**: Redis
-   **Testing**: Jest

### DevOps
-   **Containerization**: Docker, Docker Compose
-   **Automation**: Make

## Prerequisites

Before you begin, ensure you have the following installed:
-   [Node.js](https://nodejs.org/) (v18 or higher)
-   [Docker & Docker Compose](https://www.docker.com/)
-   [Make](https://www.gnu.org/software/make/) (optional, but recommended for ease of use)

## Getting Started

### 1. Clone the Repository

```bash
git clone https://github.com/your-username/sd-infra.git
cd sd-infra
```

### 2. Environment Setup

Copy the example environment file:
```bash
cp .env.example .env
```
Update the `.env` file with your specific configuration if necessary.

### 3. Install Dependencies

You can install dependencies for both frontend and backend using the provided Makefile command:
```bash
make setup
```
Or manually:
```bash
cd backend && npm install
cd ../frontend && npm install
```

### 4. Running the Application (Docker)

The easiest way to run the entire stack is using Docker Compose:
```bash
make dev
```
This will start the frontend, backend, database, and redis containers.
-   Frontend: http://localhost:5173
-   Backend: http://localhost:8000 (check your .env for the port)

### 5. Running Manually

If you prefer to run services individually:

**Backend:**
```bash
# Start DB services first
make dev-db

cd backend
# Run migrations
npm run migrate:up
# Start server
npm run dev
```

**Frontend:**
```bash
cd frontend
npm run dev
```

## Database Management

-   **Run Migrations**: `npm run migrate:up` (in `backend` dir)
-   **Undo Migration**: `npm run migrate:down` (in `backend` dir)
-   **Create Migration**: `npm run migrate:create -- --name migration-name`

## Testing

### Backend Tests
```bash
cd backend
npm run test
```

### Frontend E2E Tests (Playwright)
Prerequisites:
```bash
cd frontend
npm install -D @playwright/test
npx playwright install --with-deps
```

Run tests:
```bash
cd frontend
npm run test:e2e
```

## Contributing

Please read [CONTRIBUTING.md](./CONTRIBUTING.md) for details on our code of conduct, and the process for submitting pull requests.

## Project Structure

```
sd-infra/
├── backend/            # Backend Express application
├── frontend/           # Frontend React application
├── gateway/            # API Gateway configuration (if applicable)
├── docker-compose.yml  # Docker composition
├── Makefile            # Helper commands
└── README.md           # Project documentation
```