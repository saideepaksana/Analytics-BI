# Taiga Tasks #305, #306, #308, #311, #312 — Completion Report

## 1. Task Completion Analysis

| Task | Description | Was Already Done | Missing / Added | Completion |
|------|-------------|-----------------|-----------------|-----------|
| #305 | Restrict Editing to Owners | Inline helpers existed but allowed `!user → true` (anonymous edits allowed) | Replaced with strict `isOwnerOrEditor()` from central `rbac.js`; anonymous-owned resources no longer editable | **95%** |
| #306 | Add Viewer/Editor Role Checks | Role checks existed in controllers but no route-level middleware; frontend `canCreateDashboard` was weak | Added `requireAuth` + `canMutate` route guards on all mutating endpoints; frontend `permissions.js` now blocks viewers strictly | **95%** |
| #308 | Separate Draft and Live Versions | Model fields (`isDraft`, `status`, `version`, `publishedAt`, `draftState`) were present; publish/saveDraft endpoints existed | Added draft indicator badge (DRAFT/LIVE) in DashboardCard & DashboardEditor; added "Save Draft" and "Publish" buttons in editor toolbar; `getDashboard` now returns 404 for draft dashboards visible only to non-owners | **90%** |
| #311 | OWASP ZAP Security Scan | N/A (scan not yet run) | Full manual audit performed (see findings below); automated ZAP scan instructions provided | **70%** (manual audit done) |
| #312 | Fix and Verify Security Issues | Some headers existed (Helmet); basic sanitization existed | Fixed CSP, removed `unsafe-eval`/`unsafe-inline` from scriptSrc, added X-Frame-Options DENY, Permissions-Policy, tightened CORS to whitelist, deep recursive sanitization, NoSQL injection detection, constant-time CSRF comparison, rate-limit headers | **95%** |

---

## 2. Code Implementation Summary

### Backend Changes

#### `apps/server/src/middleware/rbac.js` *(NEW)*
```
• requireAuth      – 401 if no user
• requireRole([…]) – 403 if user role not in allowed list
• requireMinRole   – 403 if role level below threshold
• canMutate        – shorthand: editor or above
• adminOnly        – admin-only routes
• isOwnerOrEditor  – pure function for controller-level ownership checks
```

#### `apps/server/src/api/dashboard/dashboard.routes.js`
```
• All mutating routes (POST, PATCH, DELETE) now gated by requireAuth + canMutate
• GET /draft endpoint gated by requireAuth only (ownership checked in controller)
• Read routes remain publicly accessible
```

#### `apps/server/src/api/charts/charts.routes.js`
```
• POST / and DELETE /:id now gated by requireAuth + canMutate
```

#### `apps/server/src/api/dashboard/dashboard.controller.js`
```
• Replaced loose canEditDashboard (allowed !user → true) with isOwnerOrEditor
• getDashboard now returns 404 for draft dashboards when user is not owner/editor
  (prevents information disclosure / enumeration)
```

#### `apps/server/src/api/charts/charts.controller.js`
```
• Replaced loose canEditChart/canDeleteChart with isOwnerOrEditor
```

#### `apps/server/src/middleware/security.js`
```
• CSP: removed 'unsafe-inline' and 'unsafe-eval' from scriptSrc
• Added X-Frame-Options: DENY (via helmet frameGuard)
• Added Permissions-Policy header (camera, mic, geo, payment, usb, cohort)
• CORS: whitelist-based origin validation instead of wildcard '*'
• Rate limiting: added X-RateLimit-* headers, Retry-After on 429
• Sanitization: deep recursive (handles nested objects/arrays)
• CSRF: constant-time comparison via crypto.timingSafeEqual
• NoSQL injection: detects MongoDB operator keys ($where, $regex, etc.)
• Memory leak fix: periodic cleanup of rate-limit map via setInterval
```

#### `apps/server/src/index.js`
```
• Registers new permissionsPolicy middleware
• CORS now uses whitelist derived from CORS_ORIGIN env var
• Explicit allowedHeaders in CORS config
```

### Frontend Changes

