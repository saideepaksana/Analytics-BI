# iframe Embed Feature - Executive Summary & What To Build

**Document Date:** May 2, 2026  
**User Story:** Generate secure iframe embed code for dashboards with live analytics  

---

## What You Need to Build (Quick Summary)

The goal is to allow users to **embed published dashboards as live iframes in external websites**. The embedded dashboard should:

✅ Display data in read-only mode  
✅ Update in real-time when source data changes  
✅ Use secure token-based authentication  
✅ Respect origin/domain restrictions  
✅ Never expose sensitive data  

---

## The 3 Tasks Breakdown

### Task 1: Generate Secure Iframe Embed Code ✅

**What it means:**
Users click an "Export" button on a published dashboard, select "Generate Embed Code", and get an HTML `<iframe>` snippet they can paste into any website.

**What needs to be built:**

1. **Backend Endpoint:** `POST /embed/token`
   - User submits: dashboard ID, expiration time (1 day - 1 month)
   - Backend generates a secure JWT token (not base64!)
   - Returns HTML code:
     ```html
     <iframe src="https://analytics-bi.com/embed/dashboard-123?token=eyJhbGc..."
             width="100%" height="600" frameborder="0">
     </iframe>
     ```

2. **Frontend UI:** Modal in Dashboard Editor
   - Shows the generated iframe code
   - One-click copy button
   - Options: choose expiration, set allowed domains, customize width/height
   - Show a preview of the embedded dashboard

3. **Database:**
   - Store tokens on Dashboard model
   - Track who generated tokens, when they expire
   - Store allowed origins per token

### Task 2: Add Access/Token Validation for Embedded Views ✅

**What it means:**
Only allow dashboards to be viewed if the user has a valid token, and that token grants permission to view that specific dashboard.

**What needs to be built:**

1. **Token Validation Middleware** (`embedTokenAuth.js`)
   - Every embed request must include token in `Authorization: Bearer <token>` header
   - Verify token signature (JWT, not base64)
   - Check token hasn't expired
   - Check token hasn't been revoked
   - Check dashboard still exists and is published
   - Check request comes from an allowed domain (origin validation)

2. **CORS Security Headers**
   - Set `Access-Control-Allow-Origin` to only allowed domains
   - Set `X-Frame-Options: ALLOWALL` so iframe rendering works
   - Validate HTTP `Referer` header matches token settings

3. **Rate Limiting**
   - Max 1000 requests per hour per token (prevents abuse/DDoS)
   - IP-based rate limiting (detects suspicious patterns)

4. **Embed Access Route:** `GET /embed/:dashboardId`
   - Must have valid token
   - Returns only the dashboard data (charts, filters, metadata)
   - Does NOT return sensitive info (creator, revision history, settings)

5. **Token Management Endpoints**
   - List tokens for a dashboard (owner only)
   - Revoke/delete tokens (owner can disable old tokens)
   - View token usage statistics (how many times accessed, from where)

6. **Audit Logging**
   - Log every embed access: who (token), when, from where (IP/domain)
   - Keep 90-day history for compliance
   - Alert on suspicious patterns (high failed auth attempts)

### Task 3: Live Data Updates Without Manual Re-export ✅

**What it means:**
When data in the source database changes, embedded dashboards automatically update **without** the owner needing to manually re-export or refresh.

**What needs to be built:**

1. **WebSocket Connection for Embeds**
   - Embedded dashboard connects to server via Socket.io
   - Sends JWT token in socket handshake
   - Server validates token before accepting connection
   - Client subscribes to events: `dashboard:data-update`, `dashboard:filter-update`

2. **Event Broadcasting**
   - When source data changes (new rows added, existing updated), server detects it
   - Server queries affected charts
   - Server broadcasts `dashboard:data-update` event to all connected embed clients
   - Each chart that changed is included in the event

