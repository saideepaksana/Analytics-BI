# Analytics BI — Client

The frontend application for the Analytics BI platform, built with **React 19** and **Vite 7**.

---

## Tech Stack

| Technology | Version | Purpose |
|---|---|---|
| React | 19 | UI framework |
| Vite | 7 | Build tool & dev server |
| ECharts | 6 | Chart rendering engine |
| echarts-for-react | 3 | React wrapper for ECharts |
| Axios | 1.x | HTTP client for REST API calls |
| Socket.IO Client | 4 | Real-time progress updates |
| Lucide React | 0.575 | Icon library |
| html2canvas | 1.4 | Client-side screenshot capture |

---

## Project Structure

```
src/
├── main.jsx                          # App entry point
├── App.jsx                           # Root component, routing, global state
├── App.css                           # App-level styles
├── index.css                         # Global design system (tokens, utilities)
│
├── core/                             # Core infrastructure
│   ├── config/                       # Environment variables & API base URLs
│   ├── http/                         # HTTP client setup
│   └── utils/                        # Shared utility functions
│
├── components/                       # Shared UI components
│   └── SimplePopup.jsx               # Global notification popup
│
├── services/                         # API service layer
│   ├── upload.service.js             # File upload API
│   ├── datasets.service.js           # Dataset CRUD & metadata API
│   ├── charts.service.js             # Chart CRUD API
│   ├── dashboard.service.js          # Dashboard CRUD API
│   ├── annotations.service.js        # Chart annotation API
│   └── export.service.js             # Data export API
│
├── modules/                          # Feature modules
│   ├── home/                         # Landing / home page
│   │
│   ├── ingestion/                    # File upload wizard
│   │   ├── IngestionWizard.jsx       # Multi-step upload flow with progress
│   │   ├── FileUpload.jsx            # File picker component
│   │   └── components/               # Wizard sub-components
│   │
│   ├── datasets/                     # Dataset management
│   │   └── DatasetsPage.jsx          # Browse, open, delete datasets
│   │
│   ├── data-review/                  # Data review & quarantine manager
│   │   ├── DataReviewPage.jsx        # Full-page review view
│   │   ├── DataReviewModal.jsx       # Modal overlay for post-upload review
│   │   ├── components/               # Preview table, schema editor, quarantine tab
│   │   └── hooks/                    # Data-fetching hooks
│   │
│   ├── charts/                       # Chart builder & gallery
│   │   ├── ChartsPage.jsx            # Saved charts gallery
│   │   ├── ChartCard.jsx             # Chart thumbnail card
│   │   └── components/
│   │       ├── ChartExplore.jsx      # Full-screen chart exploration mode
│   │       ├── ChartWizard.jsx       # Chart creation wizard
│   │       ├── QueryPanel.jsx        # Dimension, measure, filter configuration
│   │       ├── ChartPanel.jsx        # ECharts rendering panel
│   │       ├── ChartPreview.jsx      # Chart preview with options
│   │       ├── ChartTypeSelector.jsx # Chart type picker (bar, line, pie, etc.)
│   │       ├── SourcePanel.jsx       # Dataset source selector
│   │       ├── DatasetExplorer.jsx   # Dataset column browser
│   │       ├── DimensionMeasureSelector.jsx  # Drag-and-drop column assignment
│   │       └── ExploreTopBar.jsx     # Explore mode toolbar
│   │
│   ├── dashboard/                    # Dashboard builder & gallery
│   │   ├── DashboardPage.jsx         # Dashboard gallery view
│   │   └── components/
│   │       ├── DashboardEditor.jsx   # Drag-and-drop dashboard layout editor
│   │       └── DashboardCard.jsx     # Dashboard thumbnail card
│   │
│   ├── export/                       # Export functionality
│   ├── sql-editor/                   # SQL query interface
│   ├── chatbot/                      # AI assistant module
│   └── builder/                      # Visual builder utilities
│
└── assets/                           # Static assets (images, fonts)
```

---

## Navigation

The app uses a sidebar navigation with five main views:

| View | Module | Description |
|---|---|---|
| **Home** | `home/` | Landing page with quick-action cards |
| **Ingestion** | `ingestion/` | Multi-step upload wizard with real-time progress via Socket.IO |
| **Datasets** | `datasets/` | Browse all datasets, open in Data Review, or delete |
| **Charts** | `charts/` | Saved chart gallery + full-screen explore/builder mode |
| **Dashboards** | `dashboard/` | Dashboard gallery + drag-and-drop layout editor |

Additional features accessible through the UI:
- **Data Review Modal** — Opens as an overlay after upload or from the Datasets page
- **Theme Toggle** — Light/dark mode with localStorage persistence

---

## Key Flows

### Upload Flow
1. User selects a file (CSV/XLS/XLSX) and ingestion mode (`new` / `append` / `replace`)
2. `IngestionWizard` sends a multipart POST to `/api/upload`
3. Real-time progress updates via Socket.IO (`upload:<uploadId>` room)
4. On completion, Data Review modal opens automatically

### Chart Creation Flow
1. User opens Charts → clicks "New Chart"
2. `ChartWizard` guides through: select dataset → pick chart type → configure query
3. `QueryPanel` lets users drag dimensions, measures, set aggregations, filters, and sort
4. `ChartPreview` renders a live ECharts visualization
5. Save persists the chart definition via `/api/charts`

### Dashboard Flow
1. User opens Dashboards → clicks "New Dashboard"
2. `DashboardEditor` provides a grid layout to add charts as widgets
3. Charts are referenced by ID and rendered inline with their saved configurations
4. Dashboards support draft/published states, tags, and favorites

---

## Scripts

| Command | Description |
|---|---|
| `npm run dev` | Start Vite dev server (default: `http://localhost:5173`) |
| `npm run build` | Production build to `dist/` |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run ESLint |

---

## Environment

The client reads API configuration from `src/core/config/env.js`. The backend API defaults to `http://localhost:5000`.

---

## Docker

The client includes a `Dockerfile` and `nginx.conf` for production deployment. The Docker build:

1. Installs dependencies and runs `vite build`
2. Copies the `dist/` output to an Nginx container
3. Serves the SPA on port `80` (mapped to `3000` via docker-compose)