#### `apps/client/src/core/utils/permissions.js`
```
• Strict isOwnerOrEditor: anonymous-owned resources NOT editable
• Added canPublishDashboard()
• Added isEditorOrAbove(), isAdmin(), isLoggedIn() helpers
• canCreateDashboard/canCreateChart now use level-based check
```

#### `apps/client/src/modules/dashboard/components/DashboardCard.jsx`
```
• DRAFT / LIVE status badge on every card
• Owner attribution ("by username") in card meta
• Publish uses canPublishDashboard (more specific than canEditDashboard)
```

#### `apps/client/src/modules/dashboard/components/DashboardEditor.jsx`
```
• "Save Draft" button in edit mode (calls POST /save-draft)
• "Publish" button in edit mode (green gradient, calls POST /publish)
• DRAFT badge shown in view mode toolbar when status === 'draft'
• Accepts onPublish / onUnpublish callbacks from parent
```

#### `apps/client/src/modules/dashboard/DashboardPage.jsx`
```
• Removed duplicate openEditDashboard function
• Passes onPublish / onUnpublish callbacks to DashboardEditor
• Updates local dashboards list on publish/unpublish
```

---

## 3. Security Fix Report (OWASP-mapped)

### Findings & Fixes

| # | Category | Finding | Severity | Fix Applied |
|---|----------|---------|----------|-------------|
| 1 | A05: Misconfiguration | `script-src 'unsafe-inline' 'unsafe-eval'` in CSP | HIGH | Removed both directives from CSP scriptSrc |
| 2 | A05: Misconfiguration | No `X-Frame-Options` header → clickjacking risk | HIGH | Added `frameGuard: { action: 'deny' }` via Helmet |
| 3 | A05: Misconfiguration | No `Permissions-Policy` header | MEDIUM | Added Permissions-Policy restricting camera, mic, geo, payment |
| 4 | A05: Misconfiguration | CORS wildcard `*` in production | HIGH | Replaced with env-configured origin whitelist |
| 5 | A01: Broken Access Control | `!user → return true` in edit helpers | CRITICAL | All edit/delete paths now require authenticated user |
| 6 | A01: Broken Access Control | No route-level auth middleware | HIGH | `requireAuth` + `canMutate` on all mutating routes |
| 7 | A01: Broken Access Control | Draft dashboards leaked to public via GET /:id | MEDIUM | Returns 404 for drafts to non-owners |
| 8 | A03: Injection | Shallow sanitization (only top-level strings) | MEDIUM | Deep recursive sanitization including arrays/nested objects |
| 9 | A03: Injection | No NoSQL operator detection | MEDIUM | Added `$where`, `$regex`, etc. pattern detection |
| 10 | A07: Auth Failures | CSRF token compared with `===` (timing attack) | LOW | Replaced with `crypto.timingSafeEqual()` |
| 11 | A05: Misconfiguration | No rate-limit response headers | LOW | Added `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `Retry-After` |
| 12 | A01: Broken Access Control | Viewer role could call create/delete endpoints | HIGH | Route-level `canMutate` (editor+) blocks viewers |

---

## 4. Testing Instructions

### 4.1 RBAC Testing

```bash
# Start the server
cd apps/server && npm run dev

# Test as viewer (should get 403 on create)
curl -X POST http://localhost:5000/api/dashboards \
  -H "Content-Type: application/json" \
  -H "X-User-ID: viewer@test.com" \
  -H "X-User-Role: viewer" \
  -d '{"title":"Test"}'
# Expected: 403 Forbidden

# Test as editor (should succeed)
curl -X POST http://localhost:5000/api/dashboards \
  -H "Content-Type: application/json" \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor" \
  -d '{"title":"Test Dashboard"}'
# Expected: 201 Created

# Test unauthenticated (should get 401)
curl -X DELETE http://localhost:5000/api/dashboards/<id>
# Expected: 401 Unauthorized

# Test owner can delete own dashboard
curl -X DELETE http://localhost:5000/api/dashboards/<id> \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor"
# Expected: 200 OK

# Test non-owner cannot delete someone else's dashboard (needs a dashboard created by a different user)
curl -X DELETE http://localhost:5000/api/dashboards/<other-id> \
  -H "X-User-ID: other@test.com" \
  -H "X-User-Role: viewer"
