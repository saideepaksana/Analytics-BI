# iframe Embed Architecture & System Design

---

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          EXTERNAL WEBSITE / PORTAL                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  <iframe src="https://analytics-bi.com/embed/dashboard-123                   │
│           ?token=eyJhbGc..." width="100%" height="600">                     │
│  </iframe>                                                                   │
│                                                                              │
│  ┌────────────────────────────────────────────────────────────┐             │
│  │     Embedded Dashboard (Live, Read-Only)                   │             │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │             │
│  │  │  Chart 1     │  │  Chart 2     │  │  Chart 3     │    │             │
│  │  │  (CSV Data)  │  │  (Real-time) │  │  (Live KPI)  │    │             │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │             │
│  │                                                             │             │
│  │  [Filters]  [Full-screen]  [Powered by Analytics-BI]    │             │
│  └────────────────────────────────────────────────────────────┘             │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
           ▲                              ▲
           │ HTTP GET + Bearer Token      │ WebSocket + Token Auth
           │                              │
           ▼                              ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       ANALYTICS-BI BACKEND (API Server)                      │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                               │
│  ┌────────────────────────────────────────────────────────────┐              │
│  │  Express Middleware Stack                                  │              │
│  │  • embedTokenAuth (JWT validation)                         │              │
│  │  • CORS (origin validation)                                │              │
│  │  • Rate Limiter (1000 req/hour per token)                  │              │
│  └────────────────────────────────────────────────────────────┘              │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │  HTTP Endpoints                                                 │         │
│  │                                                                 │         │
│  │  POST /embed/token                                              │         │
│  │    Request: { dashboardId, expirationHours, allowedOrigins }   │         │
│  │    Response: { token, embedUrl, iframeSnippet, expiresAt }    │         │
│  │                                                                 │         │
│  │  GET /embed/:dashboardId                                        │         │
│  │    Headers: Authorization: Bearer <token>                      │         │
│  │    Response: { dashboard, charts, filters, metadata }          │         │
│  │                                                                 │         │
│  │  GET /embed/tokens/:dashboardId                                │         │
│  │    Response: [{ token (masked), createdAt, expiresAt, ... }]  │         │
│  │                                                                 │         │
│  │  DELETE /embed/token/:tokenId                                  │         │
│  │    Response: { success, message }                             │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│                                                                               │
│  ┌─────────────────────────────────────────────────────────────────┐         │
│  │  WebSocket Namespace: /embed                                    │         │
│  │                                                                 │         │
│  │  Handshake: socket.io?token=<jwt>                             │         │
│  │  Events:                                                        │         │
│  │    • dashboard:data-update (broadcast to subscribers)          │         │
│  │    • dashboard:filter-update                                   │         │
│  │    • dashboard:chart-added/removed                             │         │
│  └─────────────────────────────────────────────────────────────────┘         │
│                                                                               │
│  ┌────────────────────────────────────────────────────────────┐              │
│  │  Services & Logic                                          │              │
│  │  • embedTokenService (generate, validate, refresh tokens)  │              │
│  │  • dashboardService (fetch dashboard for embed)            │              │
│  │  • chartsService (fetch chart data)                        │              │
│  │  • auditService (log embed accesses)                       │              │
│  └────────────────────────────────────────────────────────────┘              │
│                                                                               │
└──────────────────────────────────────────────────────────────────────────────┘
                         ▲                    ▲
                         │                    │
                    ┌────┴────┐          ┌───┴─────┐
                    ▼         ▼          ▼         ▼
            ┌─────────────┐ ┌──────────────────┐ ┌──────────┐
            │  MongoDB    │ │  Redis (Cache)   │ │ Socket.io│
            │             │ │                  │ │ Channels │
            │ • Dashboards│ │ • Token cache    │ │          │
            │ • Charts    │ │ • Chart data     │ └──────────┘
            │ • Datasets  │ │ • Revocation     │
            │ • Tokens    │ │                  │
            │ • AccessLog │ └──────────────────┘
            └─────────────┘
```

---

## Component Breakdown

### 1. Backend Components

#### 1.1 Embed Token Service
```javascript
// src/services/embedTokenService.js

class EmbedTokenService {
  generateToken(dashboardId, userId, options = {}) {
    // Generate JWT with:
    // • dashboardId
    // • userId (dashboard owner)
    // • exp (expiration)
    // • scope: 'view' (read-only)
    // • sub: 'embed'
    // Returns: { token, expiresAt, expiresIn }
  }

  validateToken(token) {
    // Verify JWT signature
    // Check expiration
    // Check blacklist
    // Returns: { valid: bool, payload?: {}, error?: string }
  }

  refreshToken(token) {
    // If token still valid but close to expiry
    // Generate new token with same payload
    // Returns: { newToken, expiresAt }
  }

