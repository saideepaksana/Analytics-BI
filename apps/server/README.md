# Analytics BI — Server

The backend API for the Analytics BI platform, built with **Express 5** and **MongoDB (Mongoose 9)**.

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| Express | 5 | HTTP framework |
| Mongoose | 9 | MongoDB ODM |
| Socket.IO | 4 | Real-time progress events to the client |
| BullMQ | 5 | Reliable background job queue |
| IORedis | 5 | Redis client (used by BullMQ & idempotency) |
| Busboy | 1.6 | Streaming multipart file parsing |
| fast-csv | 5 | CSV stream parsing |
| ExcelJS | 4 | XLSX read/write |
| AJV | 8 | JSON Schema row validation |
| PDFKit | 0.18 | PDF export generation |
| json2csv | 6 | CSV export generation |
| date-fns | 4 | Date formatting & truncation |
| lodash | 4 | Utility functions |
| dotenv | 17 | Environment variable loading |

---

## Project Structure

```
src/
├── index.js                              # App entry point, Express + Socket.IO setup, graceful shutdown
│
├── core/                                 # Core infrastructure
│   ├── db.js                             # MongoDB connection (with in-memory fallback)
│   ├── dbIndexes.js                      # Collection index initialization
│   ├── redis.js                          # Redis singleton connection & config
│   ├── storage.js                        # GridFS bucket (file uploads)
│   ├── socket.js                         # Socket.IO singleton accessor
│   ├── logger.js                         # ANSI-colored structured logger
│   ├── SchemaValidator.js                # AJV-based row validator
│   ├── schemaValidation.js               # Schema validation utilities
│   ├── schemaFormatter.js                # Schema formatting helpers
│   ├── typeConstants.js                  # Shared type enums & constants
│   ├── systemPrompts.js                  # LLM system prompts for AI features
│   ├── server.js                         # Server config helpers
│   └── middleware/
│       └── idempotencyMiddleware.js       # Global request deduplication
│
├── models/                               # Mongoose schemas
│   ├── Metadata.js                       # Dataset metadata + inferred column schema
│   ├── CleanRecord.js                    # Validated, clean data rows
│   ├── RawRecord.js                      # Original raw uploaded rows
│   ├── DLQRecord.js                      # Dead-letter queue (quarantined rows)
│   ├── Chart.js                          # Saved chart definitions
│   ├── Dashboard.js                      # Dashboard layout + state
│   ├── Annotation.js                     # Chart/dashboard annotations
│   ├── Idempotency.js                    # Idempotency key tracking
│   └── exportLog.js                      # Export audit log
│
├── api/                                  # REST route handlers
│   ├── upload/                           # File upload endpoints
│   │   ├── upload.routes.js
│   │   └── upload.controller.js
│   ├── query/                            # Dataset CRUD & query engine
│   │   ├── datasets.routes.js
│   │   ├── datasets.controller.js
│   │   └── groupStageBuilder.js          # MongoDB $group stage builder
│   ├── charts/                           # Chart CRUD
│   │   ├── charts.routes.js
│   │   ├── charts.controller.js
│   │   ├── chartMapper.js                # Chart config → ECharts option mapper
│   │   └── chartValidator.js             # Chart payload validation
│   ├── dashboard/                        # Dashboard CRUD & layout
│   │   ├── dashboard.routes.js
│   │   ├── dashboard.controller.js
│   │   ├── dashboardMapper.js            # Dashboard response mapper
│   │   ├── dashboardService.js           # Dashboard business logic
│   │   └── dashboardState.schema.js      # AJV schema for autosave
│   ├── annotations/                      # Chart & dashboard annotations
│   │   ├── annotations.routes.js
│   │   └── annotations.controller.js
│   ├── ai/                               # AI / LLM assistant
│   │   ├── ai.routes.js
│   │   └── ai.controller.js
│   └── dlq/                              # Dead-letter queue management
│       └── routes.js
│
├── pipelines/                            # Data processing pipelines
│   ├── parser/                           # File parsing stage
│   │   ├── streamParser.js               # Streaming CSV/XLSX → row events
│   │   ├── filePeeker.js                 # Peek at file header for type detection
│   │   ├── structuralWorker.js           # Structural validation pass
│   │   └── validationWorker.js           # Row-level schema validation
│   ├── dts/                              # Data Transform & Store
│   │   ├── index.js                      # Main DTS orchestrator
│   │   ├── cleaner.js                    # Data cleansing rules
│   │   ├── normalizer.js                 # Type normalization
│   │   └── rowTransformer.js             # Row-level transformations
│   ├── schema-inference/                 # Automatic schema detection
│   │   ├── inferSchema.js                # Schema inference engine
│   │   ├── classifyColumns.js            # Dimension vs. measure classification
│   │   ├── relationshipMapper.js         # FK / relationship inference
│   │   └── updateMetadata.js             # Persist inferred schema to Metadata
│   └── query/
│       └── dateTruncation.js             # Date truncation helpers for aggregation
│
├── jobs/                                 # Background job system (BullMQ)
│   ├── queue.js                          # Queue creation & job submission
│   ├── worker.js                         # Worker process & handler dispatch
│   ├── orchestrator.js                   # Queue stats, retry, cleanup
│   ├── retryPolicy.js                    # Exponential backoff & retry config
│   ├── uploadProcessor.js                # Upload pipeline job processor
│   └── dlq.js                            # Dead-letter queue routing
│
├── services/                             # Business-logic services
│   ├── dlqService.js                     # DLQ pattern analysis, bulk fix, statistics
│   └── llm/
│       └── scheduledExport.js            # Scheduled export service
│
├── export/                               # Data export module
│   ├── exportRoutes.js                   # Export endpoints
│   └── exportController.js              # CSV, XLSX, PDF export logic
│
├── middleware/                           # Route-level middleware
│   └── idempotency.js                    # Per-route idempotency guard
│
└── scripts/                              # Maintenance & test scripts (run manually)
    ├── initIndexes.js                    # One-off index creation
    ├── cleanup-duplicates.js             # Remove duplicate records
    ├── migrateDlq.js                     # DLQ migration helper
    ├── stress-test.js                    # Load testing
    ├── test_charts.js                    # Chart API smoke tests
    └── test_dashboards_annotations.js    # Dashboard + annotation tests
```

