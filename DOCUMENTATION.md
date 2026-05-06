# Analytics BI — Documentation

## Project Overview

Analytics BI is a full-stack data intelligence platform for ingesting, exploring, visualizing, and dashboarding structured data. Users upload CSV/Excel files, the system infers schemas and cleans data via a Dead Letter Queue pipeline, then enables interactive chart creation (ECharts) and drag-and-drop dashboard assembly. Exports are available in CSV, XLSX, PDF, and PNG formats via asynchronous BullMQ job queues.

**Stack**: React 19 + Vite 7 (frontend) · Express 5 + Mongoose 9 (backend) · MongoDB 6 + Redis 7 (infrastructure) · BullMQ 5 (job queues) · Socket.IO 4 (real-time).

---

## Features

### Data Ingestion & Preprocessing

- **Multi-format upload**: CSV, XLS, XLSX via streaming Busboy parser
- **Ingestion modes**: `new` (create dataset), `append` (add rows), `replace` (overwrite)
- **Background processing**: Large files processed via BullMQ workers with Socket.IO progress events
- **Schema inference**: Automatic column type detection (string, number, date, boolean), role assignment (dimension/measure), cardinality estimation, and nullability detection
- **Data Transform & Semantic validation (DTS)**: Values cleaned/normalized; invalid rows routed to DLQ
- **Relationship detection**: Automatic FK-like relationship inference across datasets

### Chart Visualization

- **Query builder**: Dimensions, measures, aggregations, filters, sort order, group-by
- **Chart types**: Bar, Line, Area, Pie, Scatter, Box Plot (via ECharts 6)
- **Customization**: Color palettes, legend toggle, grid toggle, data labels
- **Annotations**: Text annotations on charts for collaboration
- **Full CRUD**: Named, reusable chart definitions

### Dashboard System

- **Drag-and-drop editor**: Arrange charts into layouts with tabs
- **Gallery**: Browse, favorite, tag, and manage dashboards
- **Draft/Published workflow**: Dashboards support `draft` and `published` states
- **Optimistic Concurrency Control (OCC)**: Version-based conflict resolution
- **Embedding**: Generate embed tokens for iframe-based public dashboard sharing

### Export System

Three export pipelines:

| Pipeline | Description | Queue |
|----------|-------------|-------|
| **A — Raw Data** | Export dataset records as CSV/XLSX | `raw-export` |
| **B — Visual Dashboard** | Render dashboard as PDF/PNG via Puppeteer | `dashboard-export` |
| **C — Scheduled** | Recurring exports on cron schedules | `scheduled-export` |

All exports are asynchronous (HTTP 202 → poll status → download file).

---

## API Reference

### Upload & Ingestion (`/api/upload`)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/api/upload` | Upload CSV/Excel file (multipart/form-data) |
| `GET` | `/api/upload/active-jobs` | List active background ingestion jobs |

**POST `/api/upload`** — Form fields:
- `file` — The CSV/XLS/XLSX file (required)
- `mode` — `new` | `append` | `replace`
- `datasetId` — Required for `append`/`replace`
- `uploadId` — Client-generated UUID for Socket.IO progress tracking
- `quarantine` — `true` | `false`

**Response** (200): `{ datasetId, fileName, rowCount, quarantinedCount, schema, ... }`

---

### Datasets (`/api/datasets`)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | List all datasets |
| `POST` | `/bulk-delete` | Bulk delete datasets |
| `GET` | `/:datasetId/metadata` | Dataset metadata, schema, preview rows |
| `GET` | `/:datasetId/schema` | Full schema |
| `GET` | `/:datasetId/schema/compact` | Compact schema |
| `POST` | `/:datasetId/query` | Query dataset data with filters/aggregations |
| `POST` | `/:datasetId/query/preview-stage` | Preview aggregation group stage |
| `POST` | `/:datasetId/validate-payload` | Validate a data payload against schema |
| `POST` | `/:datasetId/relationships` | Add a relationship |
| `DELETE` | `/:datasetId/relationships` | Remove a relationship |
| `PATCH` | `/:datasetId/schema/:columnName` | Update column type or role |
| `DELETE` | `/:datasetId/quarantine/:rowIndex` | Delete a quarantined row |
| `DELETE` | `/:datasetId/quarantine` | Delete all quarantined rows |
| `POST` | `/:datasetId/quarantine/restore-all` | Restore all valid quarantined rows |
| `POST` | `/:datasetId/quarantine/:rowIndex/validate` | Validate a quarantined row |
| `POST` | `/:datasetId/quarantine/:rowIndex/restore` | Restore a quarantined row |
| `DELETE` | `/:datasetId` | Delete dataset and all associated records |