  revokeToken(tokenHash) {
    // Add to revocation list
    // Mark as revoked in DB
  }
}
```

#### 1.2 Embed Token Auth Middleware
```javascript
// src/middleware/embedTokenAuth.js

async function embedTokenAuth(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) return res.status(401).json({ error: 'Missing token' });
  
  try {
    const payload = embedTokenService.validateToken(token);
    if (!payload.valid) throw new Error(payload.error);
    
    // Check dashboard access
    const dashboard = await Dashboard.findById(payload.dashboardId);
    if (!dashboard?.published) throw new Error('Dashboard not published');
    
    // Attach to request
    req.embed = { token, ...payload };
    next();
  } catch (err) {
    res.status(403).json({ error: 'Unauthorized' });
  }
}
```

#### 1.3 Rate Limiter for Embeds
```javascript
// src/middleware/embedRateLimiter.js

const embedLimiter = rateLimit({
  store: new RedisStore({
    client: redisClient,
    prefix: 'embed-limit:',
  }),
  keyGenerator: (req) => req.embed?.token || req.ip,
  limit: 1000,          // 1000 requests
  window: 3600,         // per hour
  message: 'Too many requests from this token',
});
```

#### 1.4 CORS Configuration
```javascript
// Embed-specific CORS middleware

function embedCors(req, res, next) {
  const allowedOrigins = req.embed?.allowedOrigins || [];
  const origin = req.headers.origin;
  
  if (allowedOrigins.includes(origin) || allowedOrigins.includes('*')) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    res.header('X-Frame-Options', 'ALLOWALL');
  }
  next();
}
```

---

### 2. Frontend Components

#### 2.1 Embed Dashboard View
```
apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx

Props: None (reads from URL)
States:
  • dashboard: { id, title, layout, tabs, chartRefs }
  • charts: { [chartId]: chartData }
  • filters: { [filterId]: value }
  • isLoading: bool
  • isOffline: bool
  • error: string

Hooks:
  • useEmbedToken() - extract & validate token from URL
  • useEmbedSocket() - connect WebSocket with token auth
  • useDashboardData() - fetch dashboard on load
  • useRealtimeUpdates() - subscribe to chart updates

UI:
  • Minimal header (no navbar)
  • Dashboard grid (read-only)
  • Chart widgets
  • Filter bar (optional)
  • Offline indicator
  • Powered by badge
```

#### 2.2 Embed Socket Hook
```javascript
// apps/client/src/hooks/useEmbedSocket.js

function useEmbedSocket(dashboardId, token) {
  useEffect(() => {
    // Connect with auth
    const socket = io('/embed', {
      auth: { token }
    });
    
    socket.on('connect', () => {
      socket.emit('subscribe', { dashboardId });
    });
    
    socket.on('dashboard:data-update', (data) => {
      // Update specific charts
      updateChartsCache(data);
    });
    
    socket.on('disconnect', () => {
      setIsOffline(true);
      // Attempt reconnect...
    });
    
    return () => socket.disconnect();
  }, [dashboardId, token]);
}
```

#### 2.3 Embed Code Modal
```
apps/client/src/modules/dashboard/components/EmbedCodeModal.jsx

Props: { dashboard, onClose }
States:
  • expirationHours: number (default: 24)
  • allowedOrigins: string (comma-separated)
  • includeFilters: bool
  • width: number
  • height: number
  • token: string (generated)
  • loading: bool
  • copied: bool

UI Sections:
  1. Configuration Panel
     • Expiration dropdown
     • Allowed origins input
     • Width/height inputs
     • Include filters checkbox
  
  2. Generated Code Panel
     • iframe HTML snippet
     • embed URL
     • Copy button
     • QR code (optional)
  
  3. Preview Panel
     • Live preview of embed
     • Different size options
```

---

## Data Flow Diagrams

### Flow 1: Generate Embed Token

```
User Dashboard View
  ↓ (Click "Export" → "Generate Embed Code")
EmbedCodeModal opens
  ↓ (User configures: origin, expiration, etc.)
User clicks "Generate"
  ↓
POST /embed/token
  ↓ (Backend)
embedTokenAuth validates user is owner
  ↓
embedTokenService.generateToken()
  ↓
Create JWT: { dashboardId, userId, exp, scope: 'view' }
  ↓
Save token hash to DB (EmbedToken collection)
  ↓
Return: { token, embedUrl, iframeSnippet, expiresAt }
  ↓
Modal displays code + copy button
  ↓
User copies iframe snippet
  ↓
User pastes in external website
```

### Flow 2: Load Embedded Dashboard

```
External Website
  ↓ (iframe with src="...embed/dashboard-123?token=jwt")