---

## API Reference

### Upload — `/api/upload`

| Method | Path | Description |
|---|---|---|
| `POST` | `/` | Upload a CSV/XLSX file (multipart). Idempotency-protected. |
| `GET` | `/active-jobs` | List currently running background upload jobs |

### Datasets — `/api/datasets`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List all datasets |
| `GET` | `/:datasetId/metadata` | Get dataset metadata |
| `GET` | `/:datasetId/schema` | Get full column schema |
| `GET` | `/:datasetId/schema/compact` | Get compact schema (names + types only) |
| `POST` | `/:datasetId/query` | Query dataset data (aggregation, filters, sort) |
| `POST` | `/:datasetId/query/preview-stage` | Preview a `$group` aggregation stage |
| `POST` | `/:datasetId/validate-payload` | Validate a row payload against the schema |
| `POST` | `/:datasetId/relationships` | Add a relationship between datasets |
| `DELETE` | `/:datasetId/relationships` | Remove a relationship |
| `PATCH` | `/:datasetId/schema/:columnName` | Update a single schema column |
| `DELETE` | `/:datasetId/quarantine/:rowIndex` | Delete a quarantined row |
| `DELETE` | `/:datasetId/quarantine` | Delete all quarantined rows |
| `POST` | `/:datasetId/quarantine/restore-all` | Restore all valid quarantined rows |
| `POST` | `/:datasetId/quarantine/:rowIndex/validate` | Re-validate a quarantined row |
| `POST` | `/:datasetId/quarantine/:rowIndex/restore` | Restore a single quarantined row |
| `DELETE` | `/:datasetId` | Delete a dataset and all associated data |

### Charts — `/api/charts`

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List all charts (filter by `?datasetId=`) |
| `GET` | `/:id` | Get chart by ID |
| `POST` | `/` | Create or update a chart |
| `DELETE` | `/:id` | Delete a chart |