---

### Charts (`/api/charts`)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | List saved charts (filter by `?datasetId=`) |
| `GET` | `/:id` | Get chart by `chartId` or `_id` |
| `POST` | `/` | Create or update a chart (editor/admin) |
| `DELETE` | `/:id` | Delete a chart (editor/admin) |

**POST `/api/charts`** — Request body:
```json
{
  "chartId": "uuid",
  "name": "Sales by Region",
  "dataSource": { "datasetId": "ds-123" },
  "query": {
    "dimensions": [{ "field": "region", "type": "string" }],
    "measures": [{ "field": "revenue", "aggregation": "sum" }],
    "filters": [{ "field": "year", "operator": "eq", "value": 2024 }],
    "groupBy": ["region"],
    "orderBy": [{ "field": "revenue", "direction": "desc" }]
  },
  "visualization": { "type": "bar", "xAxis": "region", "yAxis": "revenue" },
  "style": { "colorPalette": ["#5470c6"], "showLegend": true }
}
```

---

### Dashboards (`/api/dashboards`)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | List all dashboards |
| `GET` | `/:dashboardId` | Get dashboard by ID |
| `GET` | `/:dashboardId/full` | Get dashboard with populated chart data |
| `GET` | `/:dashboardId/draft` | Get draft state (auth required, owner only) |
| `POST` | `/` | Create a dashboard (editor/admin) |
| `POST` | `/:dashboardId/refresh` | Refresh dashboard data (editor/admin) |
| `POST` | `/:dashboardId/publish` | Publish draft → live (editor/admin) |
| `POST` | `/:dashboardId/unpublish` | Revert to draft (editor/admin) |
| `POST` | `/:dashboardId/save-draft` | Save draft changes (editor/admin) |
| `DELETE` | `/:dashboardId` | Delete dashboard (editor/admin) |
| `PATCH` | `/:dashboardId/layout` | Update layout (editor/admin) |
| `PATCH` | `/:dashboardId/metadata` | Patch metadata fields (editor/admin) |
| `PATCH` | `/:dashboardId` | Autosave partial state with OCC (editor/admin) |

---

### Annotations (`/api/annotations`)

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/chart/:chartId` | List annotations for a chart |
| `GET` | `/dashboard/:dashboardId` | List annotations for a dashboard |
| `POST` | `/` | Create annotation |
| `PUT` | `/:id` | Update annotation |
| `DELETE` | `/:id` | Delete annotation |

**POST body**: `{ chartId?, dashboardId?, text, position: { x, y }, style? }`

---

### Export (`/api/export`)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/raw` | Start raw data export job (CSV/XLSX) |
| `POST` | `/visual` | Start visual dashboard export job (PDF/PNG) |
| `GET` | `/status/:jobId` | Poll export job status |
| `GET` | `/download/:filename` | Download completed export file |
| `GET` | `/:datasetId/log` | Get export history for a dataset |
| `GET` | `/dashboards/:dashboardId/log` | Get export history for a dashboard |
| `POST` | `/embed/token` | Generate embed token for a dashboard |
| `GET` | `/embed/:dashboardId` | Get embedded dashboard data (token auth) |
| `POST` | `/schedules` | Create a scheduled export |
| `GET` | `/schedules` | List scheduled exports |
| `DELETE` | `/schedules/:scheduleId` | Delete a scheduled export |

**POST `/api/export/raw`**: `{ datasetId, format: "csv"|"xlsx", context? }`
**POST `/api/export/visual`**: `{ dashboardId, format: "pdf"|"png", frozenState? }`
**GET `/api/export/status/:jobId`** response: `{ jobId, state, progress, result?, error? }`

---

### DLQ Management (Not Mounted)

> **Note**: The DLQ router (`apps/server/src/api/dlq/routes.js`) exists in the codebase but is **not mounted** in `index.js`. Row-level quarantine operations (validate, restore, delete) are handled via the `/api/datasets` routes above. The routes below are defined but not reachable at runtime unless explicitly wired into the Express app.

