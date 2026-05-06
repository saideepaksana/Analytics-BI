# Analytics BI Documentation

This folder is the canonical technical documentation for the Analytics BI platform. It is written for engineers who are new to the codebase and need a full, accurate system walkthrough.

## How to use this documentation

1. Start with the system overview and data flows in `ARCHITECTURE.md`.
2. Use `Structure.md` to understand the monorepo layout and module boundaries.
3. Use `SERVER.md` for backend architecture, API surface, and operational details.
4. Use `DOCUMENTATION.md` for the comprehensive single-file reference (features, API, models, queues, config, auth, and glossary).
5. Use domain-specific docs for deeper details as they are added.

## System snapshot

- Monorepo with React 19 + Vite 7 frontend(s) and an Express 5 API server.
- MongoDB stores datasets, chart and dashboard metadata, and export history.
- Redis backs BullMQ queues for ingestion and export pipelines.
- Real-time progress and embeds use Socket.IO.
- Microfrontends (host + remotes) exist alongside a monolith client for incremental migration.

## Quick start (development)

Prerequisites:
- Node.js 20+
- MongoDB 6+
- Redis 7+
- npm 9+

Install dependencies:
```bash
npm install
```

Minimal backend environment:
```env
# apps/server/.env
MONGO_URI=mongodb://localhost:27017/analytics-bi
PORT=5000
REDIS_HOST=127.0.0.1
REDIS_PORT=6379
CORS_ORIGIN=http://localhost:5173
```

Run the stack:
```bash
npm run dev
```

Run services individually:
```bash
npm run dev:client
npm run dev:server
```

Run microfrontends:
```bash
npm run dev:mfe
```

## Ports and local URLs

- Client (monolith or host shell): http://localhost:5173
- API server: http://localhost:5000
- MFE remotes:
  - Auth: http://localhost:5001
  - Analytics: http://localhost:5002
  - Data Management: http://localhost:5003
  - Tools: http://localhost:5004

## Terminology

- Dataset: A single uploaded file and its derived records.
- Metadata: Dataset-level schema, inference, and relationship info.
- CleanRecord: Validated, normalized rows produced by the DTS pipeline.
- DLQRecord: Quarantined rows that failed structural or semantic validation.
- Chart: A saved visualization definition based on dataset queries.
- Dashboard: A collection of charts arranged into tabs and layout grids.
- ExportLog: Audit record for export jobs and artifacts.
- ScheduledExport: A recurring visual export configuration.

## Documentation map

| File | Description |
|------|-------------|
| `ARCHITECTURE.md` | System diagrams, data flows, tech stack, MFE structure, and scalability |
| `Structure.md` | Repository and module layout |
| `SERVER.md` | Backend architecture, full API surface, and operational details |
| `DOCUMENTATION.md` | Comprehensive single-file reference covering all features, models, queues, config, and auth |
| `SRS.pdf` | Software Requirements Specification |
