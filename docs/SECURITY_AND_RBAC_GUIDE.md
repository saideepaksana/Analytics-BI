# Role-Based Access Control (RBAC) & Security Guide

## Table of Contents
1. [Role-Based Access Control](#role-based-access-control)
2. [Draft vs Live Dashboards](#draft-vs-live-dashboards)
3. [Security Architecture](#security-architecture)
4. [Running Security Scans](#running-security-scans)
5. [Testing Guide](#testing-guide)
6. [Production Deployment](#production-deployment)

---

## Role-Based Access Control

### Overview

Analytics BI implements a three-tier role-based access control system:

| Role | Level | Capabilities |
|------|-------|--------------|
| **Admin** | 2 | Full access to all dashboards, charts, and system operations |
| **Editor** | 1 | Can create, edit, and publish dashboards/charts; can edit any dashboard |
| **Viewer** | 0 | Read-only access to published dashboards and charts |

### Permission Matrix

| Action | Admin | Editor | Viewer |
|--------|-------|--------|--------|
| View published dashboards | ✅ | ✅ | ✅ |
| View own draft dashboards | ✅ | ✅ | ❌ |
| View others' draft dashboards | ✅ | ✅ | ❌ |
| Create dashboards/charts | ✅ | ✅ | ❌ |
| Edit own dashboards | ✅ | ✅ | ❌ |
| Edit others' dashboards | ✅ | ✅ | ❌ |
| Delete dashboards | ✅ | ✅ | ❌ |
| Publish/Unpublish | ✅ | ✅ | ❌ |
| Manage system settings | ✅ | ❌ | ❌ |

### Authentication

Currently, authentication uses header-based identification (suitable for development/internal deployments):

```javascript
// Authentication headers required for mutations:
X-User-ID: user@example.com
X-User-Role: editor|viewer|admin
```

**⚠️ Production Note:** This header-based auth is not secure for public deployments. For production, implement JWT tokens with server-side verification.

### Implementation Details

#### Backend RBAC Middleware

Located in `apps/server/src/middleware/rbac.js`:

```javascript
// Require authentication
app.post('/api/dashboards', requireAuth, (req, res) => {
  // User is authenticated; proceed
});

// Require minimum role level (editor or above)
app.delete('/api/dashboards/:id', requireAuth, canMutate, (req, res) => {
  // User is editor or admin; proceed
});

// Check ownership in controller
if (!isOwnerOrEditor(dashboard, req.user)) {
  return res.status(403).json({ message: 'Forbidden' });
}
```

#### Frontend Permission Checks

Located in `apps/client/src/core/utils/permissions.js`:

```javascript
import { canEditDashboard, canDeleteDashboard, canPublishDashboard } from '../utils/permissions';

function DashboardActions({ dashboard }) {
  return (
    <>
      {canEditDashboard(dashboard) && (
        <button onClick={handleEdit}>Edit</button>
      )}
      {canDeleteDashboard(dashboard) && (
        <button onClick={handleDelete}>Delete</button>
      )}
      {canPublishDashboard(dashboard) && (
        <button onClick={handlePublish}>Publish</button>
      )}
    </>
  );
}
```

---

## Draft vs Live Dashboards

### Workflow

Every dashboard has two states:

```
[Create] → DRAFT (private, only owner sees)
    ↓
[Publish] → LIVE (visible to all authorized users)
    ↓
[Unpublish] → DRAFT again (hidden from others)
```

### Key Features

1. **Draft Dashboards**
   - Only accessible to their creator
   - Contain work-in-progress changes
   - Not visible in public dashboard list
   - Can be edited without affecting others

2. **Published Dashboards**
   - Visible to all users (according to their role)
   - Immutable until unpublished
   - Changes to drafts don't affect published version
   - Include publication metadata (who published, when)

3. **Draft State Storage**
   ```javascript
   {
     title: "My Dashboard",
     status: "draft",           // or "published"
     draftState: { ... },       // Separate draft content
     publishedAt: Date,         // When published
     publishedBy: "admin@example.com",
     version: 5,                // Optimistic concurrency control
   }
   ```

### API Endpoints

#### Create Dashboard
```bash
POST /api/dashboards
Authorization: X-User-ID, X-User-Role
Content-Type: application/json

{
  "title": "New Dashboard",
  "description": "...",
  "tabs": [...],
  "layout": [...]
}

# Response: 201 Created (status: "draft")
```

#### Get Dashboard (if published or owner)
```bash
GET /api/dashboards/:id

# Response:
# - 200 OK (published or owner of draft)
# - 404 Not Found (draft, not owner)
```

#### Save Draft
```bash
POST /api/dashboards/:id/save-draft
Authorization: X-User-ID, X-User-Role

{
  "draftState": { ... }  # Partial updates
}

# Response: 200 OK
```

#### Publish Dashboard
```bash
POST /api/dashboards/:id/publish
Authorization: X-User-ID, X-User-Role

# Response: 200 OK
# {
#   "status": "published",
#   "publishedAt": "2026-05-04T10:30:00Z",
#   "publishedBy": "editor@example.com"
# }
```

#### Unpublish Dashboard
```bash
POST /api/dashboards/:id/unpublish
Authorization: X-User-ID, X-User-Role

# Response: 200 OK (back to draft)
```

### UI Indicators

- **DRAFT Badge** (Orange): Dashboard is unpublished, visible only to owner
- **LIVE Badge** (Green): Dashboard is published, visible to all
- **Owner Attribution**: Shows who created the dashboard
- **Publish Button**: Available for draft dashboards (editors+)
- **Unpublish Button**: Available for published dashboards (editors+)

---

## Security Architecture

### Security Headers

All requests include security headers to prevent common vulnerabilities:

```
Content-Security-Policy: default-src 'self'; script-src 'self'; ...
X-Frame-Options: DENY
X-Content-Type-Options: nosniff
Permissions-Policy: camera=(), microphone=(), geolocation=(), ...
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
Referrer-Policy: strict-origin-when-cross-origin
```

### Input Validation & Sanitization

- **Deep HTML Sanitization**: All string inputs are recursively sanitized to remove HTML/script tags
- **SQL/NoSQL Injection Detection**: Patterns detected and blocked
- **Rate Limiting**: 1000 requests per IP per minute

### CORS Policy

CORS is restricted to whitelisted origins:

```javascript
// Configure via environment variable:
CORS_ORIGIN=http://localhost:5173,https://analytics.example.com
```

### CSRF Protection

CSRF tokens are validated with constant-time comparison to prevent timing attacks.

### Known Vulnerabilities & Fixes

| Issue | Severity | Status | Fix |
|-------|----------|--------|-----|
| `script-src 'unsafe-inline'` in CSP | HIGH | ✅ Fixed | Removed unsafe directives |
| Missing X-Frame-Options | HIGH | ✅ Fixed | Added `DENY` |
| CORS wildcard `*` | HIGH | ✅ Fixed | Whitelist-based validation |
| No authentication on mutations | CRITICAL | ✅ Fixed | `requireAuth` + `canMutate` middleware |
| Draft information disclosure | MEDIUM | ✅ Fixed | Return 404 for drafts to non-owners |
| Shallow input sanitization | MEDIUM | ✅ Fixed | Deep recursive sanitization |
| No NoSQL injection detection | MEDIUM | ✅ Fixed | Pattern-based operator blocking |
| CSRF timing attack | LOW | ✅ Fixed | `crypto.timingSafeEqual()` |

---

## Running Security Scans

### OWASP ZAP Baseline Scan (Recommended)

Quick passive scan that identifies common security issues (~5 minutes):

```bash
# Option 1: Use provided script
./scripts/run-zap-scan.sh baseline

# Option 2: Manual Docker command
docker run --rm \
  -v "$(pwd)/zap_reports:/zap/reports" \
  owasp/zap2docker-stable zap-baseline.py \
  -t http://host.docker.internal:5000 \
  -r zap_baseline_report.html
```

### OWASP ZAP Active Scan (Thorough)

Full active scan that attempts to exploit vulnerabilities (~30 minutes):

```bash
./scripts/run-zap-scan.sh active
```

### OWASP ZAP Desktop (Interactive)

For manual testing and exploration:

1. Download ZAP from https://www.zaproxy.org/
2. Configure as proxy: 127.0.0.1:8080
3. Browse application through ZAP
4. Run Active Scan from UI
5. View detailed findings

### Full Scan

Run both baseline and active scans:

```bash
./scripts/run-zap-scan.sh full
```

### Expected Report Results

After security fixes, expect:

**✅ Should Pass:**
- CSP headers in place (no unsafe-inline/eval in scriptSrc)
- HSTS enabled (Strict-Transport-Security)
- Clickjacking protection (X-Frame-Options: DENY)
- Rate limiting headers present
- Input validation active

**⚠️ Possible LOW Findings:**
- Missing HttpOnly flag on cookies (by design for auth headers)
- Missing anti-caching headers on dynamic content
- Informational: Missing nonce-based CSP directives

---

## Testing Guide

### Test Prerequisites

```bash
# Terminal 1: Start backend server
cd apps/server
npm install
npm run dev

# Terminal 2: Start frontend (optional, for UI testing)
cd apps/client
npm install
npm run dev
```

### Test 1: Viewer Role Restrictions

Viewers cannot create or edit dashboards:

```bash
# Try to create as viewer (should fail)
curl -X POST http://localhost:5000/api/dashboards \
  -H "Content-Type: application/json" \
  -H "X-User-ID: viewer@test.com" \
  -H "X-User-Role: viewer" \
  -d '{"title":"Test Dashboard"}'

# Expected: 403 Forbidden
# {
#   "message": "Access denied. Minimum required role: editor",
#   "yourRole": "viewer"
# }
```

### Test 2: Editor Can Create

Editors can create and edit dashboards:

```bash
# Create as editor
DASHBOARD=$(curl -s -X POST http://localhost:5000/api/dashboards \
  -H "Content-Type: application/json" \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor" \
  -d '{"title":"Editor Dashboard"}')

DASHBOARD_ID=$(echo $DASHBOARD | jq -r '.dashboard._id')

# Expected: 201 Created
echo "Created: $DASHBOARD_ID"
```

### Test 3: Draft Visibility

Draft dashboards are hidden from non-owners:

```bash
# Non-owner tries to view draft (should fail)
curl http://localhost:5000/api/dashboards/$DASHBOARD_ID \
  -H "X-User-ID: viewer@test.com" \
  -H "X-User-Role: viewer"

# Expected: 404 Not Found
# {
#   "message": "Dashboard not found"
# }
```

### Test 4: Publish & Visibility

After publishing, draft becomes visible to all:

```bash
# Publish dashboard
curl -X POST http://localhost:5000/api/dashboards/$DASHBOARD_ID/publish \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor"

# Expected: 200 OK
# {
#   "dashboard": {
#     "status": "published",
#     "publishedAt": "2026-05-04T10:30:00Z",
#     "publishedBy": "editor@test.com"
#   }
# }

# Now viewer can see it
curl http://localhost:5000/api/dashboards/$DASHBOARD_ID \
  -H "X-User-ID: viewer@test.com" \
  -H "X-User-Role: viewer"

# Expected: 200 OK (published dashboard)
```

### Test 5: Ownership Protection

Non-owners cannot delete dashboards:

```bash
# Different user tries to delete (should fail)
curl -X DELETE http://localhost:5000/api/dashboards/$DASHBOARD_ID \
  -H "X-User-ID: other@test.com" \
  -H "X-User-Role: editor"

# Expected: 403 Forbidden
# {
#   "message": "You do not have permission to delete this dashboard"
# }

# Owner can delete their own
curl -X DELETE http://localhost:5000/api/dashboards/$DASHBOARD_ID \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor"

# Expected: 200 OK
# {
#   "message": "Dashboard deleted"
# }
```

### Test 6: Security Headers

Check that security headers are present:

```bash
curl -I http://localhost:5000/

# Expected headers:
#
# Content-Security-Policy: default-src 'self'; script-src 'self'; ...
# X-Frame-Options: DENY
# X-Content-Type-Options: nosniff
# Permissions-Policy: camera=(), microphone=(), ...
# Strict-Transport-Security: max-age=31536000; ...
```

### Test 7: CORS Validation

Test CORS whitelist enforcement:

```bash
# Authorized origin (localhost:5173)
curl -H "Origin: http://localhost:5173" -I http://localhost:5000/api/dashboards
# Expected: Access-Control-Allow-Origin: http://localhost:5173

# Unauthorized origin
curl -H "Origin: http://evil.com" -I http://localhost:5000/api/dashboards
# Expected: No Access-Control-Allow-Origin header
```

### Test 8: Rate Limiting

Test rate limit enforcement:

```bash
# Make 1001+ requests in 60 seconds
for i in {1..1005}; do
  curl -s http://localhost:5000/api/dashboards > /dev/null
  echo "Request $i"
done

# After 1000 requests:
curl -I http://localhost:5000/api/dashboards
# Expected: 429 Too Many Requests
# Retry-After: 60
# X-RateLimit-Remaining: 0
```

### Test 9: Input Sanitization

Test that HTML injection attempts are sanitized:

```bash
curl -X POST http://localhost:5000/api/dashboards \
  -H "Content-Type: application/json" \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor" \
  -d '{
    "title": "<script>alert(\"XSS\")</script>Innocent Title",
    "description": "<img src=x onerror=alert(\"XSS\")>"
  }'

# Expected: Title and description are sanitized (tags removed)
# Response will contain clean text without HTML tags
```

### Test 10: NoSQL Injection Detection

Test that MongoDB operator injection attempts are blocked:

```bash
curl -X POST http://localhost:5000/api/dashboards \
  -H "Content-Type: application/json" \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor" \
  -d '{
    "$where": "function() { return this.admin === true; }",
    "title": "Injection Attempt"
  }'

# Expected: 400 Bad Request
# {
#   "message": "Invalid input detected"
# }
```

---

## Production Deployment

### Pre-Deployment Checklist

- [ ] Replace header-based auth with JWT tokens
- [ ] Implement User model with verified roles
- [ ] Move rate limiting to Redis (distributed)
- [ ] Enable HTTPS redirect
- [ ] Configure CORS_ORIGIN with production domain
- [ ] Set NODE_ENV=production
- [ ] Run full ZAP security scan
- [ ] Review and address all MEDIUM+ findings
- [ ] Implement audit logging
- [ ] Set up monitoring and alerting
- [ ] Test disaster recovery procedures

### Environment Configuration

Create a `.env.production` file:

```env
NODE_ENV=production
PORT=5000

# Database
MONGODB_URI=mongodb://prod-mongo:27017/analytics-bi
REDIS_URL=redis://prod-redis:6379

# Security
CORS_ORIGIN=https://analytics.example.com
SECURE_COOKIES=true
HTTPS_ONLY=true

# Rate Limiting (use Redis in production)
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=1000

# JWT (when implemented)
JWT_SECRET=<strong-random-secret>
JWT_EXPIRY=24h
```

### Security Best Practices

1. **Use HTTPS everywhere**
   - Redirect HTTP to HTTPS
   - Use HSTS with preload list

2. **Implement JWT Authentication**
   - Replace header-based auth
   - Verify signatures server-side
   - Use short-lived tokens + refresh tokens

3. **Move to Redis-backed Rate Limiting**
   - Current in-memory implementation is per-process
   - Redis allows distributed enforcement

4. **Implement Audit Logging**
   ```javascript
   // Log all mutations
   auditLog.create({
     action: 'DASHBOARD_PUBLISHED',
     user: req.user.id,
     resource: dashboardId,
     timestamp: Date.now(),
     changes: { status: 'draft' -> 'published' }
   });
   ```

5. **Set up Security Monitoring**
   - Monitor failed authentication attempts
   - Alert on repeated 403 responses
   - Track rate-limit violations
   - Log all admin actions

6. **Regular Security Scanning**
   - Run ZAP baseline scan weekly
   - Run active scan monthly
   - Perform code security reviews
   - Update dependencies regularly

### Docker Deployment

Use provided `docker-compose.yml`:

```bash
docker-compose -f docker-compose.yml up -d

# Verify all services are running
docker-compose ps

# View logs
docker-compose logs -f app

# Access application
open http://localhost:5000
```

---

## Troubleshooting

### "Authentication required" on mutations

Ensure you're including auth headers:

```bash
curl -X POST http://localhost:5000/api/dashboards \
  -H "X-User-ID: editor@test.com" \
  -H "X-User-Role: editor"
```

### Draft dashboard showing 404

If a draft dashboard returns 404, ensure:
1. You're the owner (createdBy matches your user ID)
2. Include auth headers matching your user ID
3. Dashboard status is actually 'draft'

### CORS errors in browser console

Check that `CORS_ORIGIN` environment variable includes your frontend URL:

```env
CORS_ORIGIN=http://localhost:5173,https://yourdomain.com
```

### Rate limit being triggered unexpectedly

Verify rate limit is not too aggressive:

```env
RATE_LIMIT_WINDOW_MS=60000    # 1 minute
RATE_LIMIT_MAX_REQUESTS=1000  # Adjust as needed
```

---

## Additional Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [OWASP ZAP Documentation](https://www.zaproxy.org/docs/)
- [Express Security Best Practices](https://expressjs.com/en/advanced/best-practice-security.html)
- [Node.js Security Checklist](https://nodejs.org/en/docs/guides/security/)
- [NIST Cybersecurity Framework](https://www.nist.gov/cyberframework)

---

**Last Updated:** May 4, 2026