| Method | Route (defined, not mounted) | Description |
|--------|------------------------------|-------------|
| `GET` | `/:datasetId/patterns` | Aggregate errors by pattern |
| `GET` | `/:datasetId/statistics` | Error distribution statistics |
| `GET` | `/:datasetId/errors/:aggregationKey` | Get rows for a specific error pattern |
| `POST` | `/:datasetId/bulk-fix` | Apply fix to all rows matching a pattern |
| `POST` | `/:recordId/resolve` | Mark a DLQ record as resolved |
| `GET` | `/:datasetId/quarantine-dashboard` | Full quarantine dashboard view |
| `GET` | `/:recordId/detail` | View single DLQ record in detail |

---

### AI (`/api/ai`)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/parse-text` | Parse raw text to extract schema suggestions |

**Request**: `{ text?, fileUrl? }` — **Response**: `{ suggestedSchema, confidence, parsingMethod }`

> **Implementation status**: This endpoint is a **placeholder**. There is no LLM integration (no OpenAI, Anthropic, Gemini, or any API key). The current implementation (`extractBasicSchema`) splits the input text by newlines, treats the first line as comma-separated headers, and returns each header as a `{ name, type: "string", confidence: 0.5 }` column suggestion. The source code contains an inline `TODO: Integrate with LLM for enhanced parsing` comment.

---

### Jobs (Dev/Test) (`/api/jobs`)

| Method | Route | Description |
|--------|-------|-------------|
| `POST` | `/test-job` | Enqueue a test background job |
| `POST` | `/test-permanent-fail` | Enqueue a job that fails to DLQ |
| `GET` | `/stats` | Live queue stats (active, waiting, failed) |
| `POST` | `/retry/:jobId` | Retry a failed job by ID |

---