Browser requests GET /embed/dashboard-123
  ↓
embedCors validates origin
  ↓
embedTokenAuth middleware validates token
  ↓ (JWT verified, not expired, not revoked)
Serve EmbedDashboard.jsx (React SPA)
  ↓
Browser renders iframe content
  ↓
React mounts EmbedDashboard component
  ↓
useEmbedToken extracts token from URL
  ↓
useDashboardData fetches:
  GET /embed/dashboard-123 with Bearer token
  ↓
Backend returns dashboard metadata + chart queries
  ↓
useDashboardData fetches chart data
  ↓
Charts render in read-only mode
  ↓
useEmbedSocket connects WebSocket:
  socket.io/embed?token=jwt
  ↓
Backend validates token in handshake
  ↓
Socket subscribed to dashboard data updates
  ↓
Embedded dashboard ready for interaction
```

### Flow 3: Live Data Update

```
Backend Data Changes
  ↓ (e.g., new dataset record inserted)
Dashboard refresh detected (polling or webhook)
  ↓
dashboardDataService.onDataChange()
  ↓
Query affected charts
  ↓
Emit Socket.io event:
  io.to('embed:dashboard-123').emit('dashboard:data-update', {
    chartId: 'chart-1',
    data: newChartData
  })
  ↓
All connected embed clients receive event
  ↓ (useEmbedSocket hook)
Component state updated
  ↓
Affected chart re-renders with new data
  ↓
User sees live update in embedded dashboard
```

---

## Database Schema

### Dashboard Model (Extended)
```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  layout: Array,
  tabs: Array,
  chartRefs: Array,
  createdBy: ObjectId,
  status: 'draft' | 'published',
  
  // New embed fields
  embedSettings: {
    isEmbeddable: Boolean,          // default: true
    maxActiveTokens: Number,        // default: 10
    requireOriginValidation: Boolean, // default: true
  },
  
  embedTokens: [
    {
      tokenHash: String,            // hash for security
      createdAt: Date,
      expiresAt: Date,
      revokedAt: Date,
      allowedOrigins: [String],
      createdBy: ObjectId,
      accessCount: Number,
      lastAccessedAt: Date,
    }
  ],
  
  __v: Number,
}
```

### EmbedAccessLog Collection
```javascript
{
  _id: ObjectId,
  dashboardId: ObjectId,
  tokenHash: String,
  accessTime: Date,
  referer: String,
  ipAddress: String,
  userAgent: String,
  statusCode: Number,
  responseTime: Number,
  ttl: Date,                        // auto-delete after 90 days
}
```

---

## Security Architecture

### Token Security Layers

```
┌─────────────────────────────────────────────────┐
│ User tries to access embedded dashboard         │
└──────────────────┬──────────────────────────────┘
                   ▼
        ┌──────────────────────┐
        │ Layer 1: Token Format │
        │ Must be JWT, not base64
        └──────────────┬───────┘
                       ▼
        ┌──────────────────────────┐
        │ Layer 2: Token Signature │
        │ Verify HMAC-SHA256        │
        │ with server secret        │
        └──────────────┬───────────┘
                       ▼
        ┌──────────────────────────┐
        │ Layer 3: Token Expiration │
        │ Check iat, exp claims     │
        │ not older than 24h        │
        └──────────────┬───────────┘
                       ▼
        ┌──────────────────────────────┐
        │ Layer 4: Revocation Check    │
        │ Token not in blacklist       │
        │ (Redis cache)                │
        └──────────────┬──────────────┘
                       ▼
        ┌──────────────────────────────┐
        │ Layer 5: Permission Check    │
        │ Dashboard exists & published │
        │ User can view dashboard      │
        └──────────────┬──────────────┘
                       ▼
        ┌──────────────────────────────┐
        │ Layer 6: Origin Check        │
        │ HTTP Referer in allowlist    │
        │ for token                    │
        └──────────────┬──────────────┘
                       ▼
        ┌──────────────────────────────┐
        │ Layer 7: Rate Limiting       │
        │ Max 1000 requests/hour       │
        │ per token                    │
        └──────────────┬──────────────┘
                       ▼
        ✅ ACCESS GRANTED
```

### CORS Security

```
External Domain: example.com
  ↓
Browser requests: GET /embed/dashboard-123
  Origin: https://example.com
  ↓
Server checks:
  ✓ Origin in token's allowedOrigins?
  ✓ HTTP Referer matches origin?
  ✓ Not a wildcard token?
  ✓ Token not expired?
  ↓
Response headers:
  ✓ Access-Control-Allow-Origin: https://example.com
  ✓ Access-Control-Allow-Methods: GET
  ✓ X-Frame-Options: ALLOWALL
  ✓ Content-Security-Policy: frame-ancestors 'self' https://example.com
  ↓
