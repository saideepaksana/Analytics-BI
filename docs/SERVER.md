# Analytics BI Server (Backend)

This document is the canonical technical reference for the Analytics BI backend. It consolidates all server-side documentation that previously lived under apps/server and expands it with implementation-level details for new engineers.

## Scope and Responsibilities

The server is responsible for:
- ingesting CSV/XLS/XLSX files into MongoDB using a multi-stage pipeline
- serving dataset metadata, query execution, and schema updates
- managing charts and dashboards with draft/published workflows
- running background jobs with BullMQ (ingestion, exports, scheduled exports)
- generating exports (raw data, visual dashboards) and managing export history
- issuing embed tokens and serving embed-safe dashboard data
- enforcing security headers, RBAC, rate limits, input sanitization, and CSRF

## Runtime Architecture

- HTTP API: Express 5
- Realtime: Socket.IO for upload progress and embed updates
- Database: MongoDB with GridFS for file storage
- Queue system: BullMQ backed by Redis
- Background workers: separate worker pool in-process, started only when Redis is reachable

### Entry Point and Lifecycle

The entry point is apps/server/src/index.js:
- loads environment from .env
- connects to MongoDB
- probes Redis and starts workers only if Redis is reachable
- initializes GridFS storage and database indexes on MongoDB connection
- configures middleware and routes
- starts the server with automatic port fallback
- handles graceful shutdown and worker cleanup

Automatic port fallback:
- uses PORT (default 5000)
- tries next ports up to PORT_SEARCH_LIMIT (default 20)

Graceful shutdown:
- closes BullMQ workers (if started)
- closes MongoDB connection
- stops the HTTP server

## Request Pipeline (Middleware Order)

Requests flow through middleware in this order:
1. securityHeaders (helmet CSP, HSTS, X-Frame-Options, etc.)
2. permissionsPolicy header
3. CORS allowlist (CORS_ORIGIN + EMBED_ALLOWED_ORIGINS)
4. JSON body parsing (limit 10mb)
5. sanitizeInput (deep HTML sanitization)
6. rateLimitMiddleware (in-memory sliding window)
7. sqlInjectionProtection (SQL and NoSQL operator checks)
8. authMiddleware (header-based identity)
9. requestLoggingMiddleware (correlation ID, timing)
10. idempotencyMiddleware (Redis + Mongo response caching)
11. csrfProtect for /api routes in production (POST/PUT/PATCH/DELETE only)

## Authentication and RBAC

Authentication is header-based for development and internal use:
- X-User-ID: user identity (email or ID)
- X-User-Role: viewer | editor | admin

RBAC enforcement:
- requireAuth blocks unauthenticated requests for protected routes
- canMutate requires role editor or admin
- isOwnerOrEditor allows admin or editor to edit/delete resources

Draft dashboards are hidden from non-owners. If a draft is accessed by a user without ownership, the API responds with 404 to avoid resource enumeration.

## API Surface (Summary)

Base path: /api

### Upload and Ingestion
- POST /api/upload
- GET /api/upload/active-jobs

### Datasets
- GET /api/datasets
- GET /api/datasets/:datasetId/metadata
- GET /api/datasets/:datasetId/schema
- GET /api/datasets/:datasetId/schema/compact
- POST /api/datasets/:datasetId/query
- POST /api/datasets/:datasetId/query/preview-stage
- POST /api/datasets/:datasetId/validate-payload
- POST /api/datasets/:datasetId/relationships
- DELETE /api/datasets/:datasetId/relationships
- PATCH /api/datasets/:datasetId/schema/:columnName
- DELETE /api/datasets/:datasetId/quarantine/:rowIndex
- DELETE /api/datasets/:datasetId/quarantine
- POST /api/datasets/:datasetId/quarantine/restore-all
- POST /api/datasets/:datasetId/quarantine/:rowIndex/validate
- POST /api/datasets/:datasetId/quarantine/:rowIndex/restore
- DELETE /api/datasets/:datasetId

### Charts
- GET /api/charts
- GET /api/charts/:id
- POST /api/charts
- DELETE /api/charts/:id

