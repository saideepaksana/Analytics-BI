# Analytics BI — Architecture

## High-Level Architecture Diagram

```mermaid
graph TB
    subgraph Browser["Browser (Port 5173)"]
        UI["React 19 + Vite 7<br/>SPA Client"]
        MFE["Module Federation<br/>remote-entry.js"]
    end

    subgraph Server["Express Server (Port 5000)"]
        API["REST API Layer<br/>/api/upload · /api/datasets · /api/charts<br/>/api/dashboards · /api/annotations<br/>/api/export · /api/ai"]
        MW["Middleware Stack<br/>CORS · Auth · RBAC · Idempotency<br/>Security Headers · Rate Limiting<br/>Sanitization · CSRF"]
        SIO["Socket.IO Server<br/>Real-time Events"]
        WK["BullMQ Workers<br/>background-tasks · bulk-ingestion<br/>raw-export · dashboard-export<br/>scheduled-export"]
        PIPE["Pipelines<br/>Parser → Schema Inference<br/>→ DTS → Query Engine"]
        EXP["Export Engine<br/>PDFKit · ExcelJS · Puppeteer"]
    end

    subgraph Infra["Infrastructure"]
        MONGO[("MongoDB 6+<br/>GridFS · Collections")]
        REDIS[("Redis 7+<br/>BullMQ Queues")]
    end

    UI -- "Axios (REST)" --> API
    UI -- "Socket.IO" --> SIO
    MFE -.-> UI
    API --> MW --> PIPE
    API --> WK
    WK --> PIPE
    WK --> EXP
    PIPE --> MONGO
    EXP --> MONGO
    WK --> REDIS
    SIO --> REDIS
    API --> MONGO
```

---

## Data Flow

### 1. File Upload → Transformation → Clean Pipeline → MongoDB

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant API as Express API
    participant GFS as GridFS
    participant Q as BullMQ Queue
    participant W as Worker
    participant DB as MongoDB

    U->>C: Select file + mode (new/append/replace)
    C->>API: POST /api/upload (multipart)
    API->>API: Validate (file, mode, ext, size ≤ 15MB)
    API->>GFS: Store raw file
    API-->>C: Socket.IO: stage=received

    alt Small file (inline processing)
        API->>API: Streaming Parse (CSV/Excel)
        API->>API: Schema Inference
        API->>API: DTS Transform + Semantic Validation
        API->>DB: Valid rows → CleanRecord
        API->>DB: Invalid rows → DLQRecord
        API->>DB: Upsert Metadata
        API-->>C: Socket.IO: stage=done (100%)
        API->>C: HTTP 200 response
    else Large file (background processing)
        API->>Q: Enqueue to bulk-ingestion
        API->>C: HTTP 200 (processing in background)
        Q->>W: Dequeue job
        W->>GFS: Read stored file
        W->>W: Stream Parse (500 rows/batch)
        W->>W: Schema Inference + DTS
        W->>DB: CleanRecord + DLQRecord
        W->>DB: Upsert Metadata + Relationships
        W-->>C: Socket.IO: stage=done
    end
```

### 2. User Creates Chart → Selects Dataset → Render via ECharts

```mermaid
sequenceDiagram
    participant U as User
    participant C as Charts Page
    participant API as Express API
    participant DB as MongoDB

    U->>C: Open Chart Builder
    C->>API: GET /api/datasets
    API->>DB: Query Metadata collection
    API-->>C: Dataset list with schemas

    U->>C: Select dataset + configure query
    Note over C: Dimensions, measures,<br/>filters, aggregation, sort

    C->>API: POST /api/datasets/:id/query
    API->>DB: Aggregation pipeline on CleanRecord
    API-->>C: Query results

    C->>C: Render chart via ECharts
    Note over C: Bar, Line, Pie, Scatter,<br/>Box Plot, Area

    U->>C: Save chart
    C->>API: POST /api/charts
    API->>DB: Upsert Chart document
    API-->>C: Saved chart response
```

### 3. Dashboard Publish Flow

```mermaid
stateDiagram-v2
    [*] --> Draft: POST /api/dashboards (create)
    Draft --> Draft: PATCH /:id (autosave)
    Draft --> Draft: POST /:id/save-draft
    Draft --> Published: POST /:id/publish
    Published --> Draft: POST /:id/unpublish
    Published --> Published: POST /:id/refresh

    note right of Draft
        Private, owner-only
        draftState stores changes
        OCC via version field
    end note

    note right of Published
        Visible to all authorized users
        layout/tabs are live content
        Embeddable via token
    end note