### Dashboards — `/api/dashboard` (also `/api/dashboards`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | List all dashboards |
| `POST` | `/` | Create a new dashboard |
| `GET` | `/:dashboardId` | Get dashboard metadata |
| `GET` | `/:dashboardId/full` | Get dashboard with fully resolved chart data |
| `POST` | `/:dashboardId/refresh` | Refresh all chart data in a dashboard |
| `DELETE` | `/:dashboardId` | Delete a dashboard |
| `PATCH` | `/:dashboardId/layout` | Save dashboard grid layout |
| `PATCH` | `/:dashboardId/metadata` | Update dashboard name, tags, etc. |
| `PATCH` | `/:dashboardId` | Autosave partial state (OCC-protected) |

### Annotations — `/api/annotations`

| Method | Path | Description |
|---|---|---|
| `GET` | `/chart/:chartId` | List annotations for a chart |
| `GET` | `/dashboard/:dashboardId` | List annotations for a dashboard |
| `POST` | `/` | Create an annotation |
| `PUT` | `/:id` | Update an annotation |
| `DELETE` | `/:id` | Delete an annotation |

### AI — `/api/ai`

| Method | Path | Description |
|---|---|---|
| `POST` | `/parse-text` | Parse natural-language text into a structured query |

### Export — `/api/export`

| Method | Path | Description |
|---|---|---|
| `GET` | `/:datasetId/csv` | Export dataset as CSV |
| `GET` | `/:datasetId/xlsx` | Export dataset as XLSX |
| `GET` | `/:datasetId/pdf` | Export dataset as PDF |
| `GET` | `/:datasetId/log` | Get export audit log |
| `POST` | `/embed/token` | Generate an embed token for shared dashboards |

### DLQ (Dead-Letter Queue) — `/api/dlq`

| Method | Path | Description |
|---|---|---|
| `GET` | `/:datasetId/patterns` | Aggregate errors by pattern |
| `GET` | `/:datasetId/statistics` | Error distribution statistics |
| `GET` | `/:datasetId/errors/:aggregationKey` | Get rows matching an error pattern |
| `POST` | `/:datasetId/bulk-fix` | Apply a fix to all rows with a given error pattern |
| `POST` | `/:recordId/resolve` | Mark an individual error as resolved |
| `GET` | `/:datasetId/quarantine-dashboard` | Full quarantine status dashboard |
| `GET` | `/:recordId/detail` | View a single DLQ record in detail |

### Jobs (dev/test) — `/api/jobs`

| Method | Path | Description |
|---|---|---|
| `POST` | `/test-job` | Enqueue a test job |
| `POST` | `/test-permanent-fail` | Enqueue a job that triggers DLQ routing |
| `GET` | `/stats` | Live queue stats (active, waiting, failed, completed) |
| `POST` | `/retry/:jobId` | Retry a failed job by ID |

---

## Data Pipeline

The upload-to-clean-data pipeline runs as a background job via BullMQ:

```
File Upload (Busboy → GridFS)
        │
        ▼
┌─────────────────────┐
│  Stream Parser       │  Parse CSV/XLSX into row events
│  (parser/)           │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  Schema Inference    │  Detect data types, roles, relationships
│  (schema-inference/) │
└────────┬────────────┘
         │
         ▼
┌─────────────────────┐
│  DTS Pipeline        │  Clean → Normalize → Transform → Validate
│  (dts/)              │
└────────┬────────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
 Clean     Quarantine
 Records   (DLQ Records)
```

1. **Parser** — Streams the uploaded file from GridFS. `filePeeker` detects the format, then `streamParser` emits row events.
2. **Schema Inference** — Samples rows to infer column types, dimension/measure roles, and cross-dataset relationships.
3. **DTS (Data Transform & Store)** — Applies cleaning rules, type normalization, and row transformations. Valid rows go to `CleanRecord`; invalid rows are routed to `DLQRecord` with error fingerprints and suggested fixes.

---

## Background Jobs (BullMQ)

