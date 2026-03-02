# Analytics BI

---

## Backend Progress –File Handler

### Overview

The backend ingestion layer has been implemented under:


apps/server/


This module is responsible for handling file uploads and persisting them into MongoDB using GridFS for scalable storage.

---

### Implemented Components

The following backend components have been written:

- **Express server bootstrap** – `src/index.js`
- **MongoDB connection module** – `src/core/db.js`
- **GridFS storage layer** – `src/core/storage.js`
- **File upload controller** – `src/api/upload/upload.controller.js`
- **Upload route with Multer middleware** – `src/api/upload/upload.routes.js`

---

### Upload Endpoint


POST /api/upload


**Content-Type:** `multipart/form-data`

**Form fields:**

- `file` → CSV or Excel file  
- `mode` → `new | append | replace`

Uploaded files are streamed directly into MongoDB using GridFS.

---

### Required Setup

Before running the backend server:

1. Install dependencies:


cd apps/server
npm install


2. Create a `.env` file inside `apps/server`:


MONGO_URI=mongodb://localhost:27017/analytics-bi
PORT=5000


3. Ensure MongoDB is running:


sudo systemctl start mongodb


4. Start the development server:


npm run dev


---

### Required Tools

- Node.js (v18+)
- MongoDB (local instance)
- mongosh (for database inspection)
- nodemon (installed as a development dependency)

---

### Database Storage Structure

Uploaded files are stored in the following MongoDB collections:


analytics-bi → uploads.files
analytics-bi → uploads.chunks


---