### Other

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/api/csrf-token` | Get a CSRF token (auth required) |
| `GET` | `/` | Health check (returns "Analytics BI Server is Running!!") |

---

## Data Models

### Metadata

| Field | Type | Purpose |
|-------|------|---------|
| `datasetId` | `String` (unique, indexed) | Primary dataset identifier |
| `fileName` | `String` | Original uploaded file name |
| `mode` | `String` enum: `new`, `append`, `replace` | Ingestion mode |
| `schema` | `[ColumnSchema]` | Inferred column-level metadata |
| `timeSeriesField` | `String` | Designated time-series column |
| `rowCount` | `Number` | Total clean rows |
| `quarantinedCount` | `Number` | Total quarantined rows |
| `sourceFileId` | `String` | GridFS file reference |
| `relationships` | `[RelationshipSchema]` | Inferred FK-like relationships |
| `inferenceStatus` | `String` enum: `pending`, `complete`, `failed` | Schema inference progress |
| `inferenceError` | `String` | Error from schema inference |

**ColumnSchema** (embedded): `name`, `type`, `dataType`, `role` (dimension/measure), `suggestedAggregation`, `sampleValues`, `nullCount`, `uniqueCount`, `nullable`, `constraints`.

**RelationshipSchema** (embedded): `fromCollection`, `fromColumn`, `toCollection`, `toColumn`, `confidence` (0–1), `source` (inferred/manual).

### CleanRecord

| Field | Type | Purpose |
|-------|------|---------|
| `datasetId` | `String` (indexed) | Parent dataset |
| `rowNumber` | `Number` | Row index |
| `data` | `Mixed` | The cleaned row data (dynamic keys) |
| `searchable` | `Map<Mixed>` | Indexed copy for search |
| `sourceFileName` | `String` | Origin file |
| `status` | `String` enum: `VALID`, `WARNING` | Row status |

### DLQRecord

| Field | Type | Purpose |
|-------|------|---------|
| `datasetId` | `String` (indexed) | Parent dataset |
| `rowNumber` | `Number` | Row index |
| `rawData` | `Mixed` | Original row before cleaning |
| `cleanedData` | `Mixed` | Partially cleaned data |
| `errorMessages` | `[String]` | Human-readable error messages |
| `errorDetails` | `[Object]` | Structured error info (field, errorType, value, expected/received types) |
| `errorFingerprint` | `Object` | Hash + errorType + field for grouping |
| `errorCategory` | `String` enum | `structural`, `validation`, `data_quality`, `encoding`, `delimiter`, `unknown` |
| `suggestedFix` | `Object` | Fix template with confidence and automation flag |
| `severity` | `String` enum | `low`, `medium`, `high`, `critical` |
| `status` | `String` enum | `QUARANTINED`, `AUTO_FIXED`, `MANUAL_FIX_NEEDED`, `RESOLVED`, `IGNORED` |
| `resolutionHistory` | `[Object]` | Audit trail of fix attempts |

### Chart

| Field | Type | Purpose |
|-------|------|---------|
| `chartId` | `String` (unique) | UUID identifier |
| `name` | `String` | Chart display name |
| `dataSource.datasetId` | `String` | Linked dataset |
| `query` | `Object` | Dimensions, measures, filters, groupBy, orderBy |
| `visualization` | `Object` | Chart type, xAxis, yAxis, series config |
| `style` | `Object` | colorPalette, showLegend, showGrid, showLabels |
| `createdBy` / `updatedBy` | `String` | User tracking |

### Dashboard

| Field | Type | Purpose |
|-------|------|---------|
| `title` | `String` | Dashboard name |
| `description` | `String` | Description |
| `tags` | `[String]` | Categorization tags |
| `isFavorite` | `Boolean` | User favorite flag |
| `status` | `String` enum: `draft`, `published` | Publish state |
| `version` | `Number` | OCC version counter |
| `draftState` | `Mixed` | Unpublished changes |
| `layout` | `Mixed` | Published layout configuration |
| `tabs` | `Mixed` | Tab configuration |
| `chartRefs` | `[ObjectId]` ref Chart | Associated charts |
| `filters` | `Mixed` | Dashboard-level filters |
| `createdBy` / `updatedBy` | `String` | User tracking |

### Annotation

| Field | Type | Purpose |
|-------|------|---------|
| `chartId` | `String` | Associated chart (UUID) |
| `dashboardId` | `ObjectId` ref Dashboard | Associated dashboard |
| `text` | `String` | Annotation content |
| `position` | `{ x: Number, y: Number }` | Position as percentages (0–100) |
| `authorId` | `String` | Author identifier |
| `style` | `Mixed` | Styling options |

### ExportLog

| Field | Type | Purpose |
|-------|------|---------|
| `datasetId` | `String` | Exported dataset |
| `dashboardId` | `String` | Exported dashboard |
| `jobId` | `String` (unique, sparse) | BullMQ job ID |
| `format` | `String` enum | `csv`, `xlsx`, `pdf`, `png`, `embed`, `visual` |
| `status` | `String` enum | `processing`, `completed`, `failed` |
| `exportedBy` | `String` | User who initiated |
| `recordCount` | `Number` | Rows exported |
| `filename` | `String` | Output filename on disk |
| `failureReason` | `String` | Error message if failed |

### ScheduledExport

| Field | Type | Purpose |
|-------|------|---------|
| `dashboardId` | `ObjectId` ref Dashboard | Target dashboard |
| `userId` | `String` | Owner |
| `name` | `String` | Schedule name |
| `frequency` | `String` enum | `daily`, `weekly`, `monthly`, `test` |
| `format` | `String` enum | `pdf`, `png` |
| `selectedTabs` | `[String]` | Tabs to include |
| `recipients` | `[String]` | Email recipients |
| `status` | `String` enum | `active`, `paused` |
| `repeatJobKey` | `String` | BullMQ repeatable job key |

### Idempotency

| Field | Type | Purpose |
|-------|------|---------|
| `key` | `String` (unique) | Idempotency key from request header |
| `requestPath` | `String` | Original request path |
| `requestMethod` | `String` | HTTP method |
| `responseStatus` | `Number` | Cached response status |
| `responseBody` | `Mixed` | Cached response body |
| `expiresAt` | `Date` | TTL (auto-deleted via MongoDB TTL index) |

### RawRecord

| Field | Type | Purpose |
|-------|------|---------|
| `datasetId` | `String` | Parent dataset |
| `rowNumber` | `Number` | Row index |
| `data` | `Mixed` | Raw ingested row |
| `sourceFileName` | `String` | Origin file |

---

## Queue & Background Jobs

### Queue Registry

| Queue Name | Retry Policy | Concurrency (MEDIUM) | Purpose |
|------------|-------------|----------------------|---------|
| `background-tasks` | STANDARD (3 attempts, 2s exp. backoff) | 5 | General tasks, file processing |
| `bulk-ingestion` | CONSERVATIVE (2 attempts, 5s exp. backoff) | 3 | Heavy ingestion jobs |
| `raw-export` | STANDARD | 3 (default) | CSV/XLSX data exports |
| `dashboard-export` | STANDARD | 3 (default) | PDF/PNG visual exports via Puppeteer |
| `scheduled-export` | STANDARD | 3 (default) | Recurring scheduled exports |
| `dead-letter-queue` | NONE (1 attempt) | — | Terminal storage for permanently failed jobs |

### Retry Policies

| Policy | Attempts | Backoff | Use Case |
|--------|----------|---------|----------|
| `STANDARD` | 3 | Exponential 2s → 4s → 8s | Most background tasks |
| `AGGRESSIVE` | 5 | Exponential 1s → 2s → … → 16s | Short/fast operations |
| `CONSERVATIVE` | 2 | Exponential 5s → 10s | Heavy operations |
| `NONE` | 1 | — | One-shot tasks, DLQ |

### DLQ Behavior

1. **Explicit routing**: Worker detects `PermanentError` → calls `sendToDLQ()` → job data written to `dead-letter-queue`
2. **Auto-capture**: `QueueEvents` listener on source queues detects exhausted retries → auto-forwards to DLQ
3. DLQ jobs include: original queue, job ID, payload, failure reason, stack trace, timestamps

### Concurrency Profiles

Controlled via `WORKER_CONCURRENCY_PROFILE` env var (`LOW`, `MEDIUM`, `HIGH`). A global semaphore enforces a cross-queue cap (default MEDIUM: 15 concurrent jobs).

### Worker Lifecycle

- Workers initialized at server startup (after Redis connectivity check)
- Export file cleanup runs every 15 minutes (deletes files older than 1 hour from `$TMPDIR/analytics-bi/exports/`)
- Graceful shutdown via `SIGINT`/`SIGTERM`/`SIGUSR2` with clean worker teardown

---

## Frontend Architecture

### Routing

| Route | Component | Description |
|-------|-----------|-------------|
| `/` | `PublicLandingPage` / redirect | Landing or redirect to `/app/home` |
| `/auth/login` | `LoginPage` | Authentication |
| `/auth/signup` | `SignUpPage` | Registration |
| `/app/home` | `HomePage` | Dashboard overview |
| `/app/ingestion` | `IngestionWizard` | File upload wizard |
| `/app/review` | `DataReviewPage` | Data review with schema editor |
| `/app/datasets` | `DatasetsPage` | Dataset browser |
| `/app/charts` | `ChartsPage` | Chart builder and explorer |
| `/app/dashboards` | `DashboardPage` | Dashboard gallery and editor |
| `/app/settings` | `SettingsPage` | User preferences |
| `/embed/:dashboardId` | `EmbedDashboard` | Public embedded dashboard |

### Module Structure

```
modules/
├── auth/          # Login, signup pages
├── home/          # Landing page, public landing
├── ingestion/     # Upload wizard with progress tracking
├── datasets/      # Dataset browser & management
├── data-review/   # Row preview, schema editor, quarantine manager
├── charts/        # Chart builder, explorer & panel
├── dashboard/     # Dashboard gallery, editor, embed view
├── export/        # Export UI components
├── settings/      # User preferences
├── chatbot/       # AI assistant module
├── builder/       # Visual builder utilities
└── sql-editor/    # SQL query interface
```

### Service Layer (`services/`)

| File | Purpose |
|------|---------|
| `upload.service.js` | File upload API calls |
| `datasets.service.js` | Dataset CRUD and query API |
| `charts.service.js` | Chart CRUD API |
| `dashboard.service.js` | Dashboard CRUD, publish, draft API |
| `annotations.service.js` | Annotation CRUD API |
| `export.service.js` | Export job submission, status polling, download |

### Real-time Socket.IO Usage

- **Connection**: Client connects to `VITE_SOCKET_URL` (default `http://localhost:5000`)
- **Room-based subscriptions**: `upload:subscribe` / `upload:unsubscribe` with `uploadId`
- **Events consumed**:
  - `background-tasks:update` — Progress updates (stage, percentage) for active uploads
  - `background-tasks:completed` — Completion notification (triggers popup)
