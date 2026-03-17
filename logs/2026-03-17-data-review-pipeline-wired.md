# Data Review Pipeline Wired Up - 2026-03-17

## Problem
File upload succeeded (GridFS storage worked) but the Data Review section never populated.

## Root Causes Found

### 1. Upload controller ran no pipeline
`apps/server/src/api/upload/upload.controller.js` only stored the file in GridFS and
returned `{ message, fileName, mode }` — no `datasetId` in the response. The frontend
`IngestionWizard` calls `onCompleted(result.datasetId)` so `activeDatasetId` was always
`undefined`, preventing Data Review from ever fetching.

### 2. Datasets query API was completely empty
Both `apps/server/src/api/query/datasets.controller.js` and `datasets.routes.js` were
empty files (0 bytes). Every API call from `useMetadata.js` (schema, preview, quarantine)
hit a 404.

### 3. Datasets routes were never registered
Even if the files had been filled, `apps/server/src/index.js` never imported or mounted
them, so the `/api/datasets/*` namespace didn't exist on the server.

---

## Changes Made

### `apps/server/src/api/upload/upload.controller.js` — Full Rewrite
Old behavior: store file to GridFS, return `{message, fileName, mode}`.

New behavior — full pipeline:
1. Generate `datasetId` (`ds_<timestamp>_<random>`)
2. Store file in GridFS
3. Call `processGridFsFile` (streamParser) — parses CSV/Excel from GridFS, runs structural
   worker validation, returns `{validRows[], parseQuarantineRows[]}`
4. Call `classifyAllColumns` (schema-inference) on valid row data — returns column types
   and Dimension/Measure roles
5. Call `transformRows` (DTS engine) — cleans and semantically validates rows, separates
   clean rows from invalid ones
6. Bulk-insert `CleanRecord` documents (clean rows)
7. Bulk-insert `DLQRecord` documents (parser quarantine + DTS invalid combined)
8. Upsert `Metadata` document (schema, rowCount, quarantinedCount, sourceFileId)
9. Return `{ datasetId, rowCount, quarantinedCount, fileName, mode }`

### `apps/server/src/api/query/datasets.controller.js` — Implemented (was empty)
Endpoints added:
- `getDatasetMetadata` — returns `{metadata, schema, quarantinedRows, preview}`
- `updateSchemaColumn` — patches `type` / `role` in the schema array
- `deleteQuarantinedRow` — deletes single DLQRecord by sorted array index; decrements count
- `deleteAllQuarantinedRows` — wipes all DLQRecords for dataset; zeroes quarantinedCount
- `validateQuarantinedRow` — runs `validateRow()` on proposed restore data; returns errors
- `restoreQuarantinedRow` — validates + cleans row, moves DLQ → CleanRecord, updates counts
- `restoreAllValidQuarantinedRows` — batch restore; separates restorable from still-invalid

### `apps/server/src/api/query/datasets.routes.js` — Implemented (was empty)
All seven routes registered. `restore-all` is placed before `/:rowIndex/*` routes to
prevent Express matching "restore-all" as a rowIndex param.

### `apps/server/src/index.js` — Added datasets route registration
```js
const datasetsRoutes = require("./api/query/datasets.routes");
app.use("/api/datasets", datasetsRoutes);
```

---

## Verification
Server started cleanly after changes: `Server running on port 5000 / GridFS Initialized / MongoDB Connected`.
