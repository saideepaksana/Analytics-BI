# Microfrontend Deployment Guide (Safe Rollout)

This repo currently supports an incremental migration strategy:
- Existing app: apps/client (unchanged)
- New MFE shell: apps/host + remotes

## 1. Local Development

### existing monolith (current default)
- npm run dev
- frontend: http://localhost:5173
- backend: http://localhost:5000

### new MFE stack
- npm run dev:server
- npm run dev:mfe
- host: http://localhost:5173
- auth: http://localhost:5001
- analytics: http://localhost:5002
- data mgmt: http://localhost:5003
- tools: http://localhost:5004

Note: Keep ports fixed so host federation remotes resolve correctly.

## 2. Build Validation

Run all builds before release:
- npm run build -w apps/client
- npm run build:mfe

## 3. Rollout Strategy

1. Keep apps/client as active production app.
2. Deploy host/remotes to staging and run parity checks.
3. Enable canary traffic to host stack after parity sign-off.
4. Keep rollback path to apps/client until all parity tests pass.

## 4. Rollback

If host/remotes fail:
1. Route traffic back to apps/client deployment.
2. Keep backend unchanged.
3. Fix remote and redeploy only affected microfrontend.

## 5. Operational Notes

- No backend API changes are required for this migration step.
- Shared auth still uses existing localStorage-based auth utility.
- Existing client functionality remains the baseline reference.
