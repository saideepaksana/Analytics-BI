# iframe Embed Implementation - Quick Reference Checklist

## At a Glance

**Total Tasks:** 47  
**Estimated Time:** 8 weeks  
**Team Size:** 2-3 developers  
**Complexity:** Medium-High (security critical)

---

## PHASE 1: Backend & Security (Weeks 1-2)

### Embed Token Service
- [ ] Create `src/services/embedTokenService.js`
  - [ ] Generate JWT tokens with proper payload
  - [ ] Implement token expiration logic
  - [ ] Add token signing with HMAC-SHA256
  - [ ] Support token refresh mechanism

### Token Validation Middleware
- [ ] Create `src/middleware/embedTokenAuth.js`
  - [ ] Verify JWT signature
  - [ ] Check token expiration
  - [ ] Validate dashboard access permissions
  - [ ] Implement rate limiting (1000 req/hour per token)
  - [ ] Add IP-based rate limiting

### Update Export Controller
- [ ] Modify `generateEmbedToken()` in exportController.js
  - [ ] Replace base64 with JWT
  - [ ] Add expiration time parameter
  - [ ] Accept allowed origins list
  - [ ] Return: `{ token, embedUrl, iframeSnippet, expiresAt }`

### Add Embed Access Endpoint
- [ ] `GET /embed/:dashboardId` route
  - [ ] Validate embed token from Authorization header
  - [ ] Check dashboard published status
  - [ ] Return dashboard + chart data
  - [ ] Support CORS with origin validation

### Database Updates
- [ ] Extend Dashboard schema:
  - [ ] Add `embedSettings` object
  - [ ] Add `embedTokens` array (with hashes, expiration)
- [ ] Create `EmbedAccessLog` collection for audit trail
  - [ ] Track: dashboardId, tokenHash, accessTime, referer, ip
  - [ ] Add TTL index for 90-day retention

### Security Hardening
- [ ] Implement CORS headers for embed endpoints
  - [ ] Set `Access-Control-Allow-Origin` per token
  - [ ] Set `X-Frame-Options: ALLOWALL`
  - [ ] Validate `Referer` header
- [ ] Add rate limiting middleware
- [ ] Implement token blacklist/revocation
- [ ] Add request logging for audit trail
- [ ] Set up environment variables for secrets

---

## PHASE 2: Frontend Embed Page (Weeks 3-4)

### Create Embed Dashboard Component
- [ ] Build `apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx`
  - [ ] Extract token from URL query params
  - [ ] Validate token format
  - [ ] Minimal UI (no navbar/sidebar/edit tools)
  - [ ] Read-only mode enforced
  - [ ] Responsive design
  - [ ] Full-screen toggle button

### Token Validation on Client
- [ ] Extract token from `?token=<jwt>` query param
- [ ] Send token in `Authorization: Bearer <token>` header
- [ ] Handle expired token errors gracefully
- [ ] Implement token refresh if needed
- [ ] Show user-friendly error messages

### Embed Mode Features
- [ ] Support dashboard filters (if enabled)
  - [ ] Parse filters from URL params
  - [ ] Apply filters on load
  - [ ] Sync filter changes via WebSocket
- [ ] Enable chart interactions:
  - [ ] Drill-down (if configured)
  - [ ] Export to CSV
  - [ ] Tooltips and legends
- [ ] Hide all edit buttons in embed mode
- [ ] Add "Embedded" indicator (optional)

### Update Routing
- [ ] Add embed route: `/embed/:dashboardId`
- [ ] Create route guard to validate token on embed page
- [ ] Redirect invalid tokens to error page

---

## PHASE 3: Live Updates (Week 5)

### WebSocket Embed Authentication
- [ ] Update Socket.io handshake validation
  - [ ] Accept embed token in socket handshake
  - [ ] Validate token format and expiration
  - [ ] Reject unauthorized connections
- [ ] Create embed-specific namespace: `/embed`

### Real-Time Data Sync
- [ ] Subscribe to `dashboard:data-update` events
- [ ] On chart data change:
  - [ ] Fetch updated data for affected charts
  - [ ] Re-render only affected widgets
  - [ ] Show "updating..." indicator
- [ ] Subscribe to `dashboard:filter-update` events
- [ ] Handle `dashboard:chart-added/removed` events

### Connection Management
- [ ] Detect socket disconnection
- [ ] Show "Offline" indicator/banner
- [ ] Auto-reconnect with exponential backoff (1s → 32s)
- [ ] Warn if data stale (no updates for 60+ seconds)
- [ ] Gracefully handle network failures

### Performance Optimization
- [ ] Debounce rapid data updates (max 1 update per second)
- [ ] Batch multiple chart updates into single render cycle
- [ ] Lazy-load charts outside viewport (if large dashboard)
- [ ] Cache static dashboard metadata (filters, structure)
- [ ] Implement chart-level caching

