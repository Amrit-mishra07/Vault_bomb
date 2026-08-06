# Contributing to Vault_bomb

First off, thank you for considering contributing to Vault_bomb! 🚀 

It's people like you that make open-source such a great community. Our goal is to build a secure, efficient, and reliable project, and we appreciate any help—whether it's fixing bugs, improving documentation, or adding new features.

Please take a moment to review this document to make the contribution process easy and effective for everyone involved.

---

## Table of Contents

- [Before You Start](#before-you-start)
- [Development Setup](#development-setup)
- [Branching Strategy](#branching-strategy)
- [Coding Standards](#coding-standards)
- [Commit Message Guidelines](#commit-message-guidelines)
- [Pull Request Process](#pull-request-process)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [Documentation Contributions](#documentation-contributions)
- [Testing Expectations](#testing-expectations)
- [Community & Communication](#community--communication)
- [Recognition](#recognition)

---

## Before You Start

Before diving into the code, we ask that you:
- **Read the README:** Familiarize yourself with the project's goals and overall architecture.
- **Search Existing Issues & PRs:** Check if your issue or feature has already been discussed, addressed, or is currently being worked on.
- **Respect the Code of Conduct:** Treat everyone with respect and follow our community guidelines (if a `CODE_OF_CONDUCT.md` is present).

## Development Setup

To set up the project locally, follow these steps:

1. **Fork the repository** on GitHub.
2. **Clone your fork** locally:
   ```bash
   git clone https://github.com/YOUR_USERNAME/Vault_bomb.git
   cd Vault_bomb
   ```
3. **Install dependencies:**
   ```bash
   # Install backend dependencies
   cd lit-simulator
   npm install

   # Install frontend dependencies
   cd ../frontend
   npm install
   ```
4. **Set up the environment:**
   Create a `.env` file in the `frontend/` directory with your deployed contract address and the local simulator URL:
   ```env
   VITE_CONTRACT_ADDRESS=0x0c92d14eea513a216ab1559deac8e0ce8fabc3b9
   VITE_LIT_SIMULATOR_URL=http://localhost:3000
   ```
5. **Run the project:**
   You will need to run the Lit Simulator (backend) and the React application (frontend) in two separate terminal windows.
   
   **Terminal 1 (Backend):**
   ```bash
   cd lit-simulator
   npm start
   ```
   
   **Terminal 2 (Frontend):**
   ```bash
   cd frontend
   npm run dev
   ```
   
6. **Run tests:**
   ```bash
   cd frontend
   npm run build
   ```

## Branching Strategy

We use a feature-branching model. Please do not commit directly to the `main` branch. Create a new branch for your work:

```bash
git checkout -b <type>/<short-description>
```

### Branch Naming Conventions

| Prefix      | Use Case                                  | Example                       |
| ----------- | ----------------------------------------- | ----------------------------- |
| `feature/`  | Adding a new feature                      | `feature/user-auth`           |
| `fix/`      | Fixing a bug                              | `fix/login-crash`             |
| `docs/`     | Documentation updates                     | `docs/readme-update`          |
| `refactor/` | Code refactoring without changing logic   | `refactor/extract-api-logic`  |
| `chore/`    | Maintenance tasks, dependencies, tooling  | `chore/update-deps`           |

## Coding Standards

To maintain a healthy codebase, please follow these guidelines:
- **Follow existing styles:** Match the indentation, spacing, and styling of the existing code.
- **Modular functions:** Keep functions small, focused, and single-purpose.
- **Meaningful names:** Use descriptive variable and function names.
- **Thoughtful comments:** Write comments to explain *why* something is done, not *what* is done. Self-documenting code is preferred.
- **Focused commits:** Keep your commits focused on a single logical change.

## Commit Message Guidelines

We strongly recommend following [Conventional Commits](https://www.conventionalcommits.org/). This helps us automatically generate changelogs and keeps the history clean.

### Format
```text
<type>(<optional scope>): <description>
```

### Examples
- `feat: add two-factor authentication`
- `fix(ui): resolve button alignment issue on mobile`
- `docs: update setup instructions in README`
- `refactor: simplify database connection logic`
- `test: add unit tests for user service`
- `chore: update github action runners`

## Pull Request Process

When you're ready to submit your changes, follow this process:

1. **Sync with `main`:** Ensure your branch is up to date with the upstream `main` branch to resolve any conflicts.
2. **Keep it small:** Smaller PRs are easier and faster to review. If your feature is large, consider breaking it into multiple PRs.
3. **Link related issues:** Mention the issue number in the PR description (e.g., `Closes #42`).
4. **Provide context:** Use the PR template (if provided) and explain what and why you changed.
5. **Add screenshots/videos:** If your PR introduces UI changes, include before and after screenshots.
6. **Update documentation:** If you added a new feature or changed an API, update the relevant documentation.
7. **Ensure CI passes:** Make sure all tests and linters pass before requesting a review.
8. **Respond to feedback:** Be open to constructive criticism and ready to make requested changes.

## Reporting Bugs

A great bug report helps us fix issues quickly. When creating a bug report, please include:
- **System info:** OS, browser, or runtime environment version.
- **Expected behavior:** What you thought would happen.
- **Actual behavior:** What actually happened.
- **Steps to reproduce:** A clear, numbered list of steps to recreate the issue.
- **Logs & Screenshots:** Attach relevant error logs, stack traces, or visual proof.

## Suggesting Features

We love new ideas! If you have a feature request:
- **Explain the problem:** Detail the issue or missing functionality you want to address.
- **Propose a solution:** Explain how you think the feature should work.
- **Alternatives considered:** Mention any workarounds or alternative approaches you thought of.
- **Additional context:** Share mockups, inspiration, or similar features in other projects.

## Documentation Contributions

Documentation is just as important as code! We welcome contributions that:
- Fix typos or grammatical errors.
- Clarify confusing sections.
- Add real-world examples or tutorials.
- Update outdated instructions.

## Testing Expectations

Before submitting a PR, ensure your code doesn't break existing functionality:
- Run the full test suite locally.
- If you're adding new functionality, **write tests** to cover your new code.
- If you're fixing a bug, add a test that prevents the bug from happening again.

## Community & Communication

We are committed to providing a welcoming and inspiring community for all. 
- **Be respectful:** Treat everyone with kindness and patience.
- **Constructive feedback:** Focus on the code, not the person, when reviewing PRs.
- **Collaboration:** Ask questions, share knowledge, and help others grow.

## Recognition

Thank you for dedicating your time and energy to Vault_bomb. Every contribution—whether it's a single typo fix, a massive feature, or answering a question—matters and makes this project better for everyone. We couldn't do it without you! ❤️