### Dashboards
Routes are mounted at both /api/dashboard and /api/dashboards.
- GET /api/dashboards
- GET /api/dashboards/:dashboardId
- GET /api/dashboards/:dashboardId/full
- GET /api/dashboards/:dashboardId/draft
- POST /api/dashboards
- POST /api/dashboards/:dashboardId/refresh
- POST /api/dashboards/:dashboardId/publish
- POST /api/dashboards/:dashboardId/unpublish
- POST /api/dashboards/:dashboardId/save-draft
- PATCH /api/dashboards/:dashboardId
- PATCH /api/dashboards/:dashboardId/layout
- PATCH /api/dashboards/:dashboardId/metadata
- DELETE /api/dashboards/:dashboardId

### Annotations
- GET /api/annotations/chart/:chartId
- GET /api/annotations/dashboard/:dashboardId
- POST /api/annotations
- PUT /api/annotations/:id
- DELETE /api/annotations/:id

### Exports and Embeds
- POST /api/export/raw
- POST /api/export/visual
- GET /api/export/status/:jobId
- GET /api/export/download/:filename
- GET /api/export/:datasetId/log
- GET /api/export/dashboards/:dashboardId/log
- POST /api/export/embed/token
- GET /api/export/embed/:dashboardId
- POST /api/export/schedules
- GET /api/export/schedules
- DELETE /api/export/schedules/:scheduleId

### AI
- POST /api/ai/parse-text (placeholder implementation)

### Jobs (dev/test)
- POST /api/jobs/test-job
- POST /api/jobs/test-permanent-fail
- GET /api/jobs/stats
- POST /api/jobs/retry/:jobId

### CSRF Token
- GET /api/csrf-token (auth required)

### Health
- GET /