---

## PHASE 4: UI & Management (Week 6)

### Embed Code Generator Modal
- [ ] Create `apps/client/src/modules/dashboard/components/EmbedCodeModal.jsx`
  - [ ] Display iframe code snippet
  - [ ] Add copy-to-clipboard button
  - [ ] Show embed URL
  - [ ] Display expiration time/countdown
- [ ] Configuration options:
  - [ ] Expiration time dropdown (1 day, 1 week, 1 month, custom)
  - [ ] Allowed origins input (comma-separated)
  - [ ] Include filters checkbox
  - [ ] Width/height customization
  - [ ] Theme selector (light/dark)
- [ ] Generate QR code for quick mobile testing (optional)
- [ ] Show usage analytics (if available)

### Add Embed Button to Export Menu
- [ ] Location: DashboardEditor export dropdown
- [ ] Button label: "Generate Embed Code"
- [ ] Icon: `<Code size={14} />`
- [ ] Tooltip: "Create iframe for external websites"
- [ ] Only show for published dashboards
- [ ] Only show for dashboard owner

### Token Management Interface
- [ ] Create new page/section: "Manage Embed Tokens"
- [ ] List all active tokens for dashboard
  - [ ] Display masked token (first 8 chars + ...)
  - [ ] Show creation date, expiration date
  - [ ] Show access count and last access time
- [ ] Actions per token:
  - [ ] Revoke/delete token
  - [ ] View access logs
  - [ ] Copy token
  - [ ] View usage stats
- [ ] Bulk revoke option

### Utility Components
- [ ] `CopyButton.jsx` - One-click copy with notification
- [ ] `EmbedPreview.jsx` - Live preview in different sizes
- [ ] `TokenBadge.jsx` - Display token status and expiration

---

## PHASE 5: Testing & Documentation (Weeks 7-8)

### Backend Testing
- [ ] **Token Tests**
  - [ ] JWT generation with correct payload
  - [ ] Token signing and verification
  - [ ] Token expiration validation
  - [ ] Token revocation/blacklist
- [ ] **Permission Tests**
  - [ ] Only dashboard owner can generate tokens
  - [ ] Only published dashboards can be embedded
  - [ ] Invalid tokens rejected
  - [ ] Expired tokens rejected
- [ ] **API Tests**
  - [ ] `/embed/token` POST request
  - [ ] `/embed/:dashboardId` GET with valid token
  - [ ] `/embed/:dashboardId` GET with invalid token
  - [ ] `/embed/tokens/:dashboardId` GET (list)
  - [ ] `/embed/token/:tokenId` DELETE (revoke)
- [ ] **Security Tests**
  - [ ] CORS headers validation
  - [ ] Rate limiting works
  - [ ] Origin validation works
  - [ ] SQL injection prevention
  - [ ] XSS prevention
- [ ] **Socket Tests**
  - [ ] Embed token authentication on socket.io
  - [ ] Unauthorized sockets rejected
  - [ ] Data update events received
  - [ ] Disconnect handling

### Frontend Testing
- [ ] **Embed Page Tests**
  - [ ] Loads with valid token
  - [ ] Shows error for invalid token
  - [ ] Shows error for expired token
  - [ ] Dashboard renders correctly
  - [ ] Charts render and display data
- [ ] **Live Update Tests**
  - [ ] Real-time data updates work
  - [ ] Multiple charts update correctly
  - [ ] Filter changes sync correctly
  - [ ] Disconnect and reconnect handled
- [ ] **Responsiveness**
  - [ ] Works in different iframe sizes (small, medium, large)
  - [ ] Works on mobile (if accessed directly)
  - [ ] Works in various browsers (Chrome, Firefox, Safari)
- [ ] **UI Tests**
  - [ ] Copy button works
  - [ ] Modal opens/closes correctly
  - [ ] Configuration options save properly
  - [ ] Token list displays correctly

### Integration Tests
- [ ] **End-to-End Flow**
  1. [ ] Navigate to dashboard view page
  2. [ ] Click "Export" → "Generate Embed Code"
  3. [ ] Configure embed (expiration, origins)
  4. [ ] Copy iframe snippet
  5. [ ] Paste into external HTML file
  6. [ ] Load external HTML in browser
  7. [ ] Embedded dashboard loads and displays
  8. [ ] Live updates work
  9. [ ] Revoke token, verify access denied
- [ ] **Cross-Origin Tests**
  - [ ] Embed from different domain works
  - [ ] Embed from same domain works
  - [ ] Blocked origins rejected
- [ ] **Performance Tests**
  - [ ] Load time < 2 seconds
  - [ ] Live updates latency < 500ms
  - [ ] WebSocket stable (no reconnects)

### Documentation
- [ ] **API Documentation**
  - [ ] Document all embed endpoints
  - [ ] Request/response examples
  - [ ] Error codes and messages
  - [ ] Rate limits
  - [ ] Authentication details
  - [ ] CORS configuration

