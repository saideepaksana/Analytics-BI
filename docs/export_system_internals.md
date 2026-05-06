# Export System Internals

This document provides a technical overview of how the Export System works in the Analytics BI application, focusing specifically on **Export History** and **Scheduled Exports**.

The export system leverages a background worker architecture using **BullMQ** (backed by Redis) for job queuing, **MongoDB** for persistence, and **Puppeteer** for visual rendering.

---

## 1. Export History (`ExportLog`)

The Export History feature tracks the lifecycle of every export (raw data or visual dashboards) and provides a permanent record for users to view past exports or download previously generated files.

### 1.1. Data Model
The `ExportLog` Mongoose model (`apps/server/src/models/exportLog.js`) is the source of truth for historical exports. It tracks:
- **Identifiers**: `jobId` (maps to BullMQ), `datasetId`, `dashboardId`.
- **Status & Format**: `format` (e.g., `csv`, `pdf`, `png`), `status` (`processing`, `completed`, `failed`), `failureReason`.
- **Metrics & Artifacts**: `recordCount`, `filename`, `exportState` (for dashboards).
- **Metadata**: `exportedBy`, `exportedAt`.

### 1.2. Export Lifecycle

1. **Initialization & Queuing**: 
   When a user requests an export via the API (`exportController.js`), a UUID is generated for the `jobId`. The request is pushed to either the `rawExportQueue` or `dashboardExportQueue` in BullMQ.
2. **Worker Processing**:
   The respective worker (`rawExportWorker.js` or `visualExportWorker.js`) picks up the job.
   - **Upserting the Log**: As soon as processing starts, the worker creates or updates an `ExportLog` document using `findOneAndUpdate` with `upsert: true`. The status is set to `processing`.
   - **File Generation**: The worker generates the export (e.g., querying data, streaming to CSV/Excel, or launching Puppeteer for PDF/PNG rendering) and saves it to a local temporary directory (`/tmp/analytics-bi/exports/raw` or `/tmp/analytics-bi/exports/visual`).
   - **Completion/Failure**: 
     - On success, the worker updates the `ExportLog` to `completed` and sets the `filename` and `recordCount`.
     - On failure, the `ExportLog` is updated to `failed` and records the `failureReason`.

### 1.3. Status Polling and Fallback
Clients poll the `/api/export/:jobId/status` endpoint to track progress.
- The controller first queries BullMQ (`rawExportQueue.getJob` / `dashboardExportQueue.getJob`) to get real-time progress and state.
- **Fallback Mechanism**: BullMQ periodically cleans up completed jobs. If the job is missing from Redis, the controller queries the persistent `ExportLog` in MongoDB. This ensures users can still retrieve the status and download link of older, completed exports.

### 1.4. History Endpoints
Endpoints like `/api/export/dashboard/:dashboardId/history` retrieve the latest 50 entries from the `ExportLog` collection. The controller dynamically appends a `downloadUrl` to the response by building a URL pointing to the `filename`.

### 1.5. Artifact Cleanup
To prevent disk exhaustion, `worker.js` runs a `cleanupOldExports` interval every 15 minutes. It scans the `/tmp/.../exports` directories and securely unlinks any physical files older than 1 hour. Because the files expire, older `ExportLog` entries serve purely as an audit history rather than active downloads.

---

## 2. Scheduled Exports (`ScheduledExport`)

Scheduled Exports allow users to configure recurring visual snapshots of their dashboards, delivered automatically via email.

### 2.1. Data Model
The `ScheduledExport` Mongoose model (`apps/server/src/models/ScheduledExport.js`) stores the configuration for a recurring export:
- **Target**: `dashboardId`, `name`, `selectedTabs`.
- **Timing**: `frequency` (`daily`, `weekly`, `monthly`, `test`), `timezone`.
- **Delivery**: `format` (`pdf`, `png`), `recipients` (array of emails).
- **Job Management**: `repeatJobKey` (the BullMQ identifier for the recurring job), `status` (`active`, `paused`), `lastRunAt`, `nextRunAt`.

### 2.2. Creating a Schedule
When a schedule is created (`exportController.createSchedule`):
1. The requested `frequency` is mapped to a Cron expression.
2. The schedule is saved to MongoDB.
3. A repeatable job is added to the BullMQ `scheduledExportQueue` using the Cron expression.
4. BullMQ returns a `repeatJobKey` (a unique string representing the cron job). This key is saved back to the `ScheduledExport` document. This is critical for future modifications or deletions of the schedule.

### 2.3. Execution Flow (`scheduledExportWorker.js`)
When the cron schedule triggers, BullMQ picks up the job and executes `runScheduledExport`:
1. **Verification**: The worker fetches the `ScheduledExport` from MongoDB. If the schedule is deleted or `paused`, it exits gracefully.
2. **State Preparation**: It loads the target `Dashboard` and extracts its `_rawFrontendState` (layout, tabs, filters). This represents the "frozen state" of the dashboard.
3. **Triggering Visual Export**: The worker constructs a mock export payload and directly invokes `runVisualExport()` (the exact same underlying function used by manual dashboard exports).
4. **Email Delivery**: Once the PDF or PNG is generated:
   - If the format is **PNG**, the image is read and attached as an inline CID (`cid:dashboard-image-X`), embedding the image directly into the HTML body of the email.
   - If the format is **PDF**, the file is added as a standard email attachment.
   - The `emailService` uses nodemailer to dispatch the email to all configured `recipients`.
5. **Update Audit**: The worker updates the schedule's `lastRunAt` timestamp.

### 2.4. Modifying and Deleting Schedules
If a user deletes a schedule (`exportController.deleteSchedule`):
- The API retrieves the `repeatJobKey` from the `ScheduledExport` document.
- It calls `scheduledExportQueue.removeRepeatableByKey(repeatJobKey)` to stop BullMQ from generating future jobs.
- The document is then removed from MongoDB.
