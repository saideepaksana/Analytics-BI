# Analytics BI Repository Structure

This repository is a monorepo that hosts the frontend applications, backend API, and shared utilities. The codebase supports a monolith client and a host + microfrontend migration path.

## Top-Level Layout

```text
analytics-bi/
├── apps/
│   ├── client/                 # Monolith React client (primary UI today)
│   ├── host/                   # MFE host shell (Module Federation)
│   ├── mfe-auth/               # Remote: auth routes (login, signup)
│   ├── mfe-analytics/          # Remote: charts and dashboards
│   ├── mfe-data-mgmt/          # Remote: ingestion, datasets, review
│   ├── mfe-tools/              # Remote: tools (settings, SQL, builder)
│   ├── server/                 # Express API, jobs, pipelines
│   └── shared-lib/             # Shared MFE utilities and API helpers
├── docs/                       # Canonical technical documentation
├── docker-compose.yml          # Monolith stack orchestration
├── docker-compose.mfe.yml      # MFE stack orchestration
├── package.json                # Workspace root (npm workspaces)
└── README.md
```

## Frontend Applications

### apps/client (Monolith UI)

Primary UI built with React 19 + Vite 7. It contains all major user flows:
- ingestion wizard and upload progress
- datasets browser and data review
- chart creation and exploration
- dashboard gallery and editor
- export management and scheduled exports

Key folders:
```text
apps/client/src/
├── core/            # API config, auth, utilities
├── services/        # REST API clients
├── modules/         # Feature modules (ingestion, charts, dashboard, etc.)
├── components/      # Shared UI components
└── hooks/           # Shared hooks
```

### apps/host + apps/mfe-*

Module Federation-based split used for incremental migration. The host provides shell layout and routing; each remote maps to a feature area while reusing shared-lib and backend APIs.

## Backend Application

### apps/server (Express API)

Key folders:
```text
apps/server/src/
├── api/             # REST routes/controllers (upload, datasets, charts, dashboards)
├── core/            # DB, Redis, Socket.IO, logging, validation
├── export/          # Export endpoints and orchestration
├── features/        # Feature-specific modules (export workers)
├── jobs/            # BullMQ queues/workers and retry policies
├── middleware/      # Request-level middleware (auth, RBAC, idempotency, security)
├── models/          # Mongoose schemas (Metadata, Chart, Dashboard, ExportLog, etc.)
├── pipelines/       # Parser, schema inference, DTS transform, query helpers
├── services/        # Business logic and integrations (DLQ, email, LLM, embed tokens)
└── scripts/         # Maintenance and test helpers
```

## Shared Library

### apps/shared-lib

Cross-app utilities used by the host and remotes:
- API base URLs and environment helpers
- shared API client and error handling
- auth bridge and event bus

## Documentation

The full documentation set lives under `docs/`. Start with `docs/README.md` for an index and onboarding path.
