# KYC Automation App

Welcome to the **2Factor KYC Automation Platform** repository. This project is a secure, full-lifecycle KYC workflow engine designed to automate PAN-based verification, document checks, and video declarations for buyers, with a review dashboard for administrators.

This guide is designed for the team of contributors collaborating on the repository.

---

## 🗺️ Project Navigation

To help you get started quickly, here is a directory map of key documentation:

- 🛠️ **[DEVELOPMENT_SETUP.md](file:///c:/Users/aryan/Desktop/1stfolder/kyc-automation-app/DEVELOPMENT_SETUP.md)** — **Start here!** Instructions to set up your environment, connect to the database (local or shared), run the dev servers, and populate seed data.
- 🤝 **[GITHUB_GUIDELINES.md](file:///c:/Users/aryan/Desktop/1stfolder/kyc-automation-app/GITHUB_GUIDELINES.md)** — Our Git branching, pull request, database migration sync, and collaborative guidelines.
- 🗄️ **[DatabaseGuide.md](file:///c:/Users/aryan/Desktop/1stfolder/kyc-automation-app/DatabaseGuide.md)** — ER diagram, detailed schema reference, and overall state machines.
- 🔌 **[APIEndpoint.md](file:///c:/Users/aryan/Desktop/1stfolder/kyc-automation-app/APIEndpoint.md)** — Fully documented backend routes, request/response models, auth headers, and curl examples.
- 🎯 **[Plan.md](file:///c:/Users/aryan/Desktop/1stfolder/kyc-automation-app/Plan.md)** — Current roadmap, status checklist (completed vs remaining), and architectural specifications.
- 📈 **[CurrentStage.md](file:///c:/Users/aryan/Desktop/1stfolder/kyc-automation-app/CurrentStage.md)** — Details of what works end-to-end, what is verified by tests, and outstanding checklist items.
- 💡 **[CLAUDE.md](file:///c:/Users/aryan/Desktop/1stfolder/kyc-automation-app/CLAUDE.md)** — Core codebase invariants, quick command run-sheets, and structural context.

---

## 🏗️ Architecture Overview

The application is structured as a decoupled monorepo:

```txt
kyc-automation-app/
├── backend/                  # Node.js + Express + Prisma (TypeScript)
│   ├── prisma/               # Schema declarations, migrations, and seed scripts
│   ├── src/                  # Controllers, services, routes, utilities, and config
│   └── tests/                # Smoke tests and automated test suites
├── frontend/                 # React + Vite + Tailwind CSS
│   ├── src/                  # Views (Buyer wizard, Reviewer dashboard, Admin settings)
│   └── nginx.conf            # Docker Nginx deployment setup
└── docker-compose.yml        # Multi-container orchestration (DB, Backend, Frontend)
```

### Key Technical Stack
- **Backend**: Node.js (v20+), Express.js, Prisma ORM, bcryptjs (cryptography), jsonwebtoken (RBAC session handling).
- **Frontend**: React (v19), Tailwind CSS, Vite, Axios, MediaPipe Tasks-Vision (for client-side face verification).
- **Database**: PostgreSQL (v16).