- **Export mode**: Socket.IO disabled in export rendering mode (`?export=true`)

### Microfrontend Structure

The project implements a Module Federation–based microfrontend architecture using `@originjs/vite-plugin-federation`. All MFE apps exist under `apps/` with real code, Vite configs, `remote-entry.js` files, and page components:

| App | Port | Directory | Key Components |
|-----|------|-----------|----------------|
| `host` | 5173 | `apps/host/` | `App.jsx`, `Layout.jsx`, `MFELoader.jsx`, `ErrorBoundary.jsx` |
| `mfe-auth` | 5001 | `apps/mfe-auth/` | `LoginPage.jsx`, `SignUpPage.jsx` |
| `mfe-analytics` | 5002 | `apps/mfe-analytics/` | `ChartsPage.jsx`, `DashboardPage.jsx` |
| `mfe-data-mgmt` | 5003 | `apps/mfe-data-mgmt/` | `IngestionPage.jsx`, `DatasetsPage.jsx`, `DataReviewPage.jsx` |
| `mfe-tools` | 5004 | `apps/mfe-tools/` | `BuilderPage.jsx`, `SettingsPage.jsx`, `SqlEditorPage.jsx` |
| `shared-lib` | — | `apps/shared-lib/` | `apiClient.js`, `authBridge.js`, `eventBus.js`, `env.js` |

