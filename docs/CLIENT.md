# Analytics BI Client (Frontend)

This document is the canonical technical reference for the Analytics BI client side. It covers the monolith React app in apps/client, the microfrontend shell in apps/host, and the four MFEs used for incremental migration.

## Scope and Responsibilities

The client is responsible for:
- rendering the full Analytics BI UI (upload, review, charts, dashboards, exports)
- orchestrating dataset ingestion flows with real-time progress updates
- presenting role-aware navigation and UI-level RBAC gating
- integrating with the backend via REST APIs and Socket.IO
- managing user preferences (theme, density, accent, reduce motion)
- coordinating export flows, including polling job status and downloading artifacts
- hosting microfrontends and providing a safe fallback when remotes are unavailable

## Runtime Architecture

There are two supported runtime modes:

1) Monolith client (apps/client)
- Single React 19 + Vite 7 SPA.
- Used in production today; serves as the source of truth during MFE migration.

2) Microfrontend shell + remotes (apps/host + apps/mfe-*)
- Host renders the chrome (topbar, layout) and lazy-loads feature pages.
- Each remote exposes a small surface area (charts, dashboards, auth, ingestion, etc).
- Remotes re-use apps/client modules or shared-lib utilities to prevent drift.

## Package Layout

Key top-level directories:
- apps/client: monolith React SPA
- apps/host: MFE shell
- apps/mfe-auth: auth pages
- apps/mfe-analytics: charts + dashboards
- apps/mfe-data-mgmt: ingestion + datasets + data review
- apps/mfe-tools: settings + builder + sql editor
- apps/shared-lib: shared utilities used by host and MFEs

## Entry Points and Bootstrapping

### Monolith (apps/client)
- Entry: src/main.jsx
  - Creates the React root and wraps App in BrowserRouter.
- Root component: src/App.jsx
  - Defines routes, auth guard, role gating, and workspace layout.
- Remote entry: src/remote-entry.js
  - Re-exports App and selected modules for reuse by other packages.
- Bootstrap: src/bootstrap.jsx (currently empty)
  - Reserved for future async bootstrapping.

### Host Shell (apps/host)
- Entry: src/main.jsx
  - Imports client CSS to maintain consistent styling.
- Root component: src/App.jsx
  - Uses lazy loading for MFE pages with dev-time fallback to client modules.
- MFE Loader: src/components/MFELoader.jsx
  - Wraps remote components with Suspense and ErrorBoundary.
- Error boundary: src/components/ErrorBoundary.jsx
  - Shows a graceful fallback when a remote fails to render.

### MFEs
Each MFE exposes a remoteEntry.js and only a minimal routing setup:
- mfe-auth (port 5001)
  - Exposes LoginPage and SignUpPage.
- mfe-analytics (port 5002)
  - Exposes ChartsPage and DashboardPage.
- mfe-data-mgmt (port 5003)
  - Exposes IngestionPage, DatasetsPage, DataReviewPage.
- mfe-tools (port 5004)
  - Exposes SettingsPage, SqlEditorPage, BuilderPage.

## Routing and Layout

### Root routes (monolith + host)
- / -> RootEntry
  - Redirects to /app/home for authenticated users.
  - Shows PublicLandingPage for guests.
  - Supports legacy query param view=home|ingestion|review|datasets|charts|dashboards.
