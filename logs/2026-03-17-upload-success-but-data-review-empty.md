# Upload Successful But Data Review Empty - 2026-03-17

## Issue Observed
- Dataset upload returns success in UI.
- Upload summary appears, but:
  - `Rows Saved: 0`
  - `Quarantined: 0`
- Data Review section shows:
  - `Dataset not found`
  - `No preview/schema is available for this dataset yet.`

## Repro Summary
1. Upload a CSV file from Ingestion Wizard.
2. API returns successful upload and dataset id.
3. Open Step 2: Data Review.
4. Metadata fetch fails with dataset-not-found.

## Root Cause
Backend contract mismatch across 3 components:

1. **Upload pipeline not persisting review data**
   - File: `apps/server/src/api/upload/upload.controller.js`
   - Current flow uploads to GridFS and returns success payload.
   - It does not persist parsed rows, metadata, or schema for Data Review.
   - Result: row/quarantine counts stay at `0`.

2. **Data Review API queries by `datasetId`**
   - File: `apps/server/src/api/query/datasets.controller.js`
   - `getDatasetMetadata` uses: `Metadata.findOne({ datasetId })`.

3. **Metadata model does not include `datasetId` field**
   - File: `apps/server/src/models/Metadata.js`
   - Schema uses fields like `collectionName`, `uploadedBy`, `ingestionRule`, `columns`.
   - Since `datasetId` is missing/never written, metadata lookup fails.

## Impact
- Upload appears successful from UX perspective.
- Data Review cannot load schema/preview/quarantine for uploaded dataset.
- End-to-end ingestion-to-review workflow is broken.

## Recommended Fix Direction
- Align a single metadata contract across upload + models + query APIs.
- Either:
  1. Add and persist `datasetId` in `Metadata` and write rows/schema during upload, or
  2. Change Data Review lookup to use existing persisted key (`collectionName`) consistently.
- Ensure upload handler writes metadata + clean/DLQ records before returning success.

## Fix Applied

### 1. Metadata schema aligned to Data Review contract
- File: `apps/server/src/models/Metadata.js`
- Added current-runtime fields used by datasets API:
  - `datasetId` (required, unique, indexed)
  - `fileName`, `mode`, `schema`, `rowCount`, `quarantinedCount`, `sourceFileId`
- Kept legacy inference fields (`collectionName`, `uploadedBy`, `columns`, etc.) optional for compatibility.
- Column schema now supports both `type` and `dataType` keys.

### 2. Upload flow now processes data, not just file storage
- File: `apps/server/src/api/upload/upload.controller.js`
- After GridFS upload, server now:
  1. Parses file using `processGridFsFile`
  2. Infers schema with `classifyAllColumns`
  3. Runs DTS validation/cleaning via `transformRows`
  4. Persists valid rows to `CleanRecord`
  5. Persists invalid rows to `DLQRecord`
  6. Upserts `Metadata` by `datasetId`
  7. Returns real `rowCount` and `quarantinedCount`

### 3. Mode behavior handled
- `new`: creates a fresh dataset id (GridFS file id)
- `append`: appends rows and increments counts
- `replace`: clears old clean/DLQ rows before inserting new processed rows

## Verification
- Backend starts successfully after changes (`Server running on port 5000`, `GridFS Initialized`, `MongoDB Connected`).
- Static diagnostics show no errors in modified files.

## Expected UI Result After Fix
- Upload summary should no longer be fixed at 0/0 for valid datasets.
- Data Review should stop returning `Dataset not found` for newly uploaded files.
- Schema/preview/quarantine should be available for datasets that produce parsed rows.

## Additional Fix Update
- Time: `2026-03-17 19:53:46 IST`

### Issue
- Many rows were being quarantined with errors like:
  - `Country: Must be whole number, got Chile`
- This was incorrect for the `country` column.

### Root Cause
- In `apps/server/src/pipelines/dts/index.js`, heuristic checks used substring matching such as:
  - `lowerKey.includes("count")`
- The field name `country` contains `count` as a substring, so it was incorrectly treated as a numeric count field.

### Fix Implemented
- Replaced risky substring heuristics with token-based name matching.
- Added helper logic to match only real field tokens (`count`, `quantity`, `amount`, etc.) instead of partial substrings.
- Applied this fix in all relevant code paths:
  - `semanticValidateRow`
  - `validateRow`
  - `cleanAndNormalizeRow`

### Result
- `country` is no longer forced into integer validation.
- False-positive quarantine entries from this specific `country`/`count` overlap are prevented.