### DLQ Routes (Defined, Not Mounted)
The DLQ router exists in code but is not mounted in index.js, so it is inactive unless explicitly wired:
- /api/dlq/* (patterns, statistics, errors, bulk-fix, etc.)

## Data Model Summary

MongoDB collections:
- Metadata: datasetId, schema, rowCount, quarantine counts, relationships, inference status
- CleanRecord: validated data rows (data payload + searchable copy)
- DLQRecord: quarantined rows with error details and suggested fixes
- Chart: chart definition for query + visualization configuration
- Dashboard: draft/published state, layout, tabs, filters, and raw frontend snapshot
- ExportLog: audit trail for exports (status, filename, recordCount)
- ScheduledExport: recurring export configuration and cron metadata
- Annotation: chart and dashboard annotations
- Idempotency: cached responses by idempotency key

GridFS:
- uploads.files and uploads.chunks store uploaded files for parsing

## Ingestion Pipeline

Upload flow:
1. Client sends multipart POST /api/upload with mode and uploadId.
2. API validates file, extension, and size.
3. File is stored in GridFS.
4. Stream parser reads the file and emits row batches.
5. Structural validation checks row shape and column count.
6. Schema inference detects types, roles, and relationships.
7. DTS pipeline cleans and normalizes values.
8. Valid rows go to CleanRecord, invalid rows to DLQRecord.
9. Metadata is updated with schema, row counts, and relationships.
10. Socket.IO emits progress events to upload:<uploadId>.

Upload constraints:
- max file size: 2GB
- allowed extensions: .csv, .xls, .xlsx
- new datasetId defaults to the GridFS file id
- upload jobs are queued as process-upload on the background-tasks queue

Parser tuning:
- PARSER_BATCH_SIZE controls batch size (default 5000)
- PARSER_WORKERS controls worker count (default min(cpu, 2))

## Query Pipeline

Dataset queries run against CleanRecord using aggregation helpers:
- /api/datasets/:datasetId/query builds a MongoDB aggregation pipeline
- group-by logic is assembled by groupStageBuilder
- date truncation helpers apply time bucketing for time-series charts

Chart definitions stored in Chart.query drive dimensions, measures, filters, and orderBy.

## Dashboard Workflow

Dashboards are stored on the server and have a draft and published state:
- status: draft | published
- draftState holds work-in-progress (private)
- published layout and tabs are visible to other users
- _rawFrontendState stores a lossless snapshot of the UI payload

Autosave uses optimistic concurrency control:
- PATCH /api/dashboards/:id requires the current version (__v)
- 409 conflict is returned when versions mismatch

## Export System

Pipelines:
- Raw exports: queued jobs that export dataset queries as CSV/XLSX
- Visual exports: queued jobs that render dashboards as PDF/PNG via Puppeteer
- Scheduled exports: cron-driven jobs that run visual exports and optionally email them

Export artifacts:
- stored under /tmp/analytics-bi/exports/raw and /tmp/analytics-bi/exports/visual
- cleaned every 15 minutes; files older than 1 hour are deleted

Export history:
- ExportLog stores jobId, status, filename, recordCount, and timestamps
- GET /api/export/status/:jobId falls back to ExportLog when BullMQ job data is gone

Scheduled exports:
- schedules are stored in ScheduledExport
- repeatJobKey is persisted for safe removal
- email delivery uses SMTP if EMAIL_ENABLED=true

## Embed System

Embed token flow:
- POST /api/export/embed/token generates a JWT token for a published dashboard
- allowedOrigins are embedded in the token payload
- GET /api/export/embed/:dashboardId returns the dashboard payload

Token validation and access checks:
- embedTokenAuth accepts Authorization: Bearer <token>, token query param, or x-embed-token
- tokens must be scoped to view and match the dashboardId
- embedCors enforces allowed origins and sets frame-ancestors CSP
- embedRateLimiter applies per-token rate limits

## Background Jobs and Queues

Queues:
- background-tasks
- bulk-ingestion
- raw-export
- dashboard-export
- scheduled-export

Concurrency profiles:
- WORKER_CONCURRENCY_PROFILE controls LOW, MEDIUM, HIGH presets
- a global semaphore caps total concurrent jobs per process

Workers are started only if Redis is reachable at startup. If Redis is unavailable, background processing is unavailable until Redis becomes reachable.

## Configuration Reference

Core environment variables:
- NODE_ENV: development | production
- PORT: API port (default 5000)
- PORT_SEARCH_LIMIT: max fallback attempts (default 20)
- MONGO_URI: MongoDB connection string
- REDIS_HOST: Redis host
- REDIS_PORT: Redis port
- CORS_ORIGIN: comma-separated CORS allowlist for the main app
- EMBED_ALLOWED_ORIGINS: comma-separated allowlist for embeds
- CLIENT_URL: used to build embed URLs

Embed and security:
- EMBED_TOKEN_SECRET: JWT signing secret for embeds
- JWT_SECRET: fallback secret if EMBED_TOKEN_SECRET is not set
- EMBED_TOKEN_EXPIRATION_HOURS: default token TTL (default 24, max 720)
- EMBED_RATE_LIMIT_WINDOW_SEC: embed rate window (default 3600)
- EMBED_RATE_LIMIT_MAX: embed rate limit max requests (default 1000)

Email and scheduled exports:
- EMAIL_ENABLED: true to enable SMTP
- EMAIL_FROM: default sender
- SMTP_HOST, SMTP_PORT, SMTP_SECURE, SMTP_USER, SMTP_PASS

Ingestion and workers:
- PARSER_BATCH_SIZE: stream parser batch size
- PARSER_WORKERS: parser worker count
- WORKER_CONCURRENCY_PROFILE: LOW | MEDIUM | HIGH

Logging:
- LOG_LEVEL: debug | info | warn | error
- LOG_FORMAT: pretty | json
- LOG_SERVICE: service label
- LOG_COLOR: true | false
- NO_COLOR: disable ANSI colors
- LOG_SLOW_REQUEST_MS: slow request threshold
- LOG_IGNORE_PATHS: comma-separated paths to ignore in request logs

AI placeholders:
- LOCAL_LLM_URL: local model endpoint used by system prompts

## Local Development

From the repo root:
```bash
npm run dev:server
```

Or from the server package:
```bash
cd apps/server
npm run dev
```

Minimum environment example (apps/server/.env):
```env
MONGO_URI=mongodb://localhost:27017/analytics-bi
PORT=5000
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
CORS_ORIGIN=http://localhost:5173
```

## Operational Notes

- CSRF enforcement is active only in production for mutating methods.
- Rate limiting is in-memory and per-process; use a Redis-backed solution for multi-instance deployments.
- Visual export availability depends on Puppeteer and browser binaries; export requests return 503 when unavailable.

## Related Documentation

- [ARCHITECTURE.md](ARCHITECTURE.md) — System diagrams, data flows, and scalability
- [DOCUMENTATION.md](DOCUMENTATION.md) — Comprehensive single-file reference
- [Structure.md](Structure.md) — Repository and module layout
