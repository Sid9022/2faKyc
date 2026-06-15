# KYC Automation Platform — Development Setup Guide

Welcome to the team! This document details the step-by-step process to set up the KYC Automation application on your local machine and connect it to a database.

---

## 📋 Prerequisites

Before starting, ensure you have the following installed:
1. **Node.js (v20 or higher)** — [Download Node.js](https://nodejs.org/)
2. **Git** — [Download Git](https://git-scm.com/)
3. **PostgreSQL (v16 or higher)** — You can either run this locally, run it in Docker, or use a shared hosted instance.
4. *(Optional)* **Docker Desktop** (if you prefer running the stack via containerization).

---

## 🗄️ Database Strategy: Local vs. Shared

You have two main paths to connect your application to a database. Coordinate with your team on which one to use:

### Option A: Shared Development Database (Neon, Supabase, or RDS)
This is the easiest option for immediate collaboration. A single hosted PostgreSQL database is shared by all 4 developers.
* **Pros**: Everyone sees the exact same KYC cases, audit logs, and settings. No local setup is required.
* **Cons**: Actions performed by Developer A (e.g., submitting documents) will appear in Developer B's dashboard. A schema migration run by one developer affects everyone immediately.
* **How to Setup**:
  1. Spin up a free PostgreSQL database on [Neon.tech](https://neon.tech/) or [Supabase](https://supabase.com/).
  2. Share the connection string securely among the team.
  3. Put the URL in the `DATABASE_URL` field in `backend/.env`.

### Option B: Isolated Local Databases (Recommended for Schema Changes)
Each developer runs their own local database (natively or through Docker).
* **Pros**: Complete isolation. You can run tests, clear data, and develop features without affecting other team members.
* **Cons**: You have to run a local database process.
* **How to Setup**:
  * **Via Docker**: Use the provided `docker-compose.yml` (see Docker section below).
  * **Via Native PostgreSQL**: Run PostgreSQL on localhost (port 5432) and create a database named `kyc_automation_db`.
  * **Database URL**: `postgresql://<username>:<password>@localhost:5432/kyc_automation_db`

---

## ⚙️ Standard Manual Setup (Step-by-Step)

Follow these steps to run the backend and frontend servers locally on your machine.

### 1. Set Up the Backend Environment
Open a terminal at the repository root and navigate into the `backend` folder:

```bash
cd backend
```

1. **Install Dependencies**:
   ```bash
   npm install
   ```
2. **Configure Environment Variables**:
   Copy the sample environment file to create your local `.env`:
   * **Windows (PowerShell)**:
     ```powershell
     Copy-Item .env.example .env
     ```
   * **macOS / Linux / Windows (Git Bash)**:
     ```bash
     cp .env.example .env
     ```
3. **Edit `.env`**:
   Open the newly created `backend/.env` file and set your `DATABASE_URL`:
   ```env
   DATABASE_URL=postgresql://<db_user>:<db_password>@<db_host>:<db_port>/kyc_automation_db
   ```
   > [!NOTE]
   > Outside of production (`NODE_ENV=development`), you can leave `PAN_HASH_SECRET`, `KYC_LINK_SECRET`, `JWT_SECRET`, `ENCRYPTION_KEY`, and `WEBHOOK_SECRET` blank. The app will automatically derive safe deterministic defaults for local development and log a warning.

### 2. Prepare the Database (Migrations & Seed)
Prisma is used to manage the schema and generate the database client. Still inside the `backend` folder, run:

1. **Run Database Migrations**:
   This applies all SQL schema migrations to your database and generates the Prisma Client.
   ```bash
   npx prisma migrate deploy
   ```
   > [!TIP]
   > If you are creating *new* features that change the database schema, run `npx prisma migrate dev --name <migration_name>` instead.
2. **Seed Default Data**:
   This populates the database with required metadata (like document requirements per entity classification), settings, and a default administrator user:
   ```bash
   npm run prisma:seed
   ```
   Once successful, you will have a default admin account:
   * **Email**: `admin@2factor.local` (or whatever you set in `SEED_ADMIN_EMAIL`)
   * **Password**: `Admin@12345` (or whatever you set in `SEED_ADMIN_PASSWORD`)

### 3. Run the Backend Server
Start the backend server in development mode (with hot-reloads via `nodemon`):
```bash
npm run dev
```
The API server will boot up and listen on **`http://localhost:5000`**. You can check the health status by visiting `http://localhost:5000/healthz` in your browser.

---

### 4. Run the Frontend App
Open a *new* terminal window, navigate to the `frontend` folder from the repository root, and run:

```bash
cd frontend
npm install
npm run dev
```
The Vite dev server will boot up, usually listening on **`http://localhost:5173`**.

---

## 🐳 Quick-Start Setup (Using Docker Compose)

If you have Docker installed and want to run the whole stack (PostgreSQL + Backend + Frontend) in one command, follow these steps:

1. Create a `.env` file at the **root** of the project (next to `docker-compose.yml`).
2. Add the required production environment variables. Make sure to choose strong random strings for the secrets:
   ```env
   DB_PASSWORD=MySecurePgPassword123
   PAN_HASH_SECRET=super_secret_pan_hash_salt_min_32_characters
   KYC_LINK_SECRET=super_secret_kyc_link_salt_min_32_characters
   JWT_SECRET=super_secret_jwt_sign_key_min_32_characters
   ENCRYPTION_KEY=super_secret_pii_encryption_key_min_32_characters
   WEBHOOK_SECRET=super_secret_webhook_signature_key_min_32_characters
   SEED_ADMIN_PASSWORD=Admin@12345
   ```
3. Run the docker compose build and startup command:
   ```bash
   docker compose up --build
   ```
   This will spin up three containers:
   - `db` running PostgreSQL 16 on port `5432` (internal).
   - `backend` running the API on `http://localhost:5000`.
   - `frontend` serving the React static assets via Nginx on `http://localhost:8080`.
4. In a separate terminal window, apply migrations and seed the database inside the running backend container:
   ```bash
   docker compose exec backend npx prisma migrate deploy
   ```
   ```bash
   docker compose exec backend npm run prisma:seed
   ```

---

## 🧪 Verifying the Installation

To verify that everything is running perfectly, you can run the built-in smoke tests.

1. Keep your backend development server running.
2. In the `backend` directory, execute:
   * **Unit Tests**:
     ```bash
     npm test
     ```
   * **E2E Smoke Lifecycle Tests**:
     ```bash
     npm run test:e2e
     ```
     This script runs a complete synthetic KYC cycle (creating a purchase, generating a link, submitting files, performing video checks, and reviewing the submission) and must return `31/31 checks passed`.

---

## 🚪 Accessing the Dashboards

Once both servers are running:
* **Admin/Reviewer Console**: Open your browser and navigate to `http://localhost:5173/login`. Log in using your seeded admin credentials (`admin@2factor.local` / `Admin@12345`).
* **Simulating a Buyer Workflow**:
  1. Use Postman or `curl` to hit the dev intake route:
     ```bash
     curl -X POST http://localhost:5000/api/dev/dummy-purchase
     ```
  2. The endpoint will return a response containing a `buyerKycUrl` (e.g., `http://localhost:5173/kyc/xyz-token`).
  3. Open that URL in your browser to test the buyer onboarding experience!