The host app's `vite.config.js` configures federation with remote entry points for each MFE. Shared dependencies (`react`, `react-dom`, `react-router-dom`) are declared as singletons.

The monolithic client (`apps/client/`) also exposes a `remote-entry.js` for federation, exporting `App`, `IngestionWizard`, `DatasetsPage`, `DataReviewPage`, and services — enabling it to operate both standalone and as a federated remote.

To run the full MFE stack: `npm run dev:mfe` (starts host + all 4 remotes concurrently).

---

## Configuration

### Backend Environment Variables (`apps/server/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `MONGO_URI` | `mongodb://127.0.0.1:27017/analytics-bi` | MongoDB connection string |
| `PORT` | `5000` | Server listening port |
| `PORT_SEARCH_LIMIT` | `20` | Max ports to try if default is busy |
| `REDIS_HOST` | `127.0.0.1` | Redis host |
| `REDIS_PORT` | `6379` | Redis port |
| `CORS_ORIGIN` | `http://localhost:5173` | Comma-separated allowed origins |
| `NODE_ENV` | `development` | Environment (`development`/`production`) |
| `WORKER_CONCURRENCY_PROFILE` | `MEDIUM` | Worker concurrency: `LOW`/`MEDIUM`/`HIGH` |
| `CLIENT_URL` | `http://localhost:5173` | Frontend URL (for embed links) |
| `EMBED_ALLOWED_ORIGINS` | `` | Comma-separated embed iframe origins |
| `EMAIL_ENABLED` | `false` | Enable email notifications |
| `SMTP_HOST` | — | SMTP server host |
| `SMTP_PORT` | `587` | SMTP port |
| `SMTP_SECURE` | `false` | Use TLS |
| `SMTP_USER` | — | SMTP username |
| `SMTP_PASS` | — | SMTP password |
| `EMAIL_FROM` | `Analytics BI <noreply@analytics-bi.com>` | Sender address |
| `LOG_LEVEL` | `debug` (dev) / `info` (prod) | Logging verbosity. Values: `trace`, `debug`, `info`, `success`, `warn`, `error`, `fatal` |

### Frontend Environment Variables (`apps/client/.env`)

| Variable | Default | Description |
|----------|---------|-------------|
| `VITE_API_BASE_URL` | `http://localhost:5000/api` | Backend API base URL |
| `VITE_SOCKET_URL` | `http://localhost:5000` | Socket.IO server URL |

---

## Authentication

### Mechanism

Authentication is **header-based** (no JWT, no sessions, no cookies). The `authMiddleware` in `apps/server/src/middleware/auth.js` extracts user identity from two HTTP headers on every request:

