# KYC Automation Platform — GitHub Collaboration Guidelines

This document outlines the version control workflows, branching model, code review rules, and Prisma database migration practices for our team of 4 contributors. Adhering to these guidelines ensures clean Git history, stable deployments, and minimal merge conflicts.

---

## 🌿 1. Branching Strategy (GitHub Flow)

We use a simple, short-lived branching workflow. The `main` branch always represents the current, stable production-ready state of the application.

### Branch Naming Conventions
Always name your branches based on the work being done, using the following prefixes:
* `feature/` for new features (e.g., `feature/s3-storage`, `feature/ocr-extraction`)
* `bugfix/` for fixing bugs (e.g., `bugfix/video-upload-validation`, `bugfix/link-expiry-timezone`)
* `refactor/` for code cleanup or restructuring without changing behavior (e.g., `refactor/db-services`)
* `docs/` for writing documentation (e.g., `docs/api-guide-updates`)

---

## 🔄 2. Step-by-Step Collaborative Workflow

Follow this sequence for every change you make to the repository:

### Step 1: Sync Your Local Repository
Before starting any work, ensure your local copy of `main` is completely up-to-date:
```bash
git checkout main
git pull origin main
```

### Step 2: Create a Feature Branch
Create a branch from `main`:
```bash
git checkout -b feature/your-feature-name
```

### Step 3: Implement Changes & Commit
Make your changes, keeping commits atomic and focused. Use descriptive commit messages (e.g., `feat: encrypt buyer email and mobile at rest` or `fix: resolve skipped document upload validation bug`).
```bash
git add .
git commit -m "feat: implement X feature"
```

### Step 4: Keep Your Branch Updated
If other team members have merged changes into `main` since you created your branch, pull `main` back into your branch to resolve potential conflicts early:
```bash
git pull origin main
```
*Resolve any conflicts locally, verify that the application compiles, and ensure tests pass (`npm test` in the backend).*

### Step 5: Push and Open a Pull Request (PR)
Push your branch to GitHub:
```bash
git push origin feature/your-feature-name
```
Go to your private GitHub repository, select your branch, and click **New Pull Request**.

---

## 🗄️ 3. Rules for Prisma Database Migrations (CRITICAL)

Because we are using Prisma ORM, database schema changes must be managed carefully so that they don't break database states for other developers.

### Rule A: Creating Schema Changes (Developer A)
If your task requires adding a column, modifying a table, or creating a new model:
1. Edit the source of truth schema file: [backend/prisma/schema.prisma](backend/prisma/schema.prisma).
2. Generate and apply a migration locally:
   ```bash
   cd backend
   npx prisma migrate dev --name your_migration_description
   ```
   *This command updates your local database, generates a new migration directory in `backend/prisma/migrations/`, and updates the Prisma Client code.*
3. Commit **both** the updated `schema.prisma` file **and** the entire new migration folder (e.g., `backend/prisma/migrations/2026xxxx_your_migration_description/`) to git.
4. Push and open your PR.

### Rule B: Consuming Schema Changes (Developer B, C, D)
When you pull code from Git and see that a teammate has added a database migration:
1. Pull the changes:
   ```bash
   git pull origin main
   ```
2. Apply the pending migrations to your database:
   ```bash
   cd backend
   npx prisma migrate deploy
   ```
   *Never skip this step! Running the server with outdated schemas will cause database runtime query errors.*

### Rule C: NEVER Manually Edit Migration SQL Files
If you make a mistake in a database schema change, do not edit files inside `backend/prisma/migrations/` manually. Instead:
- If you haven't committed yet: roll back using `npx prisma migrate reset` or revert changes in `schema.prisma` and run `npx prisma migrate dev` again.
- If it's already committed/pushed: create a *new* schema change in `schema.prisma` and run `npx prisma migrate dev` again to generate a corrective migration.

---

## 🔍 4. Pull Request & Code Review Process

To maintain quality and transfer knowledge across the 4 team members:

1. **Pull Request Description**: Provide a clear summary of what was changed, any files added/removed, and how you tested the changes.
2. **Review Requirement**: Every PR must be reviewed and approved by **at least one other team member** before it can be merged.
3. **No Direct Merging**: Do not force-merge your own PRs onto `main` unless it is a critical, coordinated hotfix.
4. **Before Merging Checklist**:
   - [ ] Code has no linting errors (`npm run lint` passes).
   - [ ] All unit tests pass (`npm test` passes).
   - [ ] E2E lifecycle smokes pass (`npm run test:e2e` passes).
   - [ ] Migrations (if any) are properly checked-in.

---

## 🛠️ 5. Handy Git Commands Cheat Sheet

Here are the commands you'll use most frequently:

| Goal | Command |
|---|---|
| Check current branch and modified files | `git status` |
| View changes made in real-time | `git diff` |
| Stash temporary modifications | `git stash` (Retrieve with `git stash pop`) |
| See git commit history | `git log --oneline -n 10` |
| Revert unstaged changes in a file | `git checkout -- path/to/file` |
| Delete a local branch (after merge) | `git branch -d branch-name` |
| Delete a remote branch (after merge) | `git push origin --delete branch-name` |

---

## ⚠️ 6. Security Warnings
* **Secrets**: Never commit `.env` files. Ensure they are listed in `.gitignore` (they are already ignored in our workspace).
* **PII Data**: Do not log plaintext PAN numbers, emails, or phone numbers in your commits, logs, or comments.