- [ ] **Frontend Integration Guide**
  - [ ] How to use iframe snippet
  - [ ] HTML template examples
  - [ ] Customize width/height
  - [ ] Apply filters via URL
  - [ ] Handle embed errors
  - [ ] FAQ

- [ ] **Security Documentation**
  - [ ] Token security best practices
  - [ ] Why JWT over base64
  - [ ] Origin validation explanation
  - [ ] Revocation process
  - [ ] Compliance (GDPR, SOC2)
  - [ ] Audit logging

- [ ] **Troubleshooting Guide**
  - [ ] Common errors and solutions
  - [ ] "Invalid token" error
  - [ ] "Cross-origin blocked" error
  - [ ] "Dashboard not found" error
  - [ ] "Live updates not working" error
  - [ ] Performance issues

- [ ] **Code Examples**
  - [ ] Plain HTML example
  - [ ] React component example
  - [ ] Vue component example
  - [ ] Angular directive example
  - [ ] WordPress plugin example (if applicable)

---

## Success Criteria Verification

Before marking as DONE, verify:

- [ ] Users can generate embed tokens via UI
- [ ] Embed tokens are JWT-based and secure
- [ ] Tokens can be revoked/regenerated
- [ ] External websites can embed dashboards
- [ ] Embedded dashboards display live data
- [ ] Real-time updates work via WebSocket
- [ ] Embed view is read-only
- [ ] Cross-origin requests work with proper CORS
- [ ] Rate limiting prevents abuse
- [ ] Audit logs track all embed accesses
- [ ] Performance impact is minimal
- [ ] All tests pass
- [ ] Security review passed
- [ ] Documentation complete

---

## Key Files Summary

| File | Purpose | Status |
|------|---------|--------|
| `src/services/embedTokenService.js` | JWT token generation | ❌ New |
| `src/middleware/embedTokenAuth.js` | Token validation | ❌ New |
| `src/api/export/exportController.js` | Generate token endpoint | 🟡 Modify |
| `src/models/Dashboard.js` | Add embed fields | ❌ Modify |
| `src/models/EmbedAccessLog.js` | Audit logging | ❌ New |
| `src/core/socketManager.js` | Embed socket auth | ❌ Modify |
| `apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx` | Embed view | ❌ New |
| `apps/client/src/modules/dashboard/components/EmbedCodeModal.jsx` | Token generator UI | ❌ New |
| `apps/client/src/modules/dashboard/components/DashboardEditor.jsx` | Add embed button | ❌ Modify |
| `docs/IFRAME_EMBED_IMPLEMENTATION_PLAN.md` | This detailed plan | ✅ Complete |

---

## Team Assignments (Suggested)

- **Backend Developer 1:**
  - [ ] Embed token service
  - [ ] Token validation middleware
  - [ ] Database schema updates
  - [ ] Embed endpoints

- **Backend Developer 2:**
  - [ ] Socket.io embed authentication
  - [ ] Security hardening (rate limiting, CORS)
  - [ ] Audit logging
  - [ ] Backend testing

- **Frontend Developer:**
  - [ ] EmbedDashboard component
  - [ ] Embed code generator modal
  - [ ] Token management UI
  - [ ] Real-time updates
  - [ ] Frontend testing

- **QA/Testing:**
  - [ ] Integration testing
  - [ ] Security testing
  - [ ] Cross-browser testing
  - [ ] Performance testing

- **Documentation:**
  - [ ] API docs
  - [ ] Integration guide
  - [ ] Troubleshooting guide
  - [ ] Security documentation

---

## Risks & Mitigation

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Token compromise | **HIGH** | Use HTTPS, env vars for secrets, implement rotation |
| Unauthorized data access | **HIGH** | Strict permission checks, audit logs, token validation on every request |
| Performance degradation | **MEDIUM** | Rate limiting, socket batching, caching |
| Cross-origin issues | **MEDIUM** | Proper CORS config, test on multiple domains |
| WebSocket reliability | **MEDIUM** | Auto-reconnect, offline indicators, fallback polling |
| API abuse | **MEDIUM** | Rate limiting, CAPTCHA, IP blocking |

---

## Timeline

```
Week 1   |███| Embed token service & middleware
Week 2   |███| Endpoints & database updates
Week 3   |███| EmbedDashboard component
Week 4   |███| Live updates & Socket.io
Week 5   |███| UI & token management
Week 6   |███| Code generator modal
Week 7   |███| Testing (unit & integration)
Week 8   |███| Documentation & security review
```

---

## Stakeholder Sign-Off

- **Product Manager:** _____________ Date: _______
- **Engineering Lead:** _____________ Date: _______
- **Security Lead:** _____________ Date: _______
- **DevOps Lead:** _____________ Date: _______

