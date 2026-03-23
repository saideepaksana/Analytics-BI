# Analytics BI

An Analytics/BI web application with:

- **Client:** React + Vite
- **Server:** Node.js + Express
- **Database:** MongoDB (GridFS for uploaded file storage)
- **Real-time:** Socket.IO (client + server dependency present)

> Current implemented backend focus: **File ingestion / upload handler** that streams CSV/Excel files into MongoDB GridFS.

---

## Repository layout

- `apps/client` — React + Vite frontend
- `apps/server` — Express backend (upload + ingestion)
- `packages/*` — shared packages (workspace-ready; may be WIP)
- `logs/` — logs (if used locally)
- `SRS.pdf` — software requirements/spec
- `Sprint 1 Presentation.pdf` — sprint documentation
- `Structure.md`, `tree.md`, `sprint1.md` — project notes/docs

---

## Version control (recommended)

- GitHub repository with `main` as protected branch
- Feature branches for functional work: `feature/*`, `fix/*`, `chore/*`
- Pull Request workflow (review + approvals before merge)
- PR checks: lint, test, build
- Semantic version tags (e.g. `v0.1.0`)
- `CHANGELOG.md` or release notes for published versions

## Deployment & tools (current + path to deploy)

### Current stack in repo
- Node.js + Express (backend)
- React + Vite (frontend)
- MongoDB (local or Atlas), Mongoose ODM
- GridFS for file ingestion storage
- Socket.IO for realtime updates
- Multer for upload multipart handling
- `fast-csv`, `exceljs` parser support
- npm workspaces structure with root scripts

### Recommended deployment roadmap
1. Local development
   - `npm install`
   - `npm run lint` + `npm test`
   - `npm run dev` (client + server concurrent)
2. Containerize (Sprint 3)
   - Dockerfiles for client/server, `docker-compose.yml` with MongoDB
   - `docker compose up --build`
3. Cloud deployment (Sprint 4)
   - Use MongoDB Atlas, set env vars securely
   - Run health check endpoint and log monitoring
4. Production hardening
   - HTTPS + reverse proxy (Nginx / ALB)
   - CI/CD (GitHub Actions pipeline), rollbacks, alerting

---

## Tech stack

### Frontend (`apps/client`)
- React (Vite)
- Axios
- Socket.IO client

### Backend (`apps/server`)
- Express
- Multer (multipart uploads)
- MongoDB + Mongoose
- **GridFS** for large file storage
- CSV/Excel parsing libraries: `fast-csv`, `exceljs`
- Socket.IO

---

## Prerequisites

- **Node.js** (recommended: 18+)
- **MongoDB** running locally or a connection string to a MongoDB instance
- `mongosh` for inspecting the DB

---

## Getting started

### 1) Install dependencies
From the repo root:

```bash
npm install
```

### 2) Configure environment variables (server)
Create a file at:

`apps/server/.env`

Example:

```env
MONGO_URI=mongodb://localhost:27017/analytics-bi
PORT=5000
```

### 3) Start MongoDB
If using local MongoDB (Linux example):

```bash
sudo systemctl start mongodb
```

### 4) Run the app (client + server)
From the repo root:

```bash
npm run dev
```

Or run separately:

```bash
npm run dev:client
npm run dev:server
```

---

## Backend: File Upload / Ingestion (current progress)

### Location
Backend ingestion layer lives under:

`apps/server/`

### Key components (server)
- Express server bootstrap — `apps/server/src/index.js`
- MongoDB connection — `apps/server/src/core/db.js`
- GridFS storage — `apps/server/src/core/storage.js`
- File upload controller — `apps/server/src/api/upload/upload.controller.js`
- Upload route + Multer middleware — `apps/server/src/api/upload/upload.routes.js`

---

## API

### Upload a file
**POST** `/api/upload`  
**Content-Type:** `multipart/form-data`

**Form fields**
- `file` — CSV or Excel file
- `mode` — `new | append | replace`

**Behavior**
- Uploaded files are streamed directly into MongoDB using **GridFS** for scalable storage.

---

## Database storage

Uploaded files are stored in MongoDB collections (GridFS):

- `analytics-bi.uploads.files`
- `analytics-bi.uploads.chunks`

---

## Scripts

### Root
- `npm run dev` — start client + server
- `npm run dev:client` — start frontend only
- `npm run dev:server` — start backend only

### Server (`apps/server`)
- `npm run dev` — start with nodemon
- `npm start` — start with node

### Client (`apps/client`)
- `npm run dev` — start Vite dev server
- `npm run build` — production build
- `npm run preview` — preview build

---

## Project status

This repository contains sprint documents and an initial implementation of the backend ingestion/upload flow. Additional BI/analytics features (dashboards, transformations, datasets, etc.) may be under active development.

---

## Contributing

1. Fork the repo
2. Create a feature branch
3. Commit your changes
4. Open a pull request

---

## License

Currently: None
