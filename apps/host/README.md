# Host App (Microfrontend Shell)

This is a non-breaking host shell for incremental migration.

- Existing production behavior remains in apps/client.
- Host loads remote MFEs via Module Federation.
- Remote implementations currently wrap existing client modules to preserve behavior.

## Run

- npm run dev -w apps/host

## Build

- npm run build -w apps/host
