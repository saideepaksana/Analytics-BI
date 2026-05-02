# iframe Embed for Live Dashboards - Implementation Plan

**User Story:** Generates iframe embed code so dashboards can be displayed inside other portals or websites as live analytics.

**Created:** May 2, 2026  
**Status:** Planning Phase  
**Priority:** P1 (High Value - Scheduled Exports & Integrations)

---

## Overview

This feature allows users to embed published dashboards as live iframes in external websites/portals. The embedded dashboard:
- Displays real-time data updates via WebSocket/Socket.io
- Uses secure token-based authentication
- Respects dashboard filters and configurations
- Works independently without requiring full application context

---

## Task Breakdown

### ✅ TASK 1: Backend - Secure Embed Token Generation & Validation

**Status:** Partially Complete (basic stub exists)  
**Location:** [/apps/server/src/api/export/exportController.js](../../apps/server/src/api/export/exportController.js#L191)

#### 1.1 Create Embed Token Service
- [ ] Create `src/services/embedTokenService.js`
  - Generate JWT tokens (replace current base64 approach)
  - Include: `dashboardId`, `userId`, `iat`, `exp`, `scope` (view-only)
  - Token expiration: configurable (default 24 hours)
  - Support token refresh mechanism
  - Implement token revocation list (optional)

#### 1.2 Enhance Token Validation Middleware
- [ ] Create middleware: `src/middleware/embedTokenAuth.js`
  - Verify JWT signature
  - Check token expiration
  - Validate dashboard ownership/access permissions
  - Rate limit embed requests
  - Log embed access for audit trail

#### 1.3 Update Export Controller
- [ ] Modify `generateEmbedToken()` endpoint
  - Accept dashboard ID and optional settings (filters, expiration)
  - Validate user owns/can share dashboard
  - Generate secure JWT token
  - Return: `{ token, embedUrl, iframeSnippet, expiresAt }`
  - Add option to generate multiple embed links with different permissions

#### 1.4 Create Embed Access Endpoint
- [ ] Add `GET /embed/:dashboardId` endpoint
  - Validate embed token from query param
  - Check dashboard published status
  - Return dashboard data + metadata for embed mode
  - Support CORS headers for cross-origin requests

#### 1.5 Database Schema Updates (Embed Tracking)
- [ ] Extend Dashboard model to include:
  - `embedSettings: { isEmbeddable: Boolean, maxTokens: Number }`
  - `embedTokens: [{ token, createdAt, expiresAt, revokedAt }]`
- [ ] Create EmbedAccessLog collection:
  - Track: dashboardId, tokenHash, accessTime, referer, ip
  - Retention: 90 days

---

### ✅ TASK 2: Frontend - Embed Page Component

**Location:** New file needed  
**Target:** `apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx`

#### 2.1 Create Embed-Specific Dashboard View
- [ ] Build `EmbedDashboard.jsx` component
  - Minimal UI (no navbar, sidebar, edit toolbar)
  - Read-only mode only
  - Embedded mode indicator (optional)
  - Full-screen option
  - Responsive design (works in iframes)

#### 2.2 Token Validation on Client
- [ ] Add token extraction from URL query params
  - Validate token format
  - Pass to API headers: `Authorization: Bearer <token>`
  - Handle expired/invalid tokens with user-friendly error
  - Implement token refresh if needed

#### 2.3 Embed Mode Features
- [ ] Filter controls (if dashboard allows)
  - Apply filters via URL params
  - Sync filter state with WebSocket
- [ ] Chart interactions
  - Drill-down (if configured)
  - Export to CSV (if allowed)
  - Tooltips and legends
- [ ] Hide edit/publish buttons in embed mode
- [ ] Responsive container sizing
  - Auto-fit to parent iframe dimensions

#### 2.4 Live Data Updates
- [ ] Connect to WebSocket with embed token
  - Authenticate socket connection with bearer token
  - Subscribe to dashboard data change events
  - Re-fetch affected charts on data update
  - Handle disconnect/reconnect gracefully

---

### ✅ TASK 3: API Endpoints for Embed Management

**Location:** [/apps/server/src/export/exportRoutes.js](../../apps/server/src/export/exportRoutes.js)

#### 3.1 Embed Token CRUD
- [ ] `POST /embed/token` - Generate new embed token
  ```
  Request: { dashboardId, expirationHours, allowedOrigins }
  Response: { token, embedUrl, iframeSnippet, expiresAt }
  ```

- [ ] `GET /embed/tokens/:dashboardId` - List active tokens for dashboard owner
  ```
  Response: [{ token (masked), createdAt, expiresAt, revokedAt, accessCount }]
  ```

- [ ] `DELETE /embed/token/:tokenId` - Revoke token
  ```
  Response: { success, message }
  ```

#### 3.2 Embed Access Endpoint
- [ ] `GET /embed/:dashboardId` - Access embedded dashboard
  ```
  Query: ?token=<jwt>&filters=<json>
  Response: { dashboard, charts, filters, metadata }
  Requires: Valid token in Authorization header
  ```

#### 3.3 Embed Metrics (Optional)
- [ ] `GET /embed/analytics/:dashboardId` - Token usage analytics
  ```
  Response: { totalAccesses, uniqueOrigins, topReferers, accessTrend }
  ```

---

### ✅ TASK 4: WebSocket/Socket.io Updates for Embed Mode

**Location:** [/apps/server/src/core/socketManager.js](../../apps/server/src/core/socketManager.js) (or create if missing)

#### 4.1 Embed Token Authentication in Socket.io
- [ ] Validate embed token during socket handshake
  ```javascript
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    // Validate token, reject if invalid
  });
  ```

#### 4.2 Dashboard Change Events
- [ ] Emit events when source data updates:
  - `dashboard:data-update` - specific chart data changed
  - `dashboard:filter-update` - filter applied
  - `dashboard:chart-added/removed` - dashboard structure changed
- [ ] Subscribers receive only data for allowed dashboard
- [ ] Namespace event to prevent data leaks: `/embed/:dashboardId`

#### 4.3 Embed Mode Socket Connection
- [ ] Client connects with: `socket.io?token=<jwt>`
- [ ] Server validates token before allowing subscriptions
- [ ] Disconnect unauthorized sockets

---

### ✅ TASK 5: Security Hardening

**All locations**

#### 5.1 Token Security
- [ ] Use HMAC-SHA256 for token signing
- [ ] Store token secrets in environment variables (never in code)
- [ ] Rotate signing keys periodically
- [ ] Hash token before storing in database
- [ ] Support token blacklisting/revocation

#### 5.2 Origin Validation (CORS)
- [ ] Store allowed origins per embed token
- [ ] Validate HTTP `Referer` header matches allowed origins
- [ ] Set restrictive CORS headers for embed endpoints
  ```
  Access-Control-Allow-Origin: <specific-origin>
  Access-Control-Allow-Methods: GET
  X-Frame-Options: ALLOWALL
  ```

#### 5.3 Rate Limiting
- [ ] Rate limit embed access per token (e.g., 1000 req/hour)
- [ ] Block requests from suspicious patterns (bot detection)
- [ ] Log failed authentication attempts

#### 5.4 Data Privacy
- [ ] Embed endpoints return **only** dashboard data (no user info)
- [ ] Filter sensitive metadata (creation user, revision history)
- [ ] Audit log all embed accesses
- [ ] Implement IP-based access restrictions (optional)

---

### ✅ TASK 6: Frontend - Embed Code Generator UI

**Location:** [/apps/client/src/modules/dashboard/components/DashboardEditor.jsx](../../apps/client/src/modules/dashboard/components/DashboardEditor.jsx#L1318)

#### 6.1 Add Embed Button to Export Menu
- [ ] Location: Export dropdown next to "Export" button
- [ ] Label: "Generate Embed Code"
- [ ] Icon: `<Code size={14} />`

#### 6.2 Create Embed Modal/Dialog
- [ ] Modal: `EmbedCodeModal.jsx`
- [ ] Show iframe code snippet (with copy button)
- [ ] Display embed URL
- [ ] Allow configuration:
  - [ ] Expiration time selector
  - [ ] Allowed origins input
  - [ ] Include filters checkbox
  - [ ] Width/height preset options
- [ ] Generate QR code for quick testing (optional)
- [ ] Show usage analytics if available

#### 6.3 Manage Embed Tokens
- [ ] List existing tokens (masked)
- [ ] Revoke inactive tokens
- [ ] View access logs per token
- [ ] Regenerate tokens if compromised

#### 6.4 Copy-to-Clipboard Functionality
- [ ] One-click copy for iframe snippet
- [ ] Notification on copy success
- [ ] Support custom iframe sizes

---

### ✅ TASK 7: Live Data Updates in Embed

**Location:** [/apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx](../../apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx) (new file)

#### 7.1 Real-Time Data Sync
- [ ] Subscribe to `dashboard:data-update` events via Socket.io
- [ ] On data change:
  - [ ] Fetch updated chart data
  - [ ] Re-render affected widgets only (not full dashboard refresh)
  - [ ] Show "updating..." indicator briefly

#### 7.2 Handle Disconnections
- [ ] Detect socket disconnect
- [ ] Show "Offline" banner
- [ ] Auto-reconnect with exponential backoff
- [ ] Warn if embed becomes stale (data not refreshed for N seconds)

#### 7.3 Performance Optimization
- [ ] Debounce rapid data updates
- [ ] Batch multiple chart updates into single render
- [ ] Lazy-load charts outside viewport
- [ ] Cache static dashboard metadata

---

### ✅ TASK 8: Testing & Documentation

#### 8.1 Backend Tests
- [ ] Token generation and validation
- [ ] Permission checks (only owner can embed)
- [ ] Token expiration logic
- [ ] Socket.io authentication
- [ ] Rate limiting
- [ ] CORS header validation

#### 8.2 Frontend Tests
- [ ] Embed page loads with valid token
- [ ] Rejects invalid/expired tokens
- [ ] Live updates work correctly
- [ ] Responsive design on various iframe sizes
- [ ] Filter application in embed mode

#### 8.3 Integration Tests
- [ ] End-to-end embed flow:
  1. Generate token
  2. Copy iframe snippet
  3. Embed in external HTML
  4. Load and display dashboard
  5. Receive live updates
- [ ] Cross-origin requests work
- [ ] Token refresh mechanism

#### 8.4 Documentation
- [ ] API documentation for embed endpoints
- [ ] Frontend integration guide (how to use the iframe snippet)
- [ ] Security best practices
- [ ] Troubleshooting guide
- [ ] Code examples for various platforms (React, Vue, plain HTML)

---

## Implementation Priority & Phases

### Phase 1 (Weeks 1-2): Core Backend & Security
1. Embed token service with JWT
2. Token validation middleware
3. Backend endpoints (token generation, embed access)
4. Database schema updates
5. Security hardening (CORS, rate limiting)

### Phase 2 (Weeks 3-4): Frontend Embed Page
1. EmbedDashboard component
2. Token validation on client
3. Minimal UI (read-only mode)
4. Socket.io connection with token auth

### Phase 3 (Week 5): Live Updates
1. Real-time data sync via WebSocket
2. Debouncing and performance optimization
3. Disconnect handling and reconnection

### Phase 4 (Week 6): UI & Polish
1. Embed code generator modal
2. Token management interface
3. Copy-to-clipboard and snippets
4. QR code generation (optional)

### Phase 5 (Week 7-8): Testing & Docs
1. Comprehensive test coverage
2. API documentation
3. Integration guide
4. Security audit

---

## Current Code Status

### ✅ Already Exists
- `generateEmbedToken()` in [exportController.js](../../apps/server/src/api/export/exportController.js#L191)
  - Basic implementation (needs security upgrade to JWT)
- Export routes already set up in [exportRoutes.js](../../apps/server/src/export/exportRoutes.js)
- Dashboard publishing and access control in place

### ❌ Needs to be Built
- Embed token validation middleware
- JWT-based token service
- Embed-specific dashboard view
- Token management UI
- Socket.io embed authentication
- Live update mechanism
- Embed code generator modal
- Access logging and analytics

---

## Technical Decisions

### Token Strategy
- **Use JWT** instead of base64 encoding for security
- Payload: `{ dashboardId, userId, scope: 'view', iat, exp, sub: 'embed' }`
- Sign with HS256 algorithm
- Store token hash in DB for revocation

### CORS & Cross-Origin
- Set `Access-Control-Allow-Origin` per token (configurable origins)
- Set `X-Frame-Options: ALLOWALL` for embed endpoints
- Validate `Referer` header for extra security layer

### Real-Time Updates
- Use existing Socket.io infrastructure
- Namespace: `/embed` for embed-specific events
- Authenticate socket handshake with JWT token
- Emit dashboard change events at data/chart level

### Embed UI
- Minimal, distraction-free interface
- Full-screen option for better viewing experience
- Responsive container sizing
- Dark/light theme support (inherited from dashboard)

---

## Success Criteria

- ✅ Users can generate secure embed tokens for published dashboards
- ✅ External websites can embed dashboards using generated iframe snippet
- ✅ Embedded dashboards display live data updates in real-time
- ✅ Embed tokens can be revoked/regenerated by dashboard owner
- ✅ All embed requests are authenticated and logged
- ✅ Cross-origin requests work correctly with CORS headers
- ✅ Embed view is read-only (no editing possible)
- ✅ Performance impact on main application is minimal

---

## Files to Create/Modify

### New Files to Create
```
src/services/embedTokenService.js
src/middleware/embedTokenAuth.js
src/models/EmbedAccessLog.js (if using separate collection)
apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx
apps/client/src/modules/dashboard/components/EmbedCodeModal.jsx
apps/client/src/hooks/useEmbedSocket.js (if needed)
docs/EMBED_API_DOCUMENTATION.md
docs/EMBED_INTEGRATION_GUIDE.md
```

### Files to Modify
```
src/api/export/exportController.js (enhance generateEmbedToken)
src/export/exportRoutes.js (add new routes)
src/models/Dashboard.js (add embedSettings, embedTokens)
src/core/socketManager.js (add embed auth)
apps/client/src/modules/dashboard/components/DashboardEditor.jsx (add embed button)
apps/client/src/modules/dashboard/pages/DashboardView.jsx (detect embed mode)
```

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Token theft/exposure | Use HTTPS only, store secrets in env vars, implement token rotation |
| Unauthorized data access | Validate token on every request, check dashboard permissions, audit logs |
| Performance degradation | Implement rate limiting, batch socket updates, lazy-load charts |
| Cross-origin issues | Properly configure CORS, validate origins, test on multiple domains |
| Token expiration UX | Implement token refresh, show warnings before expiry, provide clear error messages |

---

## Next Steps

1. **Approve this plan** with stakeholders
2. **Create epics/stories** in project management tool
3. **Assign tasks** to team members
4. **Begin Phase 1** implementation
5. **Schedule security review** before going live