3. **Client-Side Real-Time Rendering**
   - Embedded dashboard receives data update event
   - Only affected charts are re-fetched (not entire dashboard)
   - Charts re-render with new data (animations smooth)
   - Show brief "updating..." indicator to user

4. **Offline & Reconnection Handling**
   - If connection drops, show "Offline" indicator
   - Auto-reconnect with backoff (1s → 32s)
   - When reconnected, refresh all chart data
   - Warn user if data is stale (no updates for 60+ seconds)

5. **Performance Optimization**
   - Batch multiple chart updates together (don't re-render after every event)
   - Debounce rapid updates (max 1 per second)
   - Lazy-load charts outside viewport
   - Cache static dashboard metadata

---

## What's Already Done vs What's Missing

### ✅ Already Exists
- Export functionality for PDF/PNG
- Dashboard publishing system
- Socket.io infrastructure for real-time features
- Basic embed token generation (but uses base64, not JWT)

### ❌ Needs to be Built

**Backend (40% of work):**
1. JWT token service (replace base64 approach)
2. Token validation middleware
3. Embed-specific endpoints
4. WebSocket authentication for embeds
5. Rate limiting and CORS headers
6. Audit logging for compliance
7. Token revocation system

**Frontend (35% of work):**
1. `EmbedDashboard` component (read-only dashboard view)
2. Modal to generate and copy embed code
3. Token management UI (revoke old tokens)
4. WebSocket connection with token auth
5. Real-time data update handling

**Testing & Docs (25% of work):**
1. Unit tests (token validation, permissions)
2. Integration tests (full embed flow)
3. Security tests (CORS, rate limiting, XSS)
4. API documentation
5. Integration guide for customers
6. Troubleshooting guide

---

## Technology Stack to Use

### Backend
- **JWT tokens** with HMAC-SHA256 signing
- **Redis** for token caching and revocation list
- **MongoDB** for storing token metadata
- **Express middleware** for auth and CORS
- **Socket.io** (already in use) for real-time updates

### Frontend
- **React hooks** for state management
- **Socket.io client** for WebSocket connection
- **React components** for embed page and modal
- **Responsive design** to work in any iframe size

### Security
- **HTTPS only** (no HTTP embeds)
- **Origin whitelist** per token (prevent misuse)
- **Rate limiting** per token (prevent abuse)
- **Audit logs** for compliance and debugging

---

## File Structure & What to Create

```
Backend Files to Create:
├── src/services/embedTokenService.js           (JWT generation)
├── src/middleware/embedTokenAuth.js            (Token validation)
├── src/models/EmbedAccessLog.js                (Audit logs)
└── Update: src/api/export/exportController.js  (Add embed endpoints)

Frontend Files to Create:
├── apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx
├── apps/client/src/modules/dashboard/components/EmbedCodeModal.jsx
├── apps/client/src/hooks/useEmbedSocket.js
└── Update: apps/client/src/modules/dashboard/components/DashboardEditor.jsx

Documentation Files (Already Created):
├── docs/IFRAME_EMBED_IMPLEMENTATION_PLAN.md    (Detailed tasks)
├── docs/IFRAME_EMBED_CHECKLIST.md              (Quick reference)
└── docs/IFRAME_EMBED_ARCHITECTURE.md           (Technical design)
```

---

## Implementation Timeline

```
Week 1-2:  Backend foundation (token service, validation, endpoints)
Week 3-4:  Frontend embed page and UI
Week 5-6:  Live updates and WebSocket integration
Week 7:    Testing and security hardening
Week 8:    Documentation and final review
```

**Total Effort:** 8 weeks | **Team Size:** 2-3 developers

---

## Security Considerations (MUST FOLLOW)

| What | Why | How |
|------|-----|-----|
| Use JWT, not base64 | Base64 is encoding, not encryption | Use HMAC-SHA256 with secret key |
| Validate origin | Prevent embedding on malicious sites | Check HTTP Referer header |
| Rate limit | Prevent DDoS/abuse | Max 1000 requests/hour per token |
| Revoke tokens | Disable compromised tokens | Add to blacklist in Redis |
| Audit logs | Compliance and debugging | Log all embed access attempts |
| HTTPS only | Prevent token interception | Require SSL/TLS |
| Expire tokens | Limit damage if token leaks | Default 24-hour expiration |
| Minimal data | Don't expose sensitive info | Filter out: user data, settings, history |

---

## Success Metrics

After implementation is complete:

- ✅ Users can generate embed tokens via UI (1 click)
- ✅ Generated iframes display dashboards in external websites
- ✅ Embedded dashboards show live data updates in real-time
- ✅ All embed requests are authenticated and logged
- ✅ Zero security vulnerabilities (security audit passes)
- ✅ Performance impact minimal (< 5% increase in API calls)
- ✅ CORS headers working (no browser errors)
- ✅ All tests passing (unit, integration, security)

---

## Current Code References

**Files that already have embed-related code:**

1. [exportController.js](../../apps/server/src/api/export/exportController.js#L191) - `generateEmbedToken()` function (basic, needs JWT upgrade)
2. [exportRoutes.js](../../apps/server/src/export/exportRoutes.js) - Route definitions
3. [DashboardEditor.jsx](../../apps/client/src/modules/dashboard/components/DashboardEditor.jsx#L1318) - Export button (add embed option here)

**Need to add:**
- Token validation middleware
- Embed-specific routes and endpoints
- EmbedDashboard component
- Real-time WebSocket handling

---

## Questions to Answer Before Starting

1. **Token Expiration:** How long should tokens last? (24h, 7d, 30d, custom?)
   - Recommendation: Default 24h, configurable up to 90d

2. **Domain Restrictions:** Should tokens work on any domain or specific ones?
   - Recommendation: Specific domains via whitelist

3. **Filter Support:** Should embedded dashboards allow filter changes?
   - Recommendation: Yes, but read-only filters (can't save new filters)

4. **Export in Embed:** Should users be able to export data from embedded dashboards?
   - Recommendation: Yes, CSV only (no PDF to prevent abuse)

5. **Usage Limits:** How many embed tokens per dashboard?
   - Recommendation: Max 10 active tokens, 1000 requests/hour per token

6. **Analytics:** Do you want to see who embeds your dashboards?
   - Recommendation: Yes, via dashboard > "Manage Embed Tokens" page

---

## Deliverables Checklist

Before marking feature as COMPLETE:

- [ ] All backend endpoints working
- [ ] All frontend components implemented
- [ ] Token generation and validation working
- [ ] Live updates working via WebSocket
- [ ] CORS headers correct
- [ ] Rate limiting enabled
- [ ] Audit logging implemented
- [ ] Unit tests written (>80% coverage)
- [ ] Integration tests pass
- [ ] Security tests pass
- [ ] Documentation complete
- [ ] Security audit passed
- [ ] Performance benchmarks acceptable
- [ ] No critical bugs

---

## Next Steps

1. **Review this plan** with your team
2. **Create a GitHub/Jira epic** with these 8 weeks of work
3. **Break into sprints:** 2 weeks per sprint
4. **Assign team members** to backend, frontend, testing
5. **Start Phase 1:** Backend foundation next week
6. **Schedule security review** for week 7
7. **Plan launch:** Marketing, documentation, customer notification

---

## Additional Resources

- [Detailed Implementation Plan](IFRAME_EMBED_IMPLEMENTATION_PLAN.md) - Task-by-task breakdown
- [Quick Reference Checklist](IFRAME_EMBED_CHECKLIST.md) - Checkbox list for tracking
- [Architecture & Design](IFRAME_EMBED_ARCHITECTURE.md) - System diagrams, data flows, component details

---

**Status:** ✅ Planning Complete  
**Next Phase:** 🚀 Implementation Ready  
**Approvals Needed:** Product, Engineering, Security