The server uses BullMQ backed by Redis for reliable background processing:

| Component | File | Purpose |
|---|---|---|
| Queue | `jobs/queue.js` | Creates the `backgroundTasks` queue, exposes `addBackgroundTask()` |
| Worker | `jobs/worker.js` | Consumes jobs, dispatches to the correct processor |
| Orchestrator | `jobs/orchestrator.js` | Queue stats, retry, and cleanup utilities |
| Retry Policy | `jobs/retryPolicy.js` | Exponential backoff with configurable limits |
| Upload Processor | `jobs/uploadProcessor.js` | Runs the full parse → infer → DTS pipeline |
| DLQ Router | `jobs/dlq.js` | Routes permanently failed jobs to the dead-letter queue |

> **Redis is optional at startup.** If Redis is unavailable, the server starts without background workers and logs a warning. Upload processing falls back to in-line execution when workers are disabled.

---

## Data Models

| Model | Collection | Description |
|---|---|---|
| `Metadata` | `metadatas` | Dataset metadata: file name, inferred schema, column roles, relationships, row counts |
| `CleanRecord` | `cleanrecords` | Validated, clean data rows (indexed by `datasetId` + `rowNumber`) |
| `RawRecord` | `rawrecords` | Original raw uploaded rows |
| `DLQRecord` | `dlqrecords` | Quarantined rows with error fingerprints, suggested fixes, resolution history |
| `Chart` | `charts` | Saved chart configurations (type, dimensions, measures, filters, sort) |
| `Dashboard` | `dashboards` | Dashboard layout, state, tags, favorites, thumbnail |
| `Annotation` | `annotations` | Text/marker annotations on charts or dashboards |
| `Idempotency` | `idempotencies` | Tracks idempotency keys to prevent duplicate submissions |
| `ExportLog` | `exportlogs` | Audit trail for data exports |

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start with nodemon (auto-restart, 4 GB heap limit) |
| `npm run start` | Production start (`node`, 4 GB heap limit) |

### Maintenance Scripts (`scripts/`)

Run manually with `node scripts/<scriptName>.js`:

| Script | Description |
|---|---|
| `initIndexes.js` | Create/ensure MongoDB indexes |
| `cleanup-duplicates.js` | Remove duplicate records violating unique constraints |
| `migrateDlq.js` | Migrate DLQ records between schema versions |
| `stress-test.js` | Load-test the upload pipeline |
| `test_charts.js` | Smoke-test chart CRUD APIs |
| `test_dashboards_annotations.js` | Smoke-test dashboard & annotation APIs |

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `5000` | HTTP server port |
| `PORT_SEARCH_LIMIT` | `20` | Max ports to try if the default is busy |
| `MONGO_URI` | `mongodb://127.0.0.1:27017/analytics-bi` | MongoDB connection string |
| `REDIS_HOST` | `127.0.0.1` | Redis host for BullMQ |
| `REDIS_PORT` | `6379` | Redis port |
| `CORS_ORIGIN` | `*` | Allowed CORS origin(s) |
| `NODE_ENV` | — | Set to `production` to suppress debug logs |

> If MongoDB is unreachable, the server automatically falls back to an **in-memory MongoDB** instance via `mongodb-memory-server` (dev dependency). Data will not persist across restarts in this mode.

---

## Real-Time Events (Socket.IO)

The server emits progress events to subscribed clients during file uploads:

| Event | Direction | Description |
|---|---|---|
| `upload:subscribe` | Client → Server | Join a room for upload progress (`{ uploadId }`) |
| `upload:unsubscribe` | Client → Server | Leave the upload room |
| `upload:<uploadId>` | Server → Client | Progress updates (percentage, stage, errors) |

---

## Docker

The server includes a `Dockerfile` for production deployment. The Docker build:

1. Copies workspace `package.json` files for dependency resolution
2. Installs production-only dependencies via `npm install --workspace=apps/server --omit=dev`
3. Copies server source code
4. Sets `NODE_ENV=production` and exposes port `5000`
5. Starts with `node apps/server/src/index.js`

---


