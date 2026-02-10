# Contributing to sd-infra

Thank you for your interest in contributing to `sd-infra`! We welcome contributions from everyone.

## Code of Conduct

Please note that this project is released with a Contributor Code of Conduct. By participating in this project you agree to abide by its terms.

## Getting Started

1.  **Fork the repository** on GitHub.
2.  **Clone your fork** locally:
    ```bash
    git clone https://github.com/your-username/sd-infra.git
    cd sd-infra
    ```
3.  **Create a new branch** for your feature or bug fix:
    ```bash
    git checkout -b feature/amazing-feature
    # or
    git checkout -b fix/critical-bug
    ```

## Development Workflow

Please refer to the [README.md](./README.md) for detailed instructions on setting up your development environment and running the application locally.

## Code Style

We use ESLint and Prettier to maintain code quality and consistency.

-   **Linting**: Run `npm run lint` in both `frontend` and `backend` directories to check for linting errors.
-   **Formatting**: Ensure your code is formatted according to the project's Prettier configuration.

### Frontend
-   We use **React** with **TypeScript**.
-   UI components are built with **Shadcn UI** and **Tailwind CSS**.
-   Ensure components are responsive and accessible.

### Backend
-   We use **Node.js** with **Express** and **TypeScript**.
-   Follow the existing controller-service-repository pattern.
-   Ensure all new API endpoints have appropriate validation and error handling.

## Commit Messages

We encourage the use of [Conventional Commits](https://www.conventionalcommits.org/) for clear and structured commit messages.

Format: `<type>(<scope>): <subject>`

Examples:
-   `feat(auth): add google oauth login`
-   `fix(api): handle null user in getProfile`
-   `docs: update readme with setup instructions`
-   `chore: upgrade react dependencies`

## Pull Request Process

1.  Ensure your code builds and runs locally without errors.
2.  Run tests to ensure no regressions:
    -   Backend: `npm run test`
    -   Frontend: `npx playwright test`
3.  Update documentation if you are changing existing functionality or adding new features.
4.  Open a Pull Request against the `main` branch.
5.  Provide a clear description of your changes and link any relevant issues.
6.  Wait for code review and address any feedback.

## Reporting Bugs

If you find a bug, please open an issue on GitHub with details on how to reproduce it.