# Expected: 401 (no auth) or 403 (wrong role)
```

### 4.2 Draft/Live Testing

```bash
# Create a dashboard (starts as draft)
curl -X POST http://localhost:5000/api/dashboards \
  -H "Content-Type: application/json" \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor" \
  -d '{"title":"My Draft"}'
# status should be "draft"

# Non-owner cannot see draft
curl http://localhost:5000/api/dashboards/<id>
# Expected: 404

# Publish the dashboard
curl -X POST http://localhost:5000/api/dashboards/<id>/publish \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor"
# Expected: 200, status: "published"

# Now anyone can see it
curl http://localhost:5000/api/dashboards/<id>
# Expected: 200 with published dashboard
```

### 4.3 Security Headers Testing

```bash
# Check response headers
curl -I http://localhost:5000/
# Expected headers:
#   X-Frame-Options: DENY
#   X-Content-Type-Options: nosniff
#   Referrer-Policy: strict-origin-when-cross-origin
#   Permissions-Policy: camera=(), microphone=(), ...
#   Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
#   Content-Security-Policy: default-src 'self'; script-src 'self'; ...

# Test CORS with unauthorized origin
curl -H "Origin: http://evil.com" -I http://localhost:5000/api/dashboards
# Expected: CORS error (no Access-Control-Allow-Origin)
```

### 4.4 Running OWASP ZAP Automated Scan

```bash
# Install Docker if not available, then:
docker pull owasp/zap2docker-stable

# Run baseline scan
docker run -t owasp/zap2docker-stable zap-baseline.py \
  -t http://host.docker.internal:5000 \
  -r zap_report.html

# Full active scan (may take longer):
docker run -t owasp/zap2docker-stable zap-full-scan.py \
  -t http://host.docker.internal:5000 \
  -r zap_full_report.html

# Alternative: ZAP Desktop
# 1. Download OWASP ZAP from https://www.zaproxy.org/
# 2. Set as proxy (127.0.0.1:8080)
# 3. Browse the application through ZAP
# 4. Run Active Scan
```

---

## 5. README Updates

### Security Section (add to project README)

```markdown
## Security Architecture

### Authentication & Authorization
- Mock auth via `X-User-ID` / `X-User-Role` headers (replace with JWT in production)
- Three roles: `admin`, `editor`, `viewer`
- Route-level RBAC via `requireAuth` and `canMutate` middleware
- Controller-level ownership checks via `isOwnerOrEditor()`

### Role Permissions Matrix
| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| View published dashboards | ✅ | ✅ | ✅ |
| View own drafts | ✅ | ✅ | ✅ |
| View others' drafts | ✅ | ✅ | ❌ |
| Create dashboard/chart | ✅ | ✅ | ❌ |
| Edit own content | ✅ | ✅ | ❌ |
| Edit others' content | ✅ | ✅ | ❌ |
| Delete own content | ✅ | ✅ | ❌ |
| Publish/Unpublish | ✅ | ✅* | ❌ |
| Admin operations | ✅ | ❌ | ❌ |

*Editor can only publish/unpublish dashboards they own or are admin of.

### Dashboard Lifecycle
```
[Create] → status: "draft" → only owner/editor can see
     ↓
[Publish] → status: "published" → visible to all users
     ↓
[Unpublish] → status: "draft" → hidden from non-owners again
```

### Security Headers Applied
- `Content-Security-Policy` — no `unsafe-inline`/`unsafe-eval` in scriptSrc
- `X-Frame-Options: DENY` — prevents clickjacking
- `Permissions-Policy` — restricts camera, mic, geolocation, payment
- `Strict-Transport-Security` — enforces HTTPS with preload
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy: strict-origin-when-cross-origin`

### Environment Variables
```env
CORS_ORIGIN=http://localhost:5173         # comma-separated list for production
NODE_ENV=production
PORT=5000
```

### Production Recommendations
1. Replace mock header-based auth with JWT (verify signature server-side)
2. Move CSRF tokens to HttpOnly signed cookies
3. Move rate limiting to Redis (current in-memory map is per-process)
4. Add nonce-based CSP for truly removing unsafe-inline from styleSrc
5. Run OWASP ZAP baseline scan in CI/CD pipeline
```
