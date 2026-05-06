<div align="center">

# Analytics BI

**A full-stack data intelligence platform for ingesting, exploring, visualizing, and dashboarding your data.**

[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![MongoDB](https://img.shields.io/badge/MongoDB-6+-47A248?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Redis](https://img.shields.io/badge/Redis-7+-DC382D?logo=redis&logoColor=white)](https://redis.io/)
[![Vite](https://img.shields.io/badge/Vite-7-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)


[Features](#-features) · [Quick Start](#-quick-start) · [Architecture](#-architecture) · [API Reference](#-api-reference) 

</div>

---

## Overview

Analytics BI is an end-to-end analytics and business intelligence web application. Upload CSV or Excel files, let the platform automatically infer schemas and clean your data, then build interactive charts and assemble them into dashboards — all from a single, unified interface.

The platform handles the full data lifecycle:

1. **Ingest** — Upload files with streaming parsing, structural validation, and schema inference
2. **Clean** — Quarantine invalid records with a Dead Letter Queue, review and restore them
3. **Explore** — Build queries with dimensions, measures, filters, and aggregations
4. **Visualize** — Create charts (bar, line, pie, scatter, box plot, and more) powered by ECharts
5. **Dashboard** — Arrange multiple charts into drag-and-drop dashboard layouts
6. **Export** — Download data and charts in CSV, Excel, or PDF formats

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
- **Multiple chart types** — Bar, Line, Area, Pie, Scatter, Box Plot, and more via ECharts
- **Chart customization** — Color palettes, legend toggle, grid toggle, data labels, and style options
- **Chart annotations** — Add text annotations to charts for team collaboration
- **Save & manage** — Full CRUD for named, reusable chart definitions

### Dashboards
- **Dashboard builder** — Drag-and-drop layout editor for arranging charts
- **Dashboard gallery** — Browse, favorite, tag, and manage dashboards
- **Draft/Published workflow** — Dashboards support draft and published states
- **Optimistic Concurrency Control** — Version-based conflict resolution for concurrent edits

### Data Export
- **Multiple formats** — Export datasets and charts as CSV, XLSX, or PDF
- **PDFKit integration** — Server-side PDF generation with styled formatting

### AI Assistant
- **LLM-powered insights** — AI endpoint for natural-language data analysis and query suggestions

### Developer Experience
- **Monorepo** — npm workspaces with shared packages
- **Docker-ready** — Full `docker-compose.yml` for one-command deployment
- **Graceful shutdown** — SIGINT/SIGTERM/SIGUSR2 handlers with clean worker teardown
- **Structured logging** — Color-coded, tagged logger with severity levels
- **Idempotency middleware** — Prevents duplicate request processing
- **Auto-port fallback** — Server finds an available port if the default is busy

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
│              /api/ai                                            │
│                                                                 │
│   Middleware: CORS · JSON · Idempotency · Schema Validation     │
│                                                                 │
│   Workers (BullMQ):                                             │
│   ├── background-tasks (concurrency: 5)                         │
│   └── bulk-ingestion   (concurrency: 3)                         │
│                                                                 │
│   Pipelines: Parser → Schema Inference → DTS → Query Engine    │
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
└──────────────────────┘
```

---

## Project Structure

```
analytics-bi/
├── apps/
│   ├── client/                    # React + Vite frontend
│   │   └── src/
│   │       ├── components/        # Shared UI components
│   │       ├── core/              # Config & environment
│   │       ├── modules/
│   │       │   ├── home/          # Landing page
│   │       │   ├── ingestion/     # Upload wizard with progress tracking
│   │       │   ├── datasets/      # Dataset browser & management
│   │       │   ├── data-review/   # Row preview, schema editor, quarantine manager
│   │       │   ├── charts/        # Chart builder, explorer & panel
│   │       │   ├── dashboard/     # Dashboard gallery & editor
│   │       │   ├── export/        # Export functionality
│   │       │   ├── sql-editor/    # SQL query interface
│   │       │   ├── chatbot/       # AI assistant module
│   │       │   └── builder/       # Visual builder utilities
│   │       └── services/          # API service layer (Axios)
│   │
│   └── server/                    # Node.js + Express backend
│       └── src/
│           ├── api/
│           │   ├── upload/        # File upload controller & routes
│           │   ├── query/         # Dataset query & metadata routes
│           │   ├── charts/        # Chart CRUD routes
│           │   ├── dashboard/     # Dashboard CRUD routes
│           │   ├── annotations/   # Chart annotation routes
│           │   ├── dlq/           # Dead Letter Queue management
│           │   └── ai/            # AI/LLM endpoint
│           ├── core/              # DB, Redis, Socket.IO, logging, validation
│           ├── export/            # PDF/CSV/XLSX export engine
│           ├── jobs/              # BullMQ workers, queues, retry policies, DLQ
│           ├── models/            # Mongoose schemas (Chart, Dashboard, Metadata, etc.)
│           ├── pipelines/         # Data processing: parser, schema inference, DTS, query
│           └── services/          # Business logic services
│
├── apps/shared-lib/                   # Shared utilities for MFE communication
│   └── src/                           # apiClient, authBridge, eventBus, env config
│
│   # Note: packages/shared-types/ and packages/ui-components/ are referenced in
│   # the workspace config but not yet created. Shared code lives in apps/shared-lib/.
├── docs/
│   ├── architecture.md            # Detailed architecture & data flow diagrams
│   ├── Structure.md               # Project structure notes
│   ├── SRS.pdf                    # Software Requirements Specification
│   └── Sprint 1 Presentation.pdf  # Sprint 1 presentation deck
│
├── docker-compose.yml             # Docker orchestration (MongoDB, Redis, Server, Client)
├── package.json                   # Root workspace configuration
└── .gitignore
```

---

## Quick Start

### Prerequisites

| Dependency | Version | Purpose |
|---|---|---|
| **Node.js** | 18+ | Runtime |
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

This installs all workspace dependencies (`apps/client`, `apps/server`, and `packages/*`).

### 3. Configure environment

Create `apps/server/.env`:

```env
# Database
MONGO_URI=mongodb://localhost:27017/analytics-bi

# Server
PORT=5000

# Redis (defaults to localhost:6379 if omitted)
REDIS_HOST=127.0.0.1
REDIS_PORT=6379

# CORS (defaults to * if omitted)
CORS_ORIGIN=http://localhost:5173
```

### 4. Start infrastructure services

```bash
# MongoDB
sudo systemctl start mongod

# Redis
sudo systemctl start redis
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

Spin up the entire stack with a single command:

```bash
docker-compose up -d
```

| Container | Port | Description |
|---|---|---|
| `analytics-client` | `3000` | Nginx-served React build |
| `analytics-server` | `5000` | Express API + workers |
| `analytics-mongo` | — | MongoDB 6 (internal network) |
| `analytics-redis` | — | Redis 7 (internal network) |

---

## Role-Based Access Control (RBAC)

Analytics BI implements a three-tier role-based access control system for multi-user collaboration.

### Roles

| Role | Level | Capabilities |
|------|-------|--------------|
| **Admin** | 2 | Full access to all dashboards, charts, and system operations |
| **Editor** | 1 | Can create, edit, and publish dashboards/charts |
| **Viewer** | 0 | Read-only access to published dashboards and charts |

### Permission Matrix

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| View published dashboards | ✅ | ✅ | ✅ |
| View own draft dashboards | ✅ | ✅ | ❌ |
| Create dashboards/charts | ✅ | ✅ | ❌ |
| Edit dashboards | ✅ | ✅ | ❌ |
| Delete dashboards | ✅ | ✅ | ❌ |
| Publish/Unpublish | ✅ | ✅ | ❌ |

### Implementation

- **Backend**: `requireAuth` + `canMutate` middleware enforces role checks on all write endpoints
- **Frontend**: `canEditDashboard()`, `canDeleteDashboard()`, etc. conditionally show/disable UI actions
- **Ownership**: Dashboard owner always has edit/delete rights (editor role or above)

See [SECURITY_AND_RBAC_GUIDE.md](docs/SECURITY_AND_RBAC_GUIDE.md) for detailed documentation.

---

## Draft vs Live Dashboards

Dashboards support a draft/published workflow to keep unpublished changes private.

### States

```
CREATE → DRAFT (private, owner-only)
  ↓
PUBLISH → LIVE (visible to all authorized users)
  ↓
UNPUBLISH → DRAFT (hidden again)
```

### Key Features

- **Draft Dashboards**: Work-in-progress, visible only to creator
- **Live Dashboards**: Published, visible per role permissions
- **Separate Storage**: Draft changes don't affect published version until published
- **Version Control**: Optimistic concurrency control prevents conflicting edits

### UI Indicators

- **DRAFT badge** (Orange): Unpublished, owner-only
- **LIVE badge** (Green): Published, visible to all
- **Publish button**: Available for draft dashboards
- **Unpublish button**: Available for published dashboards

### API Endpoints

```bash
POST /api/dashboards/:id/publish      # Publish draft
POST /api/dashboards/:id/unpublish    # Revert to draft
POST /api/dashboards/:id/save-draft   # Save draft changes
GET /api/dashboards/:id/draft         # Get draft state
```

---

## Security Practices

### Security Headers

All API responses include security headers to prevent common vulnerabilities:

- **Content-Security-Policy**: Blocks inline scripts/styles; prevents XSS
- **X-Frame-Options**: DENY (prevents clickjacking)
- **Permissions-Policy**: Restricts browser features (camera, microphone, geolocation, etc.)
- **Strict-Transport-Security**: Enforces HTTPS with preload
- **X-Content-Type-Options**: Prevents MIME sniffing

### Input Validation & Sanitization

- **HTML Sanitization**: All string inputs sanitized recursively to remove script tags
- **SQL/NoSQL Injection Detection**: Pattern-based blocking of injection attempts
- **Rate Limiting**: 1000 requests per IP per minute

### CORS Policy

CORS is restricted to whitelisted origins (configure via `CORS_ORIGIN` environment variable):

```env
CORS_ORIGIN=http://localhost:5173,https://analytics.example.com
```

### CSRF Protection

CSRF tokens validated with constant-time comparison to prevent timing attacks.

### Authentication

Currently uses header-based identification (recommended for internal deployments only):

```
X-User-ID: user@example.com
X-User-Role: editor|viewer|admin
```

**⚠️ For Production**: Replace with JWT tokens and server-side verification.

### Running Security Scans

Use OWASP ZAP to scan for vulnerabilities:

```bash
# Quick baseline scan (5 minutes)
./scripts/run-zap-scan.sh baseline

# Full active scan (30+ minutes)
./scripts/run-zap-scan.sh active

# Both scans
./scripts/run-zap-scan.sh full
```

Scan reports are saved to `zap_reports/` with HTML and JSON formats.

See [SECURITY_AND_RBAC_GUIDE.md](docs/SECURITY_AND_RBAC_GUIDE.md) for comprehensive security documentation, testing procedures, and production deployment recommendations.

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
| `GET` | `/api/datasets/:datasetId/metadata` | Get dataset metadata, schema, and preview rows |
| `PATCH` | `/api/datasets/:datasetId/schema/:columnName` | Update column type or role |
| `DELETE` | `/api/datasets/:datasetId` | Delete dataset and associated records |
| `POST` | `/api/datasets/:datasetId/quarantine/:rowIndex/validate` | Validate a quarantined row |
| `POST` | `/api/datasets/:datasetId/quarantine/:rowIndex/restore` | Restore a quarantined row |
| `POST` | `/api/datasets/:datasetId/quarantine/restore-all` | Restore all quarantined rows |
| `DELETE` | `/api/datasets/:datasetId/quarantine/:rowIndex` | Delete a quarantined row |
| `DELETE` | `/api/datasets/:datasetId/quarantine` | Delete all quarantined rows |

### Charts

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/charts` | List saved charts |
| `POST` | `/api/charts` | Create a new chart |
| `GET` | `/api/charts/:chartId` | Get chart by ID |
| `PUT` | `/api/charts/:chartId` | Update a chart |
| `DELETE` | `/api/charts/:chartId` | Delete a chart |

### Dashboards

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/dashboards` | List all dashboards |
| `POST` | `/api/dashboards` | Create a new dashboard |
| `GET` | `/api/dashboards/:id` | Get dashboard by ID |
| `PUT` | `/api/dashboards/:id` | Update dashboard |
| `DELETE` | `/api/dashboards/:id` | Delete a dashboard |

### Annotations

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/annotations?chartId=` | List annotations for a chart |
| `POST` | `/api/annotations` | Create an annotation |
| `PUT` | `/api/annotations/:id` | Update an annotation |
| `DELETE` | `/api/annotations/:id` | Delete an annotation |

<!-- ### Export

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/export/:datasetId` | Export dataset (query params: `format=csv\|xlsx\|pdf`) | -->


---

## Data Flow

```
User selects file + mode
        │
        ▼
POST /api/upload (multipart)
        │
        ├─ Validate request (file, mode, extension, size ≤ 15MB)
        ├─ Store file in GridFS
        ├─ Emit Socket.IO progress: received → stored
        │
        ▼
Streaming Parse + Structural Validation
        │
        ├─ CSV/Excel row iterator
        ├─ Worker thread batches (500 rows/batch)
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
| `rawrecords` | Raw ingested rows (model exists) |
| `charts` | Saved chart definitions |
| `dashboards` | Dashboard layouts and chart references |
| `annotations` | Chart text annotations |
| `idempotencies` | Request deduplication records |
| `exportlogs` | Export operation audit trail |

---

## Tech Stack

### Frontend
| Technology | Purpose |
|---|---|
| React 19 | UI framework |
| Vite 7 | Build tool & dev server |
| ECharts 6 | Charting & visualization |
| Axios | HTTP client |
| Socket.IO Client | Real-time progress updates |
| Lucide React | Icon library |
| html2canvas | Client-side screenshot capture |

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
| AJV | JSON Schema validation |
| Lodash | Utilities |
| date-fns | Date utilities |

### Infrastructure
| Technology | Purpose |
|---|---|
| MongoDB 6 | Primary database + GridFS file storage |
| Redis 7 | Job queues & worker coordination |
| Docker Compose | Container orchestration |
| Nodemon | Development auto-reload |

---

## Available Scripts

### Root

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start client + server concurrently |
| `dev:client` | `npm run dev:client` | Start Vite dev server only |
| `dev:server` | `npm run dev:server` | Start Express server with nodemon |
| `install:all` | `npm run install:all` | Install all workspace dependencies |

### Client (`apps/client`)

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start Vite dev server |
| `build` | `npm run build` | Production build |
| `preview` | `npm run preview` | Preview production build |
| `lint` | `npm run lint` | Run ESLint |

### Server (`apps/server`)

| Script | Command | Description |
|---|---|---|
| `dev` | `npm run dev` | Start with nodemon |
| `start` | `npm start` | Start with node |


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

4. **Commit messages**: Use clear, descriptive commit messages:
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

## License

None

---