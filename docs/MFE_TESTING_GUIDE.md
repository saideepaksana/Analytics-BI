# MFE Testing Guide

This guide validates that microfrontend scaffolding works and that existing functionality is preserved.

## Prerequisites
- npm install
- backend dependencies available (MongoDB + Redis if exercising ingestion/query flows)

## A. Baseline Safety Check (Monolith)

1. Start baseline app:
   - npm run dev
2. Verify key flows still work:
   - Login/Signup
   - Ingestion upload screen opens
   - Datasets page loads
   - Charts and dashboards pages load
   - Settings page saves preferences

## B. MFE Stack Check

1. Start backend:
   - npm run dev:server
2. Start remotes + host:
   - npm run dev:mfe
3. Open host:
   - http://localhost:5173

## C. Route-Level Remote Verification

Visit each route in host and confirm no runtime errors:
- /auth/login
- /auth/signup
- /app/home
- /app/analytics/charts
- /app/analytics/dashboards
- /app/data/ingestion
- /app/data/datasets
- /app/data/review
- /app/tools/settings

## D. Cross-Flow Verification

1. Login in /auth/login
2. Navigate to /app/data/datasets (should be accessible)
3. Navigate to /app/analytics/charts (should load chart module)
4. Open /app/tools/settings and save preferences
5. Click Sign out in host sidebar and verify redirect to /

## E. Build Verification

Run:
- npm run build -w apps/client
- npm run build -w apps/host
- npm run build -w apps/mfe-auth
- npm run build -w apps/mfe-analytics
- npm run build -w apps/mfe-data-mgmt
- npm run build -w apps/mfe-tools

All should complete successfully. Chunk size warnings are acceptable for now.

## F. Failure Isolation Test (Optional)

1. Stop one remote (for example mfe-analytics)
2. Reload /app/analytics/charts in host
3. Verify host error boundary shows fallback and host remains alive

## G. Pass Criteria

- Existing monolith flow unchanged.
- Host and each remote route load without crash.
- Sign-in/sign-out path works through host.
- All build commands pass.