```

### 4. Export Job Flow (CSV, PDF, Scheduled)

```mermaid
sequenceDiagram
    participant U as User
    participant C as Client
    participant API as Export Controller
    participant Q as BullMQ Queue
    participant W as Worker
    participant FS as Temp Filesystem
    participant DB as MongoDB

    U->>C: Click Export (CSV/PDF/PNG)

    alt Pipeline A: Raw Data Export
        C->>API: POST /api/export/raw
        API->>Q: Add to raw-export queue
        API-->>C: 202 { jobId }
        Q->>W: rawExportWorker
        W->>DB: Fetch CleanRecord data
        W->>FS: Write CSV/XLSX file
        W->>DB: Create ExportLog
    end

    alt Pipeline B: Visual Dashboard Export
        C->>API: POST /api/export/visual
        API->>Q: Add to dashboard-export queue
        API-->>C: 202 { jobId }
        Q->>W: visualExportWorker
        W->>W: Launch Puppeteer
        W->>W: Navigate to dashboard URL (?export=true)
        W->>W: Render PDF/PNG screenshot
        W->>FS: Save output file
        W->>DB: Create ExportLog
    end

    alt Pipeline C: Scheduled Export
        U->>API: POST /api/export/schedules
        API->>Q: Add repeatable job (cron pattern)
        API->>DB: Create ScheduledExport
        Note over Q: Cron patterns:<br/>daily = 0 6 * * * (6 AM UTC)<br/>weekly = 0 6 * * 1 (Mon 6 AM)<br/>monthly = 0 6 1 * * (1st 6 AM)<br/>test = * * * * * (every minute)
        Q->>W: scheduledExportWorker
        W->>W: Load dashboard + render
        W->>FS: Save output
        W->>DB: Update ScheduledExport.lastRunAt
    end

    loop Poll Status
        C->>API: GET /api/export/status/:jobId
        API->>Q: Check job state
        API-->>C: { state, progress, result }
    end

    C->>API: GET /api/export/download/:filename
    API->>FS: Read file
    API-->>C: File download
```

---

## Tech Stack Table

### Frontend

| Technology | Version | Purpose |
|------------|---------|---------|
| React | 19 | UI framework |
| Vite | 7 | Build tool & dev server |
| Apache ECharts | 6 | Charting & data visualization |
| Axios | — | HTTP client for REST API |
| Socket.IO Client | 4 | Real-time progress updates |
| React Router | — | Client-side routing |
| Lucide React | — | Icon library |
| html2canvas | 1.4 | Client-side screenshot capture |
| `@originjs/vite-plugin-federation` | 1.4 | Module Federation for microfrontends |

### Backend

| Technology | Version | Purpose |
|------------|---------|---------|
| Express | 5 | HTTP server & routing |
| Mongoose | 9 | MongoDB ODM |
| BullMQ | 5 | Background job processing |
| IORedis | 5 | Redis client (BullMQ dependency) |
| Socket.IO | 4 | WebSocket server for real-time events |
| Busboy | — | Streaming multipart file parsing |
| fast-csv | — | CSV parsing during ingestion |
| ExcelJS | — | XLSX reading & writing |
| PDFKit | — | PDF document generation |
| Puppeteer | — | Headless Chrome for visual exports |
| AJV | — | JSON Schema validation |
| json2csv | — | CSV serialization for exports |
| date-fns | — | Date utilities |
| Lodash | — | General utilities |
| dotenv | — | Environment variable loading |
| Nodemon | — | Development auto-reload |

### Infrastructure

| Technology | Version | Purpose |
|------------|---------|---------|
| MongoDB | 6+ | Primary database + GridFS file storage |
| Redis | 7+ | Job queues & worker coordination |
| Docker Compose | — | Container orchestration |
| Node.js | 18+ | Server runtime |

---

## Microfrontend Structure

Analytics BI is architected with Module Federation support via `@originjs/vite-plugin-federation`. The system is designed as a **host + remote** pattern:

```mermaid
graph LR
    subgraph Host["Host Shell (Port 5173)"]
        Shell["App Shell<br/>Navigation · Auth · Layout"]
    end

    subgraph Remotes["Micro-Frontends"]
        Auth["mfe-auth (Port 5001)<br/>Login · Signup"]
        Analytics["mfe-analytics (Port 5002)<br/>Charts · Dashboards"]
        Data["mfe-data-mgmt (Port 5003)<br/>Ingestion · Datasets · Review"]
        Tools["mfe-tools (Port 5004)<br/>SQL Editor · AI Assistant"]
    end

    Shell --> Auth
    Shell --> Analytics
    Shell --> Data
    Shell --> Tools