| Header | Required | Description |
|--------|----------|-------------|
| `X-User-ID` | Yes (for auth) | User identifier (treated as email) |
| `X-User-Role` | Yes (for auth) | One of: `admin`, `editor`, `viewer` |

If both headers are present, `req.user` is populated as:
```json
{ "id": "<X-User-ID>", "role": "<X-User-Role>", "email": "<X-User-ID>" }
```
If either header is missing, `req.user` is set to `null` (unauthenticated).

> **⚠️ Production Warning**: This approach trusts the client to self-report identity. It is suitable for internal deployments only. For production, replace with JWT tokens and server-side verification.

### RBAC Middleware

Role enforcement is handled by `apps/server/src/middleware/rbac.js`:

| Middleware | Effect |
|------------|--------|
| `requireAuth` | Blocks request with 401 if `req.user` is null |
| `canMutate` | Requires `editor` role or above (shorthand for `requireMinRole('editor')`) |
| `adminOnly` | Requires `admin` role |
| `requireRole(roles)` | Only passes if user's role is in the allowlist |
| `requireMinRole(minRole)` | Only passes if user's role level ≥ the specified minimum |

### Role Hierarchy

| Role | Level | Capabilities |
|------|-------|-------------|
| `admin` | 2 | Full access to all resources and operations |
| `editor` | 1 | Create, edit, publish, delete dashboards/charts |
| `viewer` | 0 | Read-only access to published dashboards and charts |

### Endpoint Protection Summary

| Endpoint Category | Auth Requirement |
|-------------------|-----------------|
| `GET` (list/read) endpoints | Generally open (no `requireAuth`) |
| Chart create/delete | `requireAuth` + `canMutate` (editor+) |
| Dashboard create/delete/publish | `requireAuth` + `canMutate` (editor+) |
| Dashboard draft access | `requireAuth` (ownership enforced in controller) |
| CSRF token | `requireAuth` |
| Export embed token | `requireAuth` + ownership/editor check in controller |

### CSRF Protection

- A CSRF token endpoint (`GET /api/csrf-token`) generates a token tied to the user's ID
- CSRF validation is **only enforced in production** (`NODE_ENV=production`)
- Mutating methods (`POST`, `PUT`, `PATCH`, `DELETE`) require a valid `X-CSRF-Token` header
- Validation uses constant-time comparison to prevent timing attacks

---

## Glossary

| Term | Definition |
|------|------------|
| **BullMQ** | Redis-backed job queue library for Node.js. Used for background processing of file ingestion, exports, and scheduled tasks. |
| **DLQ (Dead Letter Queue)** | A holding area for records or jobs that have permanently failed processing. In Analytics BI, this refers to both data-level quarantine (`DLQRecord` model) and job-level failure capture (`dead-letter-queue` BullMQ queue). |
| **GridFS** | MongoDB's specification for storing large files (>16MB) by splitting them into chunks. Used to store uploaded CSV/Excel files. |
| **ECharts** | Apache ECharts — a JavaScript charting library used to render all chart visualizations in the frontend. |
| **OCC (Optimistic Concurrency Control)** | A conflict resolution strategy where the `version` field is checked before writes; if another user modified the record, the update is rejected. |
| **DTS (Data Transform & Semantic validation)** | The pipeline stage that cleans, normalizes, and semantically validates parsed rows before writing to `CleanRecord`. |
| **Schema Inference** | Automatic detection of column types, roles, cardinality, and constraints from sample data during ingestion. |
| **Idempotency** | Middleware that prevents duplicate request processing by caching responses keyed by the `X-Idempotency-Key` header. |
| **Module Federation** | A Webpack/Vite plugin enabling microfrontend architecture where independently deployed apps share components at runtime. |
| **Socket.IO** | A library enabling real-time, bidirectional communication between client and server over WebSockets. |
| **Puppeteer** | A headless Chrome/Chromium browser automation library used server-side to render dashboards as PDF/PNG for visual exports. |
| **PDFKit** | A Node.js library for generating PDF documents programmatically. Used for tabular data PDF exports. |
| **RBAC** | Role-Based Access Control — the three-tier permission system (Admin, Editor, Viewer). |
| **CSRF** | Cross-Site Request Forgery — mitigated via token validation on mutating requests in production. |