Browser allows iframe rendering
```

---

## Performance Optimization

### Client-Side Caching
```javascript
// Cache dashboard metadata (doesn't change often)
const [dashboard, setDashboard] = useState(null);
useEffect(() => {
  const cached = localStorage.getItem(`embed:${dashboardId}`);
  if (cached) setDashboard(JSON.parse(cached));
  
  // Fetch fresh data
  fetchDashboard().then(fresh => {
    if (JSON.stringify(fresh) !== cached) {
      setDashboard(fresh);
      localStorage.setItem(`embed:${dashboardId}`, JSON.stringify(fresh));
    }
  });
}, [dashboardId]);
```

### WebSocket Batching
```javascript
// Don't re-render on every single event
// Batch updates over 500ms window

const [pendingUpdates, setPendingUpdates] = useState({});

socket.on('dashboard:data-update', (update) => {
  setPendingUpdates(prev => ({
    ...prev,
    [update.chartId]: update
  }));
});

useEffect(() => {
  const timer = setTimeout(() => {
    // Apply all pending updates at once
    applyChartUpdates(pendingUpdates);
    setPendingUpdates({});
  }, 500);
  
  return () => clearTimeout(timer);
}, [pendingUpdates]);
```

### Lazy Loading Charts
```javascript
// Only render charts in viewport

function EmbedDashboard() {
  const [visibleCharts, setVisibleCharts] = useState(new Set());
  
  const handleIntersection = useCallback((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        setVisibleCharts(prev => new Set([...prev, entry.target.id]));
      }
    });
  }, []);
  
  return (
    <div className="dashboard">
      {dashboard.layout.map(widget => (
        <IntersectionObserver
          key={widget.id}
          onChange={handleIntersection}
        >
          {visibleCharts.has(widget.id) && (
            <ChartWidget widget={widget} />
          )}
        </IntersectionObserver>
      ))}
    </div>
  );
}
```

---

## Error Handling & Recovery

### Error States & Messages

| Scenario | HTTP Status | Message | User Action |
|----------|---|---------|-------------|
| Token missing | 401 | "Access token required" | Regenerate & copy correct snippet |
| Token expired | 403 | "Token expired. Refresh required." | Ask dashboard owner for new token |
| Token revoked | 403 | "Access revoked by dashboard owner" | Contact owner |
| Dashboard not found | 404 | "Dashboard not found" | Verify dashboard ID is correct |
| Dashboard not published | 403 | "Dashboard not available for embed" | Dashboard owner must publish |
| Origin not allowed | 403 | "Your domain is not authorized" | Add domain to allowed origins |
| Rate limited | 429 | "Too many requests. Try again later." | Wait 1 hour or request new token |
| WebSocket disconnect | - | "Connection lost. Reconnecting..." | Auto-reconnect (show banner) |
| Network error | - | "Failed to load dashboard data" | Retry button or refresh page |

---

## Deployment & Configuration

### Environment Variables Required

```bash
# .env (Backend)

# Token signing
EMBED_TOKEN_SECRET=<64-char-random-string>
EMBED_TOKEN_EXPIRATION_HOURS=24

# CORS
EMBED_ALLOWED_ORIGINS=https://example.com,https://portal.example.com

# Redis (for caching & revocation)
REDIS_URL=redis://localhost:6379

# Client URL (for iframe src)
CLIENT_URL=https://analytics-bi.com

# Socket.io
SOCKET_URL=https://api.analytics-bi.com

# Monitoring
EMBED_ACCESS_LOG_RETENTION_DAYS=90
```

### Deploy Checklist

- [ ] Generate strong `EMBED_TOKEN_SECRET`
- [ ] Configure `EMBED_ALLOWED_ORIGINS` whitelist
- [ ] Enable HTTPS for all embed endpoints
- [ ] Set up Redis for token caching
- [ ] Configure database indices on:
  - [ ] `EmbedAccessLog.ttl` (TTL index)
  - [ ] `EmbedAccessLog.dashboardId` (for queries)
  - [ ] `Dashboard.embedTokens` (for token lookups)
- [ ] Set up monitoring for:
  - [ ] Token generation rate
  - [ ] Invalid token attempts
  - [ ] Rate limit violations
- [ ] Run security audit before production launch
- [ ] Document embed setup for customers

---

## Summary

This architecture provides:
- ✅ **Secure token-based authentication** for embedded dashboards
- ✅ **Real-time data synchronization** via WebSocket
- ✅ **Origin validation** to prevent unauthorized embedding
- ✅ **Rate limiting** to prevent abuse
- ✅ **Audit logging** for compliance
- ✅ **Performance optimization** for smooth user experience
- ✅ **Graceful error handling** for production reliability