```

**Implementation status**: All MFE directories exist under `apps/` with real code:

- **`apps/host/`**: Full app shell with `MFELoader.jsx`, `ErrorBoundary.jsx`, `Layout.jsx`, event bus, and auth bridge
- **`apps/mfe-auth/`**: `LoginPage.jsx`, `SignUpPage.jsx`, `remote-entry.js`, `bootstrap.jsx`
- **`apps/mfe-analytics/`**: `ChartsPage.jsx`, `DashboardPage.jsx`, `remote-entry.js`, `bootstrap.jsx`
- **`apps/mfe-data-mgmt/`**: `IngestionPage.jsx`, `DatasetsPage.jsx`, `DataReviewPage.jsx`, `remote-entry.js`
- **`apps/mfe-tools/`**: `BuilderPage.jsx`, `SettingsPage.jsx`, `SqlEditorPage.jsx`, `remote-entry.js`
- **`apps/shared-lib/`**: Shared utilities (`apiClient.js`, `authBridge.js`, `eventBus.js`, `env.js`)

The host's `vite.config.js` declares federation remotes pointing to each MFE's `remoteEntry.js`. Shared dependencies (`react`, `react-dom`, `react-router-dom`) are configured as singletons. The monolithic client (`apps/client`) can also operate standalone or as a federated remote via its own `remote-entry.js`.

**Running the MFE stack**: `npm run dev:mfe` starts the host + all 4 remotes concurrently.

**Design intent**: Each MFE runs independently, communicates via shared services and the REST API, and can be deployed/updated independently.

---

## Real-time Communication

```mermaid
sequenceDiagram
    participant C as Client
    participant SIO as Socket.IO Server
    participant W as BullMQ Worker

    C->>SIO: connect()
    C->>SIO: upload:subscribe({ uploadId })
    SIO->>SIO: socket.join("upload:{uploadId}")

    W->>SIO: emit("background-tasks:update", { uploadId, stage, progress })
    SIO->>C: Forward to room "upload:{uploadId}"

    W->>SIO: emit("background-tasks:completed", { fileName, datasetId })
    SIO->>C: Show completion popup

    C->>SIO: upload:unsubscribe({ uploadId })
    SIO->>SIO: socket.leave("upload:{uploadId}")
```

**Events**:

| Event | Direction | Payload | Purpose |
|-------|-----------|---------|---------|
| `upload:subscribe` | Client → Server | `{ uploadId }` | Join progress room |
| `upload:unsubscribe` | Client → Server | `{ uploadId }` | Leave progress room |
| `background-tasks:update` | Server → Client | `{ uploadId, stage, progress, ... }` | Real-time progress |
| `background-tasks:completed` | Server → Client | `{ fileName, datasetId }` | Ingestion complete notification |

**Embed Socket**: A separate `embedSocket` module handles real-time communication for embedded dashboards, enabling data refresh without full page reloads.

---

## Scalability Considerations

### Horizontal Scaling

| Component | Strategy |
|-----------|----------|
| **Express API** | Stateless — can run behind a load balancer with multiple instances |
| **BullMQ Workers** | Workers connect to shared Redis — multiple processes can consume from the same queues |
| **MongoDB** | Supports replica sets and sharding; GridFS scales with the cluster |
| **Redis** | BullMQ supports Redis Cluster for high availability |

### Concurrency Control

- **Per-queue concurrency**: Configured via `CONCURRENCY_PROFILES` (LOW/MEDIUM/HIGH)
- **Global semaphore**: Caps total in-flight jobs across all queues (MEDIUM default: 15)
- **Bulk dispatch**: Large job arrays are chunked into batches of 50 to avoid Redis pipeline overload
- **Queue pause/resume**: Individual queues can be paused at runtime when downstream services degrade

### Data Pipeline

- **Streaming parsing**: Files are parsed as streams (not loaded entirely into memory)
- **Batch writes**: Worker writes rows in batches of 500 to MongoDB
- **GridFS**: Large uploaded files stored in GridFS to avoid the 16MB BSON document limit
- **Export file TTL**: Temporary export files cleaned up every 15 minutes (1-hour TTL)

### Resilience

- **Auto-port fallback**: Server scans up to 20 ports if the default is busy
- **In-memory MongoDB fallback**: Falls back to `mongodb-memory-server` if MongoDB is unreachable (development only)
- **Redis-optional startup**: Workers are disabled gracefully if Redis is unavailable; the REST API continues to function
- **Graceful shutdown**: `SIGINT`/`SIGTERM`/`SIGUSR2` handlers close workers, drain connections, and shut down cleanly
- **Stale job cleanup**: Export logs with `processing` status older than a threshold are auto-cleaned on startup

### Security at Scale

- **Rate limiting**: 1000 requests per IP per minute
- **Input sanitization**: Recursive HTML/script tag stripping on all inputs
- **SQL/NoSQL injection detection**: Pattern-based blocking
- **CSRF protection**: Token-based validation in production
- **Security headers**: CSP, X-Frame-Options (DENY), HSTS, and more
- **Idempotency middleware**: Prevents duplicate request processing via cached responses
