# MFE API Contract (Incremental Migration)

This contract is intentionally minimal and non-breaking. The current monolith in apps/client remains the source of truth while MFEs are extracted as wrappers.

## Remote Exposure Map

### host remotes
- auth -> http://localhost:5001/assets/remoteEntry.js
- analytics -> http://localhost:5002/assets/remoteEntry.js
- dataMgmt -> http://localhost:5003/assets/remoteEntry.js
- tools -> http://localhost:5004/assets/remoteEntry.js

### mfe-auth exposes
- ./LoginPage
- ./SignUpPage

### mfe-analytics exposes
- ./ChartsPage
- ./DashboardPage

### mfe-data-mgmt exposes
- ./IngestionPage
- ./DatasetsPage
- ./DataReviewPage

### mfe-tools exposes
- ./SettingsPage
- ./SqlEditorPage
- ./BuilderPage

## Shared Singletons

The following dependencies are shared as singletons in federation config:
- react
- react-dom
- react-router-dom

## Shared Library Contract

Package: @analytics-bi/shared-lib

### exports
- globalEventBus
- EVENTS
- API_BASE_URL, SOCKET_URL
- apiClient, getRequestErrorMessage
- AUTH_EVENTS
- getCurrentUser, getDefaultPreferences, getEffectiveTheme
- login, signup, logout
- updateCurrentUserProfile, updateCurrentUserPreferences

## Backward Compatibility Rule

- Existing routes and behavior in apps/client must remain unchanged.
- MFE wrappers should import and reuse existing modules/services from apps/client.
- Any behavior changes must be introduced only after parity verification.
