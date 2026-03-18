# Datasets Tab and Branding Update - 2026-03-18

## Request
1. Replace default Vite browser tab branding (`vite` icon and `client` title) with meaningful app branding.
2. Add a new menu tab after Data Review to see all inserted datasets.
3. Record all changes in logs.

## Changes Made

### 1. Browser Tab Branding Updated
- File: `apps/client/index.html`
- Replaced default favicon reference:
  - From: `/vite.svg`
  - To: `/analytics-bi.svg`
- Updated title:
  - From: `client`
  - To: `Analytics BI`

- File added: `apps/client/public/analytics-bi.svg`
  - New custom favicon for Analytics BI.

### 2. New Datasets API Endpoint Added
- File: `apps/server/src/api/query/datasets.controller.js`
- Added controller method:
  - `listDatasets` (GET `/api/datasets`)
  - Returns latest dataset metadata list with:
    - `datasetId`
    - `fileName`
    - `mode`
    - `rowCount`
    - `quarantinedCount`
    - `createdAt`, `updatedAt`
  - Sorted by `createdAt` descending.

- File: `apps/server/src/api/query/datasets.routes.js`
- Added route registration:
  - `router.get("/", listDatasets)`

### 3. New Datasets Menu Tab and Page Added
- File: `apps/client/src/App.jsx`
- Added import and wiring for `DatasetsPage`.
- Added new nav button `Datasets` after `Data Review`.
- Extended app view modes to include `datasets`.
- Added dynamic header config for all views (`ingestion`, `review`, `datasets`).
- Added behavior to open a selected dataset directly in `Data Review`.

- Files added:
  - `apps/client/src/modules/datasets/DatasetsPage.jsx`
  - `apps/client/src/modules/datasets/index.js`

- `DatasetsPage` behavior:
  - Fetches from `GET /api/datasets`.
  - Renders all inserted datasets in a table.
  - Includes `Refresh` and `Open in Review` action per row.

### 4. Styling Adjustments
- File: `apps/client/src/App.css`
- Added styles for datasets page header spacing and active dataset row highlight.

## Verification
1. Client build check:
   - Command: `npm run build -w apps/client`
   - Result: Success (`vite build` completed, output generated in `dist/`).

2. Server controller load check:
   - Command: `node -e "require('./apps/server/src/api/query/datasets.controller'); console.log('datasets.controller loaded')"`
   - Result: Success (`datasets.controller loaded`).

## Outcome
- Browser tab now shows Analytics BI branding.
- New `Datasets` tab is available after `Data Review` and lists inserted datasets.
- Users can select any dataset from the list and jump straight into Data Review.
