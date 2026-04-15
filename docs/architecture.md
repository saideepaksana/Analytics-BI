# 🏗️ Architecture & Complete Data Flow

## System Architecture

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│                           BROWSER (Port 5173)                                │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ React Frontend (Vite + React)                                         │  │
│  │ - Ingestion Wizard (file + mode + dataset picker)                     │  │
│  │ - Live upload progress (Socket.IO)                                    │  │
│  │ - Datasets page (list/open/delete)                                    │  │
│  │ - Data Review modal (Preview / Quarantine / Relationships tabs)       │  │
│  └─────────────────────────────┬───────────────────────────┬─────────────┘  │
│                                │                           │                │
│                      HTTP/Multipart (REST)         WebSocket (progress)     │
│                                │                           │                │
└────────────────────────────────┼───────────────────────────┼────────────────┘
                                 ↓                           ↓
            ┌────────────────────────────────────────────────────────────────┐
            │                    EXPRESS SERVER (Port 5000)                  │
            │                                                                │
            │   Routes:                                                      │
            │   - POST   /api/upload                                         │
            │   - GET    /api/datasets                                       │
            │   - GET    /api/datasets/:datasetId/metadata                   │
            │   - PATCH  /api/datasets/:datasetId/schema/:columnName         │
            │   - POST   /api/datasets/:datasetId/quarantine/...             │
            │   - DELETE /api/datasets/:datasetId...                         │
            │                                                                │
            │   Middleware: CORS, express.json(), multer(memoryStorage)      │
            │   Upload limits: 15MB, extension validation (.csv/.xls/.xlsx) │
            └───────────────────────────┬────────────────────────────────────┘
                                        │
                                        ↓
            ┌────────────────────────────────────────────────────────────────┐
            │                    Upload Processing Pipeline                  │
            │                                                                │
            │  1) Store uploaded file in GridFS                              │
            │  2) Stream parse (CSV/XLS/XLSX)                                │
            │  3) Structural validation in worker threads                    │
            │     - batches (default 500 rows)                               │
            │     - quarantine column-count mismatches                       │
            │  4) Infer schema from parsed rows                              │
            │  5) Transform + semantic validation (DTS)                      │
            │     - valid rows -> CleanRecord                                │
            │     - invalid rows -> DLQRecord                                │
            │  6) Upsert Metadata + refresh relationships                    │
            │  7) Emit socket progress stages (received -> done/failed)      │
            └───────────────────────────┬────────────────────────────────────┘
                                        │
                                        ↓
            ┌────────────────────────────────────────────────────────────────┐
            │                         MONGODB                                │
            │                                                                │
            │  GridFS: uploads.files + uploads.chunks                        │
            │  Collections: Metadata, CleanRecord, DLQRecord, RawRecord      │
            │                                                                │
            │  Note: Current upload flow writes Metadata/CleanRecord/DLQRecord│
            │        (RawRecord model exists; not actively written here).    │
            └────────────────────────────────────────────────────────────────┘
