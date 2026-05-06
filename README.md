<div align="center">

# Analytics BI

**A full-stack data intelligence platform for ingesting, exploring, visualizing, and dashboarding your data.**

[![Node.js](https://img.shields.io/badge/Node.js-20+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6+-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)

[Features](#-features) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [API Reference](#-api-reference) · [Docker](#-docker-deployment) · [Contributing](#-contributing)

</div>

---

## Overview

Analytics BI is an end-to-end analytics and business intelligence web application. Upload CSV or Excel files, let the platform automatically infer schemas and clean your data, then build interactive charts and assemble them into dashboards — all from a single, unified interface.

The platform handles the full data lifecycle:

1. **Ingest** — Upload files with streaming parsing, structural validation, and schema inference
2. **Clean** — Quarantine invalid records with a Dead Letter Queue, review and restore them
3. **Explore** — Build queries with dimensions, measures, filters, and aggregations
4. **Visualize** — Create charts (bar, line, pie, scatter, box plot, and more) powered by ECharts
5. **Dashboard** — Arrange multiple charts into drag-and-drop dashboard layouts with tabs
6. **Export** — Download data and dashboards as CSV, XLSX, PDF, or PNG — on demand or on a schedule
7. **Embed** — Share published dashboards publicly via secure iframe embed tokens

---

## Features

### Data Ingestion & Management
- **Multi-format upload** — CSV, XLS, and XLSX with streaming parser
- **Ingestion modes** — `new`, `append`, or `replace` existing datasets
- **Background processing** — Large files are processed via BullMQ workers with real-time Socket.IO progress
- **Automatic schema inference** — Column types, roles (dimension/measure), cardinality, and nullability detection
- **Data quarantine (DLQ)** — Structurally or semantically invalid rows are quarantined for manual review, restoration, or deletion
- **Relationship detection** — Automatic FK-like relationship inference across datasets

### Charts & Visualization
- **Query builder** — Select dimensions, measures, aggregations, filters, sort order, and group-by fields
- **Multiple chart types** — Bar, Line, Area, Pie, Scatter, Box Plot via ECharts
- **Chart customization** — Color palettes, legend toggle, grid toggle, data labels, and axis controls
- **Chart annotations** — Add text annotations to charts for team collaboration
- **Save & manage** — Full CRUD for named, reusable chart definitions

### Dashboards
- **Dashboard builder** — Drag-and-drop layout editor with tabs for arranging charts
- **Dashboard gallery** — Browse, favorite, tag, and manage dashboards
- **Draft/Published workflow** — Private draft editing with one-click publish
- **Optimistic Concurrency Control** — Version-based conflict resolution for concurrent edits
- **Dashboard embedding** — Generate JWT-secured embed tokens for public iframe sharing

### Data Export
- **Raw data exports** — Export dataset query results as CSV or XLSX via background jobs
- **Visual dashboard exports** — Render dashboards as PDF or PNG via Puppeteer
- **Scheduled exports** — Recurring exports on cron schedules (daily, weekly, monthly) with optional email delivery
- **Export history** — Full audit trail with status tracking and download links

### AI Assistant
- **LLM-powered insights** — AI endpoint for natural-language schema extraction (placeholder — ready for LLM integration)

### Security
- **Security headers** — CSP, HSTS, X-Frame-Options (DENY), Permissions-Policy
- **Input sanitization** — Recursive HTML/script stripping, SQL/NoSQL injection detection
- **Rate limiting** — 1000 requests per IP per minute
- **CSRF protection** — Token-based validation in production
- **RBAC** — Three-tier role system (Admin, Editor, Viewer)

### Developer Experience
- **Monorepo** — npm workspaces with shared packages
- **Docker-ready** — Two compose files: monolith and MFE stacks
- **Microfrontend architecture** — Module Federation with host + 4 remotes
- **Graceful shutdown** — SIGINT/SIGTERM/SIGUSR2 handlers with clean worker teardown
- **Structured logging** — Color-coded, tagged logger with severity levels
- **Auto-port fallback** — Server scans up to 20 ports if the default is busy

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     BROWSER (Port 5173)                         │
│                                                                 │
│   React 19 + Vite 7                                             │
│   ┌──────────┬──────────┬────────┬──────────┬──────────────┐   │
│   │   Home   │ Ingest   │Datasets│  Charts  │  Dashboards  │   │
│   └──────────┴──────────┴────────┴──────────┴──────────────┘   │
│       Axios (REST)  ←──────────────→  Socket.IO (real-time)     │
└────────────────────────────────┬────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                  EXPRESS SERVER (Port 5000)                      │
│                                                                 │
│   REST API:  /api/upload · /api/datasets · /api/charts          │
│              /api/dashboards · /api/annotations · /api/export   │
│              /api/ai · /api/jobs                                │
│                                                                 │
│   Middleware: CORS · Auth · RBAC · Idempotency · Security       │
│              Headers · Rate Limiting · Sanitization · CSRF      │
│                                                                 │
│   Workers (BullMQ):                                             │
│   ├── background-tasks    (concurrency: 5)                      │
│   ├── bulk-ingestion      (concurrency: 3)                      │
│   ├── raw-export          (concurrency: 3)                      │
│   ├── dashboard-export    (concurrency: 3)                      │
│   └── scheduled-export    (concurrency: 3)                      │
│                                                                 │
│   Pipelines: Parser → Schema Inference → DTS → Query Engine    │
│   Export:    PDFKit · ExcelJS · Puppeteer                       │
└──────────┬───────────────────────────────────┬──────────────────┘
           │                                   │
           ▼                                   ▼
┌──────────────────────┐          ┌────────────────────────┐
│       MongoDB 6+     │          │       Redis 7+         │
│                      │          │                        │
│  GridFS (file store) │          │  BullMQ job queues     │
│  Metadata            │          │  DLQ watcher           │
│  CleanRecords        │          └────────────────────────┘
│  DLQRecords          │
│  Charts              │
│  Dashboards          │
│  Annotations         │
│  ExportLogs          │
│  ScheduledExports    │
└──────────────────────┘
```

---

## Project Structure

```
analytics-bi/
├── apps/
│   ├── client/                    # React 19 + Vite 7 monolith frontend
│   │   └── src/
│   │       ├── components/        # Shared UI components
│   │       ├── core/              # Config & environment
│   │       ├── hooks/             # Shared React hooks
│   │       ├── modules/
│   │       │   ├── auth/          # Login & signup pages
│   │       │   ├── home/          # Landing page
│   │       │   ├── ingestion/     # Upload wizard with progress tracking
│   │       │   ├── datasets/      # Dataset browser & management
│   │       │   ├── data-review/   # Row preview, schema editor, quarantine manager
│   │       │   ├── charts/        # Chart builder, explorer & panel
│   │       │   ├── dashboard/     # Dashboard gallery & editor
│   │       │   ├── export/        # Export functionality
│   │       │   ├── settings/      # User preferences
│   │       │   ├── sql-editor/    # SQL query interface
│   │       │   ├── chatbot/       # AI assistant module
│   │       │   └── builder/       # Visual builder utilities
│   │       └── services/          # API service layer (Axios)
│   │
│   ├── server/                    # Node.js + Express 5 backend
│   │   └── src/
│   │       ├── api/               # REST routes & controllers
│   │       │   ├── upload/        # File upload
│   │       │   ├── query/         # Dataset query & metadata
│   │       │   ├── charts/        # Chart CRUD
│   │       │   ├── dashboard/     # Dashboard CRUD
│   │       │   ├── annotations/   # Annotations
│   │       │   ├── dlq/           # Dead Letter Queue management
│   │       │   ├── export/        # Export & embed endpoints
│   │       │   └── ai/            # AI/LLM endpoint
│   │       ├── core/              # DB, Redis, Socket.IO, logging, validation
│   │       ├── export/            # Export controller & routes
│   │       ├── features/          # Feature-specific modules
│   │       ├── jobs/              # BullMQ workers, queues, retry policies
│   │       ├── middleware/        # Auth, RBAC, security, idempotency, embed
│   │       ├── models/            # Mongoose schemas
│   │       ├── pipelines/         # Parser, schema inference, DTS, query
│   │       ├── services/          # Business logic (DLQ, email, LLM, embed)
│   │       └── scripts/           # Maintenance helpers
│   │
│   ├── host/                      # MFE host shell (Module Federation)
│   ├── mfe-auth/                  # Remote: auth routes (login, signup)
│   ├── mfe-analytics/             # Remote: charts and dashboards
│   ├── mfe-data-mgmt/             # Remote: ingestion, datasets, review
│   ├── mfe-tools/                 # Remote: tools (settings, SQL, builder)
│   └── shared-lib/                # Shared MFE utilities & API helpers
│
├── docs/                          # Technical documentation
│   ├── ARCHITECTURE.md            # System diagrams & data flows
│   ├── DOCUMENTATION.md           # Comprehensive single-file reference
│   ├── SERVER.md                  # Backend architecture & API details
│   └── Structure.md               # Repository layout
│
├── docker-compose.yml             # Monolith stack (mongo, redis, server, client)
├── docker-compose.mfe.yml         # MFE stack (+ host & 4 remotes)
├── package.json                   # Root workspace configuration
└── .gitignore
```

---

## Quick Start

### Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | 20+ | Runtime |
| **MongoDB** | 6+ | Primary database |
| **Redis** | 7+ | BullMQ job queues |
| **npm** | 9+ | Package manager |

### 1. Clone the repository

```bash
git clone https://github.com/saideepaksana/Analytics-BI.git
cd Analytics-BI
```

### 2. Install dependencies

```bash
npm install
```

This installs all workspace dependencies (`apps/client`, `apps/server`, and shared packages).

### 3. Configure environment

Create `apps/server/.env`:

```env
# Database
MONGO_URI=mongodb://localhost:27017/analytics-bi

# Server
PORT=5000

# Redis
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# CORS
CORS_ORIGIN=http://localhost:5173
```

### 4. Start infrastructure services

```bash
# MongoDB
sudo systemctl start mongod

# Redis
sudo systemctl start redis-server
```

### 5. Run the application

```bash
# Start both client and server concurrently
npm run dev
```

| Service | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:5000 |

#### Run services individually

```bash
npm run dev:client   # Vite dev server only
npm run dev:server   # Express + workers only
```

---

## Docker Deployment

Two Docker Compose configurations are provided:

### Monolith Stack

```bash
docker compose up
```

| Container | Port (Host → Container) | Description |
|---|---|---|
| `analytics-client` | `5173:5173` | Vite dev server (React) |
| `analytics-server` | `5000:5000` | Express API + BullMQ workers |
| `analytics-mongo` | `27018:27017` | MongoDB 6 |
| `analytics-redis` | `6380:6379` | Redis 7 |

### Microfrontend Stack

```bash
docker compose -f docker-compose.mfe.yml up
```

| Container | Port | Description |
|---|---|---|
| `analytics-host` | `5173` | MFE host shell |
| `analytics-server-mfe` | `5000` | Express API |
| `analytics-mfe-auth` | `5001` | Auth remote |
| `analytics-mfe-analytics` | `5002` | Analytics remote |
| `analytics-mfe-data-mgmt` | `5003` | Data management remote |
| `analytics-mfe-tools` | `5004` | Tools remote |
| `analytics-mongo-mfe` | `27018` | MongoDB 6 |
| `analytics-redis-mfe` | `6380` | Redis 7 |

> **Note:** Host ports `27018` (MongoDB) and `6380` (Redis) are used to avoid conflicts with local services. Internal container communication still uses the standard ports.

---

## Role-Based Access Control (RBAC)

### Roles

| Role | Level | Capabilities |
|------|-------|--------------|
| **Admin** | 2 | Full access to all dashboards, charts, and system operations |
| **Editor** | 1 | Can create, edit, and publish dashboards/charts |
| **Viewer** | 0 | Read-only access to published dashboards and charts |

### Permission Matrix

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| View published dashboards | Yes | Yes | Yes |
| View own draft dashboards | Yes | Yes | No |
| Create dashboards/charts | Yes | Yes | No |
| Edit dashboards | Yes | Yes | No |
| Delete dashboards | Yes | Yes | No |
| Publish/Unpublish | Yes | Yes | No |

### Authentication

Currently uses header-based identification (suitable for internal deployments):

```
X-User-ID: user@example.com
X-User-Role: editor|viewer|admin
```

**For Production**: Replace with JWT tokens and server-side verification.

---

## Draft vs Published Dashboards

```
CREATE → DRAFT (private, owner-only)
  ↓
PUBLISH → PUBLISHED (visible to all authorized users)
  ↓
UNPUBLISH → DRAFT (hidden again)
```

- **Draft**: Work-in-progress, visible only to the creator
- **Published**: Visible to all users per role permissions; embeddable via tokens
- **Version Control**: Optimistic concurrency control prevents conflicting edits

---

## Security

| Control | Implementation |
|---------|---------------|
| **Security Headers** | CSP, X-Frame-Options (DENY), HSTS, X-Content-Type-Options, Permissions-Policy |
| **Input Sanitization** | Recursive HTML/script tag stripping on all string inputs |
| **Injection Protection** | SQL and NoSQL operator pattern detection and blocking |
| **Rate Limiting** | 1000 requests per IP per minute (in-memory sliding window) |
| **CSRF Protection** | Token-based validation on mutating requests (production only) |
| **CORS** | Configurable origin allowlist via `CORS_ORIGIN` environment variable |

---

## API Reference

### Upload & Ingestion

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/upload` | Upload a CSV/Excel file (multipart/form-data) |
| `GET` | `/api/upload/active-jobs` | List active background ingestion jobs |

**Upload form fields:**
- `file` — The CSV, XLS, or XLSX file
- `mode` — `new` \| `append` \| `replace`
- `datasetId` — Required for `append` / `replace` modes
- `uploadId` — Client-generated ID for Socket.IO progress tracking
- `quarantine` — `true` \| `false` to enable/disable quarantine

### Datasets & Data Review

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/datasets` | List all datasets |
| `GET` | `/api/datasets/:id/metadata` | Get dataset metadata, schema, and preview |
| `GET` | `/api/datasets/:id/schema` | Get full schema |
| `GET` | `/api/datasets/:id/schema/compact` | Get compact schema |
| `POST` | `/api/datasets/:id/query` | Query dataset with filters/aggregations |
| `POST` | `/api/datasets/:id/query/preview-stage` | Preview aggregation group stage |
| `POST` | `/api/datasets/:id/validate-payload` | Validate data payload against schema |
| `POST` | `/api/datasets/:id/relationships` | Add a relationship |
| `DELETE` | `/api/datasets/:id/relationships` | Remove a relationship |
| `PATCH` | `/api/datasets/:id/schema/:columnName` | Update column type or role |
| `POST` | `/api/datasets/:id/quarantine/:rowIndex/validate` | Validate a quarantined row |
| `POST` | `/api/datasets/:id/quarantine/:rowIndex/restore` | Restore a quarantined row |
| `POST` | `/api/datasets/:id/quarantine/restore-all` | Restore all quarantined rows |
| `DELETE` | `/api/datasets/:id/quarantine/:rowIndex` | Delete a quarantined row |
| `DELETE` | `/api/datasets/:id/quarantine` | Delete all quarantined rows |
| `DELETE` | `/api/datasets/:id` | Delete dataset and associated records |

### Charts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/charts` | List saved charts |
| `POST` | `/api/charts` | Create a new chart |
| `GET` | `/api/charts/:id` | Get chart by ID |
| `DELETE` | `/api/charts/:id` | Delete a chart |

### Dashboards

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboards` | List all dashboards |
| `POST` | `/api/dashboards` | Create a new dashboard |
| `GET` | `/api/dashboards/:id` | Get dashboard by ID |
| `GET` | `/api/dashboards/:id/full` | Get dashboard with populated chart data |
| `GET` | `/api/dashboards/:id/draft` | Get draft state (owner only) |
| `POST` | `/api/dashboards/:id/publish` | Publish draft → live |
| `POST` | `/api/dashboards/:id/unpublish` | Revert to draft |
| `POST` | `/api/dashboards/:id/save-draft` | Save draft changes |
| `POST` | `/api/dashboards/:id/refresh` | Refresh dashboard data |
| `PATCH` | `/api/dashboards/:id` | Autosave with OCC |
| `PATCH` | `/api/dashboards/:id/layout` | Update layout |
| `PATCH` | `/api/dashboards/:id/metadata` | Update metadata fields |
| `DELETE` | `/api/dashboards/:id` | Delete dashboard |

### Annotations

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/annotations/chart/:chartId` | List annotations for a chart |
| `GET` | `/api/annotations/dashboard/:dashboardId` | List annotations for a dashboard |
| `POST` | `/api/annotations` | Create an annotation |
| `PUT` | `/api/annotations/:id` | Update an annotation |
| `DELETE` | `/api/annotations/:id` | Delete an annotation |

### Export & Embed

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/export/raw` | Start raw data export (CSV/XLSX) |
| `POST` | `/api/export/visual` | Start visual dashboard export (PDF/PNG) |
| `GET` | `/api/export/status/:jobId` | Poll export job status |
| `GET` | `/api/export/download/:filename` | Download completed export file |
| `GET` | `/api/export/:datasetId/log` | Export history for a dataset |
| `GET` | `/api/export/dashboards/:dashboardId/log` | Export history for a dashboard |
| `POST` | `/api/export/embed/token` | Generate embed token for a dashboard |
| `GET` | `/api/export/embed/:dashboardId` | Get embedded dashboard data |
| `POST` | `/api/export/schedules` | Create a scheduled export |
| `GET` | `/api/export/schedules` | List scheduled exports |
| `DELETE` | `/api/export/schedules/:scheduleId` | Delete a scheduled export |

### AI

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/ai/parse-text` | Parse text to extract schema suggestions |

---

## Data Flow

```
User selects file + mode
        │
        ▼
POST /api/upload (multipart)
        │
        ├─ Validate request (file, mode, extension)
        ├─ Store file in GridFS
        ├─ Emit Socket.IO progress: received → stored
        │
        ▼
Streaming Parse + Structural Validation
        │
        ├─ CSV/Excel row iterator
        ├─ Worker thread batches (configurable batch size)
        ├─ Bad rows → DLQ set
        ├─ Valid rows → parsedRows
        │
        ▼
Schema Inference + DTS Transform
        │
        ├─ Infer column types, roles, cardinality
        ├─ Clean/normalize values
        ├─ Semantic validation
        ├─ Valid rows   → CleanRecord collection
        ├─ Invalid rows → DLQRecord collection
        │
        ▼
Metadata Upsert + Relationship Refresh
        │
        ▼
HTTP 200 + Socket.IO stage: done (100%)
```

---

## Database Collections

| Collection | Purpose |
|---|---|
| `uploads.files` | GridFS file metadata |
| `uploads.chunks` | GridFS binary data chunks |
| `metadatas` | Dataset-level schema, counts, relationships |
| `cleanrecords` | Valid, normalized data rows |
| `dlqrecords` | Quarantined rows with error details |
| `rawrecords` | Raw ingested rows |
| `charts` | Saved chart definitions |
| `dashboards` | Dashboard layouts and chart references |
| `annotations` | Chart and dashboard text annotations |
| `idempotencies` | Request deduplication records |
| `exportlogs` | Export operation audit trail |
| `scheduledexports` | Recurring export configurations |

---

## Tech Stack

### Frontend

| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 7 | Build tool & dev server |
| ECharts 6 | Charting & visualization |
| Axios | HTTP client |
| Socket.IO Client 4 | Real-time progress updates |
| React Router 7 | Client-side routing |
| Lucide React | Icon library |
| html2canvas | Client-side screenshot capture |
| Module Federation | Microfrontend architecture |

### Backend

| Technology | Purpose |
|---|---|
| Express 5 | HTTP server & routing |
| Mongoose 9 | MongoDB ODM |
| BullMQ 5 | Background job processing |
| IORedis 5 | Redis client |
| Socket.IO 4 | WebSocket server |
| Busboy | Streaming multipart parsing |
| fast-csv | CSV parsing |
| ExcelJS | XLSX reading & writing |
| PDFKit | PDF generation |
| Puppeteer | Headless Chrome for visual exports |
| AJV | JSON Schema validation |
| json2csv | CSV serialization |
| Helmet | Security headers |
| jsonwebtoken | JWT for embed tokens |
| Nodemailer | Email delivery |

### Infrastructure

| Technology | Purpose |
|---|---|
| MongoDB 6+ | Primary database + GridFS file storage |
| Redis 7+ | Job queues & worker coordination |
| Docker Compose | Container orchestration |
| Node.js 20+ | Server runtime |
| Nodemon | Development auto-reload |

---

## Available Scripts

### Root

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start client + server concurrently |
| `dev:client` | `npm run dev:client` | Start Vite dev server only |
| `dev:server` | `npm run dev:server` | Start Express server with nodemon |
| `dev:mfe` | `npm run dev:mfe` | Start MFE host + all 4 remotes |
| `install:all` | `npm run install:all` | Install all workspace dependencies |
| `build:mfe` | `npm run build:mfe` | Build all MFE apps for production |

### Client (`apps/client`)

| Script | Description |
|---|---|
| `npm run dev` | Start Vite dev server |
| `npm run build` | Production build |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

### Server (`apps/server`)

| Script | Description |
|---|---|
| `npm run dev` | Start with nodemon (4GB heap) |
| `npm start` | Start with node (4GB heap) |

---

## Contributing

Contributions are welcome! Please follow these guidelines:

1. **Fork** the repository and create a feature branch from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Install dependencies** and ensure everything builds:
   ```bash
   npm install
   npm run dev
   ```

3. **Code style**:
   - Follow existing patterns in the codebase
   - Use meaningful variable and function names
   - Add JSDoc comments for public functions
   - Run `npm run lint` in `apps/client` before committing

4. **Commit messages**: Use [Conventional Commits](https://www.conventionalcommits.org/):
   ```
   feat: add scatter plot support to chart builder
   fix: resolve DLQ restore-all race condition
   docs: update API reference for export endpoints
   ```

5. **Pull Requests**:
   - Provide a clear description of the change and its motivation
   - Reference any related issues
   - Ensure no regressions in existing functionality

6. **Testing**: Verify your changes work end-to-end (upload → visualize → export) before submitting.

---

## Documentation

Detailed documentation lives in the [`docs/`](docs/) directory:

| Document | Description |
|----------|-------------|
| [ARCHITECTURE.md](docs/ARCHITECTURE.md) | System diagrams, data flows, MFE structure, scalability |
| [DOCUMENTATION.md](docs/DOCUMENTATION.md) | Comprehensive single-file reference (API, models, queues, config) |
| [SERVER.md](docs/SERVER.md) | Backend architecture, full API surface, operational details |
| [Structure.md](docs/Structure.md) | Repository layout and module boundaries |

---

## License

None

---