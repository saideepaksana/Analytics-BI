# App Readiness Check - 2026-03-17

## Request
Identify what is not done for the app to work, fix blockers, and document all edits.

## Critical Issues Found
1. Root backend dev script pointed to a placeholder file:
   - `package.json` used `node apps/server/src/core/server.js`
   - `apps/server/src/core/server.js` is only commented sample code, so backend never actually started.

2. Unresolved merge conflict markers in DB connection file:
   - `apps/server/src/core/db.js` contained `<<<<<<<`, `=======`, `>>>>>>>`
   - This can break runtime and indicates unfinished merge work.

## Changes Applied
1. Fixed backend start script in root `package.json`:
   - From: `node apps/server/src/core/server.js`
   - To: `npm run dev -w apps/server`

2. Resolved merge conflict in `apps/server/src/core/db.js`:
   - Kept a safe default Mongo URI fallback:
     - `mongodb://127.0.0.1:27017/analytics-bi`
   - Removed all conflict markers.

## Verification Run
Executed: `npm run dev` from workspace root.

Observed:
- Vite client started successfully (on `http://localhost:5174/`, because `5173` was already occupied).
- Server started successfully on port `5000`.
- MongoDB connection and GridFS initialization succeeded.

## Remaining Not-Done / Setup Risks
1. No committed env template found for backend config (`apps/server/.env.example` not present).
2. Port collisions are possible (client switched to `5174` automatically during this run).
3. Root `dev` uses `&` process join, which is less robust for cross-shell/Windows usage.

## Recommended Next Improvements
1. Add `apps/server/.env.example` with required vars (`MONGO_URI`, `PORT`, parser options).
2. Add a root script that uses `concurrently` for stable multi-process dev startup.
3. Add a quick health-check endpoint test to confirm API + DB readiness in CI.