```

---

## Complete Data Flow (User Interaction -> System Response)

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ 1) User chooses file + ingestion mode                                       │
└──────────────────────────────────────────────────────────────────────────────┘
                │
                ├─ mode = new
                │      -> continue
                │
                └─ mode = append/replace
                       -> open dataset picker popup
                       -> GET /api/datasets
                       -> user selects existing datasetId

                ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ 2) User clicks Upload                                                       │
│    Frontend sends POST /api/upload (multipart form-data)                    │
│    payload: file, mode, uploadId, datasetId  │
└──────────────────────────────────────────────────────────────────────────────┘
                │
                ↓
┌──────────────────────────────────────────────────────────────────────────────┐
│ 3) Backend validates request                                                 │
│    - file exists                                                             │
│    - mode in [new, append, replace]                                         │
│    - append/replace requires datasetId                                       │
│    - extension valid (.csv/.xls/.xlsx)                                      │
│    - size <= 15MB                                                           │
└──────────────────────────────────────────────────────────────────────────────┘
                │
        ┌───────┴────────────────────────────────────────────────────────────┐
        │                                                                    │
        ↓                                                                    ↓
┌──────────────────────────────────────┐                         ┌──────────────────────────────────────┐
│ Validation failed                    │                         │ Validation passed                    │
│ -> HTTP error (400/404/409/500)      │                         │ -> store file in GridFS             │
│ -> frontend shows inline error        │                         │ -> emit progress: received/stored    │
└──────────────────────────────────────┘                         └──────────────────────────────────────┘
                                                                              │
                                                                              ↓
                                                   ┌──────────────────────────────────────────────┐
                                                   │ 4) Parse stream + structural validation      │
                                                   │    - CSV/Excel iterator                      │
                                                   │    - worker-thread batches                   │
                                                   │    - structurally bad rows -> parser DLQ set │
                                                   │    - valid rows -> parsedRows                │
                                                   └──────────────────────────────────────────────┘
                                                                              │
                                                                              ↓
                                                   ┌──────────────────────────────────────────────┐
                                                   │ 5) Schema + DTS transform                    │
                                                   │    - infer columns + roles                   │
                                                   │    - clean/normalize values                  │
                                                   │    - semantic validation                     │
                                                   │    - valid rows -> CleanRecord               │
                                                   │    - invalid rows -> DLQRecord               │
                                                   └──────────────────────────────────────────────┘
                                                                              │
                                                                              ↓
                                                   ┌──────────────────────────────────────────────┐
                                                   │ 6) Metadata upsert + relationship refresh    │
                                                   │    Metadata fields include:                  │
                                                   │    datasetId, mode, schema, counts, fileId   │
                                                   └──────────────────────────────────────────────┘
                                                                              │
                                                                              ↓
                                                   ┌──────────────────────────────────────────────┐
                                                   │ 7) Server response                            │
                                                   │    HTTP 200 JSON:                             │
                                                   │    message, datasetId, fileId, fileName,     │
                                                   │    mode, rowCount, quarantinedCount, uploadId │
                                                   │    + socket stage: done (100%)               │
                                                   └──────────────────────────────────────────────┘
                                                                              │
                                                                              ↓
                                                   ┌──────────────────────────────────────────────┐
                                                   │ 8) Frontend behavior                          │
                                                   │    - progress reaches 100                     │
                                                   │    - Data Review modal opens                  │
                                                   │    - metadata fetched for selected dataset    │
                                                   └──────────────────────────────────────────────┘
```

---

## Data Review Flow

```text
User opens Data Review modal
        │
        ├─ GET /api/datasets/:datasetId/metadata?limit&offset
        │      -> returns metadata + schema + relationships + quarantinedRows + preview
        │
        ├─ User changes schema role/type
        │      -> PATCH /api/datasets/:datasetId/schema/:columnName
        │      -> refetch metadata
        │
        ├─ User validates/restores one quarantined row
        │      -> POST /quarantine/:rowIndex/validate
        │      -> POST /quarantine/:rowIndex/restore
        │      -> refetch metadata
        │
        ├─ User restores all quarantined rows
        │      -> POST /quarantine/restore-all
        │      -> refetch metadata
        │
        └─ User deletes one/all quarantined rows
               -> DELETE /quarantine/:rowIndex or /quarantine
               -> refetch metadata
```

---

## Datasets Page Flow

```text
User opens Datasets tab
    │
    ├─ GET /api/datasets
    │   -> show dataset table
    │
    ├─ Open in Review
    │   -> open Data Review modal with selected datasetId
    │
    └─ Delete dataset
        -> frontend confirmation modal
        -> DELETE /api/datasets/:datasetId
        -> remove from list on success
```

---

## MongoDB Collections (Current Project)

```text
Database: analytics-bi

1) uploads.files     (GridFS metadata)
2) uploads.chunks    (GridFS binary chunks)
3) metadatas         (dataset-level schema + counts + relationships)
4) cleanrecords      (valid, normalized rows)
5) dlqrecords        (quarantined rows + error messages)
6) rawrecords        (model exists; currently not a primary write target in upload flow)
```

---

## Operational Notes

```text
- Default frontend dev port: 5173 (Vite)
- Default backend port: 5000 (Express + Socket.IO)
- Progress channel: upload:<uploadId> room over Socket.IO
- Parser tuning:
  PARSER_BATCH_SIZE (default 500)
  PARSER_WORKERS (default min(CPU count, 8))
```