- /auth/login, /auth/signup -> Login and Signup modules.
- /embed/:dashboardId -> EmbedDashboard view.
- /app/* -> Workspace layout and feature pages.

### Workspace layout
WorkspaceLayout controls:
- navigation, topbar, and user chip
- immersive modes (chart explore and dashboard editor)
- active dataset selection and data review modal
- background ingestion tasks and completion popup

Routes under /app:
- /app/home -> HomePage
- /app/ingestion -> IngestionWizard
- /app/review -> DataReviewPage
- /app/datasets -> DatasetsPage
- /app/charts -> ChartsPage
- /app/dashboards -> DashboardPage
- /app/settings -> SettingsPage

Role gating:
- RoleRoute blocks unauthorized roles at the route level.
- ROLE_POLICIES define per-module access.

## Authentication and RBAC

### Mock auth
apps/client uses a temporary localStorage-backed auth model in src/core/utils/auth.js:
- storage key: analytics-bi-auth
- roles: admin | editor | viewer
- preferences: theme, density, accent, reduceMotion
- emits AUTH_EVENTS.CHANGED when login/logout changes

Key behaviors:
- getCurrentUser reads and normalizes stored data.
- login/signup persist auth + preferences.
- updateCurrentUserProfile and updateCurrentUserPreferences mutate stored data.
- logout clears storage and CSRF cache.

### UI-level permissions
src/core/utils/permissions.js mirrors server RBAC:
- admin > editor > viewer role hierarchy
- canCreateChart, canCreateDashboard, canEditChart, canEditDashboard
- checks are UX-only, not security guarantees

## Theme, Density, and Styling

Global CSS tokens live in src/index.css:
- fonts: Manrope for body, Space Grotesk for headings
- themes: data-theme=dark|light
- accents: data-accent=teal|amber|rose|indigo
- density: data-density=compact|comfortable
- reduce motion: body.reduce-motion class disables animations

App.jsx applies:
- documentElement data-theme, data-density, data-accent
- localStorage analytics-theme
- export mode styling via body.export-mode

## API Client and HTTP Infrastructure

### Base URLs
src/core/config/env.js:
- VITE_API_BASE_URL -> API base, default http://localhost:5000/api
- VITE_SOCKET_URL -> Socket.IO base, default http://localhost:5000

### Axios client
src/core/http/apiClient.js:
- baseURL: API_BASE_URL
- request interceptor injects X-User-ID and X-User-Role headers
- export mode injects a fallback Automation Session user
- response interceptor maps HTTP errors to userMessage and emits analytics-auth-required on 401

### CSRF handling
src/core/utils/csrf.js:
- GET /api/csrf-token with auth headers
- cache token for 55 minutes
- auto-attach X-CSRF-Token for POST/PUT/PATCH/DELETE

## Service Layer (apps/client/src/services)

### upload.service.js
- uploadDatasetFile
  - multipart POST /upload
  - supports mode, uploadId, datasetId, relatedDatasets, progress callbacks

### datasets.service.js
- listDatasets -> GET /datasets
- getDatasetMetadata -> GET /datasets/:id/metadata
  - in-memory cache keyed by datasetId and pagination
- getDatasetSchema -> GET /datasets/:id/schema
- updateSchemaColumn -> PATCH /datasets/:id/schema/:column
- deleteDataset -> DELETE /datasets/:id
- bulkDeleteDatasets -> POST /datasets/bulk-delete
- quarantine operations:
  - delete row, delete all, validate row, restore row, restore all
- relationships:
  - addRelationship, removeRelationship

### charts.service.js
- queryDataset -> POST /datasets/:id/query
- saveChartData, updateChartData -> POST /charts
- fetchCharts -> GET /charts
- getChartById -> GET /charts/:id
- deleteChartData -> DELETE /charts/:id

### dashboard.service.js
- normalizeDashboard ensures tabs, activeTabId, widgets, and id
- listDashboards -> GET /dashboards
- getDashboardById -> GET /dashboards/:id
- createDashboard -> POST /dashboards with _rawFrontendState
- updateDashboard -> PATCH /dashboards/:id with __v (optimistic concurrency)
- saveDraft -> POST /dashboards/:id/save-draft
- publishDashboard/unpublishDashboard
- getDraftState -> GET /dashboards/:id/draft

### annotations.service.js
- chart and dashboard annotations CRUD

### export.service.js
- buildDatasetRawExportPayload
- buildChartQueryForExport and buildChartRawExportPayload
- create/list/delete export schedules
- getDashboardExportHistory
- generateEmbedToken
- getExportDownloadUrl and getExportShareUrl

## Real-time Updates

Socket.IO is used for ingestion background task updates:
- connects to SOCKET_URL
- initial active jobs: GET /upload/active-jobs
- live events:
  - background-tasks:update
  - background-tasks:completed

The workspace shows active ingestion tasks and triggers a completion popup.

## Export Mode and Embed Flow

### Export mode
- Enabled when URL query has export=true
- Sets window.IS_EXPORT_MODE
- API client injects an Automation Session user to allow export requests
- UI chrome is removed in export mode

### Export status polling
src/hooks/useExportStatus.js:
- POST /export/:type to start export
- polls /export/status/:jobId every 1s
- auto-downloads when completed
- handles queued, processing, failed, completed states

### Embed route
- /embed/:dashboardId renders an embed-safe dashboard view
- relies on backend embed token validation

## Microfrontend Architecture

### Host shell
apps/host src/App.jsx:
- uses lazyWithDevFallback to import remote modules
- in DEV, falls back to apps/client modules if a remote is unavailable
- MFELoader provides Suspense + ErrorBoundary
- Layout.jsx renders the same topbar chrome as the monolith

### Remotes
Module Federation configuration per MFE:
- mfe-auth exposes LoginPage, SignUpPage
- mfe-analytics exposes ChartsPage, DashboardPage
- mfe-data-mgmt exposes IngestionPage, DatasetsPage, DataReviewPage
- mfe-tools exposes SettingsPage, SqlEditorPage, BuilderPage

### Shared library
apps/shared-lib re-exports stable client utilities to keep host and MFEs consistent:
- env constants (API_BASE_URL, SOCKET_URL)
- apiClient and error normalization
- auth utilities and AUTH_EVENTS
- globalEventBus and EVENTS

## Feature Modules (apps/client/src/modules)

The monolith organizes UI by feature modules:
- home: public landing + logged-in home
- ingestion: multi-step upload wizard and dataset picker
- datasets: dataset list and entry point into data review
- data-review: schema view, preview table, and quarantine handling
- charts: chart builder, query panel, chart preview, explore mode
- dashboard: dashboard builder and embed view
- export: export dialogs and status UI
- settings: user preferences and profile
- sql-editor: ad-hoc query interface
- builder: visual builder helpers
- chatbot: AI assistant UI shell

## Build and Deployment

### Monolith scripts
- npm run dev -w apps/client
- npm run build -w apps/client
- npm run preview -w apps/client

### MFE scripts
- npm run dev:host
- npm run dev:mfe-auth
- npm run dev:mfe-analytics
- npm run dev:mfe-data-mgmt
- npm run dev:mfe-tools
- npm run dev:mfe

### Docker (apps/client)
- multi-stage build with node:20-slim + nginx:alpine
- VITE_API_BASE_URL set to /api for proxying
- VITE_SOCKET_URL set to / for socket proxying
- nginx.conf proxies:
  - /api -> http://server:5000/api/
  - /socket.io -> http://server:5000/socket.io/

## Operational Notes

- Auth and RBAC are client-side only and must not be treated as security.
- UI route guards are backed by server enforcement in the API layer.
- Export mode intentionally bypasses localStorage auth to allow headless exports.
- Dataset metadata caching is in-memory and cleared per datasetId when needed.
- MFEs share React and React Router as singletons to avoid version conflicts.
