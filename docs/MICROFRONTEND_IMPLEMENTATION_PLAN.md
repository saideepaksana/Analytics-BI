# Microfrontend Implementation Plan - Analytics-BI

**Document Created:** April 25, 2026  
**Target Completion:** 8 weeks  
**Framework:** Webpack Module Federation + Vite  
**React Version:** 19.2.0

---

## **Executive Summary**

Migrate from monolithic client app to modular microfrontend architecture. Current app structure supports 3-4 independent business domains with clear boundaries. Phased approach ensures zero downtime, maintains feature velocity, and allows parallel development.

**Key Benefits:**
- Independent deployment cycles per team
- Reduced bundle sizes (lazy loading)
- Technology flexibility (teams can upgrade individually)
- Better scalability for growing team
- Clearer domain ownership

---

## **1. CURRENT STATE ANALYSIS**

### **Identified Microfrontend Domains**

```
DOMAIN                    MODULES                        PRIORITY
──────────────────────────────────────────────────────────────────
Host/Container          home                            P0 (Foundation)
Authentication          auth (LoginPage, SignUpPage)    P0 (Blocker)
Analytics               dashboard, charts, export       P1 (High Value)
Data Management         datasets, ingestion, data-review P1 (High Value)
Advanced Tools          sql-editor, builder, settings   P2 (Nice to have)
AI Assistant           chatbot                         P2 (Additive)
```

### **Current Technology Stack**
- **Build Tool:** Vite 7.3.1
- **UI Framework:** React 19.2.0
- **Routing:** react-router-dom 7.9.4
- **HTTP Client:** axios 1.13.6
- **Real-time:** socket.io-client 4.8.3
- **Charting:** echarts 6.0.0
- **Icons:** lucide-react 0.575.0

### **Shared Backend**
- Node.js server in `/apps/server/`
- Central API endpoint (preserve as-is)
- Socket.io for real-time features

---

## **2. PROPOSED ARCHITECTURE**

### **Deployment Topology**

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           HOST APP (Container Shell)                │   │
│  │  • Routing & Navigation                             │   │
│  │  • Auth Guard & Token Management                    │   │
│  │  • Error Boundaries                                 │   │
│  │  • Global Event Bus                                 │   │
│  │  • Shared Layout (Navbar, Footer)                   │   │
│  └─────────────────────────────────────────────────────┘   │
│                         ↓                                    │
│  ┌──────────────┬──────────────┬──────────────────────┐    │
│  │              │              │                      │    │
│  ▼              ▼              ▼                      ▼    │
│ ┌────────┐ ┌────────────┐ ┌──────────┐ ┌──────────────┐   │
│ │ Auth   │ │ Analytics  │ │   Data   │ │  Advanced    │   │
│ │ MFE    │ │ MFE        │ │  Mgmt    │ │   Tools MFE  │   │
│ │        │ │ (Dashboard,│ │ MFE      │ │ (SQL Editor, │   │
│ │        │ │ Charts,    │ │(Datasets,│ │  Builder)    │   │
│ │        │ │ Export)    │ │Ingestion)│ │              │   │
│ └────────┘ └────────────┘ └──────────┘ └──────────────┘   │
│
└─────────────────────────────────────────────────────────────┘
         ↓              ↓              ↓              ↓
    CDN/Registry   (Module Federation Remote Entry Points)
         ↓              ↓              ↓              ↓
┌──────────────────────────────────────────────────────────────┐
│                   BACKEND API SERVER                         │
│              (Centralized in /apps/server/)                  │
│  • All MFEs call same backend                               │
│  • WebSocket/Socket.io for real-time                        │
│  • Stateless API design                                      │
└──────────────────────────────────────────────────────────────┘
```

### **Shared Dependency Strategy**

**Shared as Singletons (Global):**
```json
{
  "react": "^19.2.0",
  "react-dom": "^19.2.0",
  "react-router-dom": "^7.9.4",
  "axios": "^1.13.6",
  "socket.io-client": "^4.8.3"
}
```

**Reason:** Prevent duplicate React instances, unified routing, single HTTP client configuration, shared socket connection.

**NOT Shared (Per-app):**
```
- echarts (charts MFE specific)
- lucide-react (each app can use its own version)
- UI component libraries (if creating)
- State management (Redux/Zustand - if used)
```

---

## **3. REPOSITORY STRUCTURE (Post-Migration)**

```
Analytics-BI/
├── docker-compose.yml          (Updated: add MFE services)
├── docker-compose.dev.yml      (New: local development)
├── package.json                (Root workspace config)
├── README.md
├── docs/
│   ├── architecture.md
│   ├── MICROFRONTEND_IMPLEMENTATION_PLAN.md (this file)
│   ├── MFE_API_CONTRACT.md     (New: Define public APIs)
│   └── DEPLOYMENT_GUIDE.md     (New)
│
├── apps/
│   ├── host/                   (New: Container/Shell)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── vite.config.js      (Module Federation config)
│   │   ├── src/
│   │   │   ├── App.jsx
│   │   │   ├── main.jsx
│   │   │   ├── core/
│   │   │   │   ├── auth/
│   │   │   │   ├── events/     (Global event bus)
│   │   │   │   └── config/
│   │   │   ├── components/
│   │   │   │   ├── ErrorBoundary.jsx
│   │   │   │   ├── Layout.jsx
│   │   │   │   └── MFELoader.jsx
│   │   │   └── pages/
│   │   │       └── HomePage.jsx
│   │   └── public/
│   │
│   ├── mfe-auth/               (New: Auth Microfrontend)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── src/
│   │   │   ├── bootstrap.jsx
│   │   │   ├── App.jsx
│   │   │   ├── main.jsx
│   │   │   ├── remote-entry.js
│   │   │   └── modules/
│   │   │       └── auth/
│   │   │           ├── LoginPage.jsx
│   │   │           └── SignUpPage.jsx
│   │   └── public/
│   │
│   ├── mfe-analytics/          (New: Analytics Microfrontend)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── src/
│   │   │   ├── bootstrap.jsx
│   │   │   ├── App.jsx
│   │   │   ├── main.jsx
│   │   │   ├── remote-entry.js
│   │   │   └── modules/
│   │   │       ├── dashboard/
│   │   │       ├── charts/
│   │   │       └── export/
│   │   └── public/
│   │
│   ├── mfe-data-mgmt/          (New: Data Management Microfrontend)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── src/
│   │   │   ├── bootstrap.jsx
│   │   │   ├── App.jsx
│   │   │   ├── main.jsx
│   │   │   ├── remote-entry.js
│   │   │   └── modules/
│   │   │       ├── datasets/
│   │   │       ├── ingestion/
│   │   │       └── data-review/
│   │   └── public/
│   │
│   ├── mfe-tools/              (New: Advanced Tools Microfrontend)
│   │   ├── Dockerfile
│   │   ├── package.json
│   │   ├── vite.config.js
│   │   ├── src/
│   │   │   ├── bootstrap.jsx
│   │   │   ├── App.jsx
│   │   │   ├── main.jsx
│   │   │   ├── remote-entry.js
│   │   │   └── modules/
│   │   │       ├── sql-editor/
│   │   │       ├── builder/
│   │   │       └── settings/
│   │   └── public/
│   │
│   ├── shared-lib/             (New: Shared Libraries)
│   │   ├── package.json
│   │   ├── src/
│   │   │   ├── components/     (Common UI components)
│   │   │   ├── hooks/          (Shared custom hooks)
│   │   │   ├── utils/          (Utility functions)
│   │   │   ├── types/          (Shared TypeScript types)
│   │   │   └── constants/      (App constants)
│   │   └── dist/
│   │
│   ├── client/                 (Legacy: To be deprecated)
│   │   └── [Keep for now - migrate gradually]
│   │
│   └── server/                 (Keep as-is: Backend API)
│       └── [No changes needed - stateless API]
│
└── .github/
    └── workflows/
        ├── build-host.yml      (New: Host CI/CD)
        ├── build-mfe-auth.yml  (New: Auth MFE CI/CD)
        ├── build-mfe-analytics.yml
        ├── build-mfe-data-mgmt.yml
        └── build-mfe-tools.yml
```

---

## **4. IMPLEMENTATION PHASES**

### **PHASE 0: Foundation Setup (Week 1)**

**Objectives:**
- Set up Module Federation infrastructure
- Create shared library package
- Configure Vite federation plugin
- Establish development environment

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| Create `apps/shared-lib/` package | Frontend Lead | 1d | None |
| Configure vite-plugin-federation in host | Frontend Dev 1 | 1.5d | shared-lib |
| Set up EventBus for cross-MFE communication | Frontend Dev 2 | 1d | shared-lib |
| Create MFE loader component & error boundaries | Frontend Dev 1 | 1d | vite config |
| Update docker-compose.yml for local dev | DevOps | 0.5d | All above |
| Create MFE_API_CONTRACT.md template | Tech Lead | 0.5d | None |

**Deliverables:**
- ✓ `apps/shared-lib/package.json` with shared components/utils
- ✓ `apps/host/vite.config.js` with Module Federation config
- ✓ EventBus service in shared-lib
- ✓ Local docker-compose setup working
- ✓ Documentation on adding new MFE

**Definition of Done:**
```
[ ] Host app runs locally at http://localhost:5173
[ ] Remote entry points configured
[ ] Error boundary prevents cascade failures
[ ] EventBus tested with console logs
[ ] Team can create new MFE from template
```

---

### **PHASE 1: Extract Auth MFE (Week 2)**

**Why First:**
- No dependencies on other modules
- All features depend on auth
- Clear boundaries (LoginPage, SignUpPage)
- Enables testing MFE setup

**Objectives:**
- Extract auth module as independent MFE
- Implement centralized token management
- Auth guard in host app
- Test SSO/session sharing

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| Create `apps/mfe-auth/` from `apps/client/modules/auth/` | Frontend Dev 1 | 2d | Phase 0 |
| Configure vite.config.js for auth MFE | Frontend Dev 1 | 1d | Phase 0 |
| Extract auth service to shared-lib | Frontend Dev 2 | 1d | Phase 0 |
| Implement AuthProvider context in host | Frontend Dev 2 | 1d | Phase 1.1 |
| Create auth event system (authChanged, logout) | Frontend Dev 1 | 1d | Phase 1.2 |
| Update host routing to load auth MFE | Frontend Dev 1 | 1d | Phase 1.3 |
| Test: Login → Store token → Access other routes | Frontend Lead | 1d | Phase 1.4 |

**Deliverables:**
- ✓ Auth MFE deployed independently
- ✓ Host guards /admin routes until authenticated
- ✓ Token persisted in localStorage + shared via window
- ✓ Other MFEs can access auth context

**Configuration Changes:**

**vite.config.js for mfe-auth:**
```javascript
// Expose auth module
exposes: {
  './AuthPage': './src/modules/auth/AuthPage.jsx',
  './useAuth': './src/hooks/useAuth.js',
  './authService': './src/services/auth.service.js'
}
```

**Host app auth guard:**
```javascript
// src/components/ProtectedRoute.jsx
- Redirect to /auth/login if no token
- Share token to all loaded MFEs
```

**Definition of Done:**
```
[ ] mfe-auth deployed to http://mfe-auth:5001
[ ] Host loads auth at route /auth
[ ] Token accessible to all MFEs via window.__AUTH__
[ ] Logout from any MFE clears token globally
[ ] Unit tests passing (auth service)
[ ] Manual testing: Login/Logout/Token refresh
```

---

### **PHASE 2: Extract Analytics MFE (Week 3-4)**

**Why Second:**
- High-value features (dashboard, charts)
- Depends on auth (now available)
- Encapsulated business logic
- Can iterate independently

**Objectives:**
- Migrate dashboard + charts + export modules
- Share echarts library
- Implement data sync events
- Enable independent deployment

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| Create `apps/mfe-analytics/` structure | Frontend Dev 1 | 1d | Phase 1 |
| Migrate dashboard, charts, export modules | Frontend Dev 1 + 2 | 2d | Phase 1 |
| Extract charts.service → shared-lib | Frontend Dev 2 | 1d | Phase 1 |
| Extract dashboard.service → shared-lib | Frontend Dev 2 | 1d | Phase 1 |
| Configure echarts sharing in vite.config | Frontend Dev 1 | 0.5d | Phase 1 |
| Implement data sync events (dataUpdated, exportComplete) | Frontend Dev 2 | 1d | Phase 1 |
| Update host router: `/analytics` → mfe-analytics | Frontend Dev 1 | 1d | Phase 2.5 |
| Integration test: Create chart → Export → Verify | Frontend Lead | 1d | Phase 2.6 |

**Deliverables:**
- ✓ Dashboard accessible at /analytics
- ✓ Charts render independently
- ✓ Export triggers events that notify other MFEs
- ✓ Analytics MFE can be redeployed without touching host

**API Contract (mfe-analytics):**
```javascript
// Exposes to host:
./Dashboard = './src/modules/dashboard/Dashboard.jsx'
./Charts = './src/modules/charts/ChartCard.jsx'
./useCharts = './src/hooks/useCharts.js'

// Subscribes to events:
'data:updated' → Refresh charts
'auth:logout' → Clear local state

// Publishes events:
'export:started'
'export:completed'
'chart:created'
'chart:deleted'
```

**Definition of Done:**
```
[ ] mfe-analytics deployed to http://mfe-analytics:5002
[ ] Dashboard loads at /analytics route
[ ] Charts render with echarts
[ ] Export button triggers cross-app event
[ ] Performance: Bundle < 500KB (gzipped)
[ ] Unit tests: 80%+ coverage for services
[ ] E2E test: Full workflow (view chart → export)
```

---

### **PHASE 3: Extract Data Management MFE (Week 4-5)**

**Objectives:**
- Migrate datasets, ingestion, data-review modules
- Implement file upload handling
- Subscribe to auth events
- Data sync with analytics MFE

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| Create `apps/mfe-data-mgmt/` structure | Frontend Dev 1 | 1d | Phase 2 |
| Migrate datasets, ingestion, data-review | Frontend Dev 1 + 2 | 2d | Phase 2 |
| Extract upload.service, datasets.service → shared-lib | Frontend Dev 2 | 1d | Phase 2 |
| Implement dataset creation → publish 'data:uploaded' event | Frontend Dev 2 | 1d | Phase 2 |
| Listen to export events from analytics | Frontend Dev 1 | 0.5d | Phase 2 |
| Configure socket.io integration (real-time uploads) | Frontend Dev 1 | 1d | Phase 2 |
| Update host router: `/data-mgmt` → mfe-data-mgmt | Frontend Dev 1 | 0.5d | Phase 3.5 |
| Integration test: Upload dataset → View in analytics | Frontend Lead | 1d | Phase 3.6 |

**Deliverables:**
- ✓ Datasets page at /data-mgmt
- ✓ File upload triggers real-time progress
- ✓ Analytics MFE detects new datasets (via events)
- ✓ Data-review workflow functional

**Event Flow:**
```
User uploads CSV in mfe-data-mgmt
  → emit 'data:uploaded' {datasetId, name}
    → mfe-analytics listens, refreshes available datasets
      → User can now use new dataset in charts
```

**Definition of Done:**
```
[ ] mfe-data-mgmt deployed to http://mfe-data-mgmt:5003
[ ] File upload works with real-time progress
[ ] Uploaded dataset visible in analytics MFE
[ ] Socket.io connection managed globally
[ ] Performance: Bundle < 400KB (gzipped)
[ ] E2E test: Upload → Use in chart → Export
```

---

### **PHASE 4: Extract Advanced Tools MFE (Week 5-6)**

**Objectives:**
- Migrate SQL-editor, builder, settings
- Share editor components
- Settings affect all MFEs via events
- Optional/can be deferred if lower priority

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| Create `apps/mfe-tools/` structure | Frontend Dev 1 | 0.5d | Phase 3 |
| Migrate sql-editor, builder, settings modules | Frontend Dev 1 | 1.5d | Phase 3 |
| Extract query service → shared-lib | Frontend Dev 2 | 0.5d | Phase 3 |
| Implement settings state sync (publish 'settings:changed') | Frontend Dev 2 | 1d | Phase 3 |
| Update host router: `/tools` → mfe-tools | Frontend Dev 1 | 0.5d | Phase 4.3 |
| All MFEs subscribe to 'settings:changed' | All | 1d | Phase 4.4 |
| Integration test: SQL query → Save in favorites | Frontend Lead | 0.5d | Phase 4.5 |

**Definition of Done:**
```
[ ] mfe-tools deployed to http://mfe-tools:5004
[ ] SQL Editor accessible at /tools/sql-editor
[ ] Query builder functional
[ ] Settings changes propagate to all MFEs
[ ] Performance: Bundle < 300KB (gzipped)
```

---

### **PHASE 5: Optimization & Hardening (Week 6-7)**

**Objectives:**
- Lazy load MFEs (don't load until route accessed)
- Error boundaries + fallback UI
- Shared error tracking
- Performance monitoring
- Security audit

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| Implement lazy loading for each MFE route | Frontend Dev 1 | 1d | Phase 4 |
| Create ErrorBoundary for each MFE container | Frontend Dev 2 | 1d | Phase 4 |
| Fallback UI: "Service temporarily unavailable" | Frontend Dev 2 | 0.5d | Phase 5.2 |
| Global error tracking (Sentry/similar) | DevOps | 1d | Phase 4 |
| Performance audit: Bundle analysis, load times | Frontend Lead | 1d | Phase 4 |
| Security audit: CORS, CSP, token storage | Security Lead | 1d | Phase 4 |
| Implement versioning strategy for MFEs | Tech Lead | 0.5d | Phase 5.6 |
| Create rollback procedure | DevOps | 0.5d | Phase 5.6 |

**Deliverables:**
- ✓ Each MFE loads only when needed
- ✓ Failed MFE doesn't crash entire app
- ✓ Performance metrics tracked
- ✓ Security checklist passed

**Definition of Done:**
```
[ ] Initial page load: < 300KB (host + shared)
[ ] MFE bundle < 200KB each (gzipped)
[ ] Error boundaries catch React errors
[ ] All MFEs recover from network failures
[ ] CORS whitelist configured
[ ] CSP headers validated
```

---

### **PHASE 6: Testing & QA (Week 7)**

**Objectives:**
- Cross-MFE integration tests
- E2E workflows
- Performance testing
- Production readiness checklist

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| Write E2E tests (Cypress/Playwright) | QA Lead | 2d | Phase 5 |
| Test all inter-MFE event flows | QA Lead + Dev | 1.5d | Phase 5 |
| Load test: 100+ concurrent users | DevOps | 1d | Phase 5 |
| Browser compatibility testing (Chrome, Firefox, Safari) | QA | 1d | Phase 5 |
| Mobile responsiveness testing | QA | 1d | Phase 5 |
| Production readiness checklist | Tech Lead | 0.5d | Phase 6.4 |

**E2E Test Scenarios:**
```
1. Auth flow: Signup → Login → Logout
2. Data workflow: Upload → View in Analytics → Export
3. Advanced workflow: SQL Query → Save → Use in Chart
4. Error recovery: Kill MFE → See fallback → Reload
5. Performance: Load all MFEs sequentially within 5s
```

**Definition of Done:**
```
[ ] All E2E tests passing
[ ] Load test: 100 concurrent users, < 2s response
[ ] Cross-browser: Chrome, Firefox, Safari ✓
[ ] Mobile: iOS Safari, Android Chrome ✓
[ ] Accessibility: WCAG 2.1 AA ✓
[ ] All stakeholders sign-off
```

---

### **PHASE 7: Production Deployment (Week 8)**

**Objectives:**
- Deploy to production
- Monitor MFE health
- Gradual rollout (canary)
- Rollback procedure ready

**Tasks:**

| Task | Owner | Duration | Dependencies |
|------|-------|----------|--------------|
| Set up production CDN/registry for remote entries | DevOps | 1d | Phase 6 |
| Configure DNS/load balancing | DevOps | 1d | Phase 6 |
| Deploy host to production | DevOps | 0.5d | Phase 7.1 |
| Deploy mfe-auth to production | DevOps | 0.5d | Phase 7.1 |
| Deploy mfe-analytics to production (canary 10%) | DevOps | 0.5d | Phase 7.2 |
| Monitor: Error rates, latency, bundle load times | DevOps + Dev | 1d | Phase 7.3 |
| Gradual rollout: 10% → 25% → 50% → 100% | DevOps | 2d | Phase 7.3 |
| Setup alerting & on-call rotation | DevOps | 0.5d | Phase 7.3 |
| Document runbooks: MFE deployment, rollback, debugging | Tech Lead | 1d | Phase 7.3 |

**Definition of Done:**
```
[ ] All MFEs running in production
[ ] Health checks passing
[ ] 99%+ uptime in first week
[ ] No user-facing errors
[ ] Team trained on MFE operations
[ ] Runbooks reviewed and approved
```

---

## **5. CONFIGURATION EXAMPLES**

### **Host App - vite.config.js (Phase 0)**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'host',
      filename: 'remoteEntry.js',
      remotes: {
        // Map to local dev URLs, override in production via manifest
        auth: 'http://localhost:5001/remoteEntry.js',
        analytics: 'http://localhost:5002/remoteEntry.js',
        dataMgmt: 'http://localhost:5003/remoteEntry.js',
        tools: 'http://localhost:5004/remoteEntry.js',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.2.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.2.0' },
        'react-router-dom': { singleton: true, requiredVersion: '^7.9.4' },
        axios: { singleton: true, requiredVersion: '^1.13.6' },
        'socket.io-client': { singleton: true, requiredVersion: '^4.8.3' },
      },
    }),
  ],
  build: {
    target: 'esnext',
    minify: 'terser',
  },
});
```

### **MFE Auth - vite.config.js (Phase 1)**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import federation from '@originjs/vite-plugin-federation';

export default defineConfig({
  plugins: [
    react(),
    federation({
      name: 'mfeAuth',
      filename: 'remoteEntry.js',
      exposes: {
        './AuthPage': './src/modules/auth/index.jsx',
        './useAuth': './src/hooks/useAuth.js',
        './authService': './src/services/auth.service.js',
      },
      shared: {
        react: { singleton: true, requiredVersion: '^19.2.0' },
        'react-dom': { singleton: true, requiredVersion: '^19.2.0' },
        'react-router-dom': { singleton: true, requiredVersion: '^7.9.4' },
        axios: { singleton: true, requiredVersion: '^1.13.6' },
      },
    }),
  ],
});
```

### **EventBus - shared-lib (Phase 0)**

```javascript
// apps/shared-lib/src/utils/eventBus.js

class EventBus {
  constructor() {
    this.listeners = {};
  }

  on(event, callback) {
    if (!this.listeners[event]) {
      this.listeners[event] = [];
    }
    this.listeners[event].push(callback);
    
    // Return unsubscribe function
    return () => {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    };
  }

  emit(event, data) {
    if (this.listeners[event]) {
      this.listeners[event].forEach(callback => callback(data));
    }
  }

  off(event, callback) {
    if (this.listeners[event]) {
      this.listeners[event] = this.listeners[event].filter(cb => cb !== callback);
    }
  }
}

export const globalEventBus = new EventBus();

// Usage in MFEs:
// import { globalEventBus } from '@shared/utils';
// globalEventBus.on('data:uploaded', (data) => { /* refresh */ });
// globalEventBus.emit('data:uploaded', { datasetId: 123 });
```

### **Auth Context - Host App (Phase 1)**

```javascript
// apps/host/src/core/auth/AuthContext.jsx

import React, { createContext, useState, useEffect } from 'react';

export const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  useEffect(() => {
    // Share token globally so MFEs can access
    if (token) {
      window.__AUTH__ = { token, user };
      localStorage.setItem('token', token);
    } else {
      delete window.__AUTH__;
      localStorage.removeItem('token');
    }
  }, [token, user]);

  const logout = () => {
    setUser(null);
    setToken(null);
    globalEventBus.emit('auth:logout');
  };

  return (
    <AuthContext.Provider value={{ user, token, setUser, setToken, logout }}>
      {children}
    </AuthContext.Provider>
  );
};
```

---

## **6. SHARED API CONTRACT**

### **Events Specification**

```javascript
// Global events all MFEs subscribe to

// Authentication
'auth:login' → { userId, token, email }
'auth:logout' → {}
'auth:tokenRefreshed' → { newToken }

// Data Management
'data:uploaded' → { datasetId, name, rowCount }
'data:deleted' → { datasetId }
'data:processed' → { datasetId, schema }

// Analytics
'chart:created' → { chartId, name, datasetId }
'chart:updated' → { chartId }
'chart:deleted' → { chartId }
'export:started' → { chartId, format }
'export:completed' → { chartId, url }
'export:failed' → { chartId, error }

// Settings
'settings:changed' → { key, value }
'theme:changed' → { theme }

// Error Handling
'error:critical' → { message, stack, mfe }
'error:warning' → { message, mfe }
```

### **Shared Service Contract**

```javascript
// Exposed by shared-lib, imported by all MFEs

// HTTP Client
export const apiClient = axios.create({
  baseURL: process.env.VITE_API_URL,
  // Token injected in interceptor from window.__AUTH__
});

// Authentication
export const useAuth = () => {
  const ctx = useContext(AuthContext);
  return {
    user: ctx.user,
    token: ctx.token,
    logout: ctx.logout,
    isAuthenticated: !!ctx.token,
  };
};

// Event Bus
export { globalEventBus };

// Logger
export const logger = {
  info: (msg, data) => console.log(msg, data),
  error: (msg, error) => console.error(msg, error),
  warn: (msg, data) => console.warn(msg, data),
};

// Constants
export const API_ENDPOINTS = {
  CHARTS: '/api/charts',
  DATASETS: '/api/datasets',
  EXPORTS: '/api/exports',
  // ...
};
```

---

## **7. TESTING STRATEGY**

### **Unit Tests (Per MFE)**

```
Coverage Target: 80%+

mfe-auth/
  ✓ useAuth hook
  ✓ LoginPage component
  ✓ auth.service.js

mfe-analytics/
  ✓ useCharts hook
  ✓ Dashboard component
  ✓ charts.service.js
  ✓ Event subscriptions

mfe-data-mgmt/
  ✓ File upload handler
  ✓ datasets.service.js
  ✓ Event emissions
```

### **Integration Tests**

```
Test Suite: Cross-MFE event flows

1. Auth Flow
   ✓ Login in mfe-auth → token in window.__AUTH__
   ✓ Navigate to /analytics → data loads (auth token used)
   ✓ Logout in mfe-auth → all MFEs clear state

2. Data Flow
   ✓ Upload dataset in mfe-data-mgmt
   ✓ 'data:uploaded' event fires
   ✓ mfe-analytics receives event, refreshes dataset list
   ✓ User can select new dataset for chart

3. Export Flow
   ✓ Export chart in mfe-analytics
   ✓ 'export:started' event fires
   ✓ mfe-data-mgmt listens (optional dependency)
   ✓ Export completes, user gets link
```

### **E2E Tests (Cypress)**

```
Scenarios:
1. Full registration & login workflow
2. Upload data → Create chart → Export
3. Switch between all MFEs
4. Kill one MFE service, see fallback UI
5. Refresh page, maintain auth state
6. Concurrent requests from multiple MFEs
```

### **Performance Tests**

```
Metrics:
- Initial load: < 3s (first paint)
- Time to Interactive: < 5s
- Bundle sizes (gzipped):
  Host: < 300KB
  Each MFE: < 200KB
- Lazy load time per MFE: < 2s

Tools: Lighthouse, Web Vitals
```

---

## **8. DEPLOYMENT STRATEGY**

### **Local Development (docker-compose.dev.yml)**

```yaml
version: '3.8'
services:
  host:
    build: ./apps/host
    ports: ['5173:5173']
    environment:
      VITE_API_URL: http://server:3000
    depends_on: [server]

  mfe-auth:
    build: ./apps/mfe-auth
    ports: ['5001:5001']
    environment:
      VITE_API_URL: http://server:3000

  mfe-analytics:
    build: ./apps/mfe-analytics
    ports: ['5002:5002']
    environment:
      VITE_API_URL: http://server:3000

  mfe-data-mgmt:
    build: ./apps/mfe-data-mgmt
    ports: ['5003:5003']
    environment:
      VITE_API_URL: http://server:3000

  server:
    build: ./apps/server
    ports: ['3000:3000']
    environment:
      NODE_ENV: development
```

### **Production Deployment**

```
Strategy: Blue-Green with Canary

Step 1: Build
  - Build host → Output: host.js, host.js.map
  - Build each MFE → Output: remoteEntry.js, [mfe-auth.js, ...]
  - Upload to CDN (CloudFront, S3, etc.)

Step 2: Manifest Update
  - Update manifest.json with new remote entry URLs
  - Deploy to asset server

Step 3: Deployment
  - Blue environment: Old version still running
  - Green environment: New version deployed
  - Canary: Route 10% traffic to green
  - Monitor: Error rates, latency
  - Gradual rollout: 10% → 25% → 50% → 100%
  - Rollback: 1-click back to blue if issues

Step 4: Monitoring
  - Sentry for error tracking
  - Datadog for performance
  - PagerDuty for alerts
```

### **CI/CD Pipelines**

**Per MFE (.github/workflows/build-mfe-auth.yml):**

```yaml
name: Build mfe-auth

on:
  push:
    branches: [main]
    paths:
      - 'apps/mfe-auth/**'
      - 'apps/shared-lib/**'

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'
      
      - run: npm install --workspace=mfe-auth
      - run: npm run build --workspace=mfe-auth
      - run: npm run test --workspace=mfe-auth
      
      - name: Upload to CDN
        run: |
          aws s3 sync apps/mfe-auth/dist s3://cdn.example.com/mfe-auth \
            --cache-control "max-age=31536000"
      
      - name: Update manifest
        run: |
          curl -X POST https://manifest-api/update \
            -d '{"mfe":"auth","version":"${{ github.sha }}"}'
```

---

## **9. RISK MANAGEMENT**

### **Identified Risks & Mitigation**

| Risk | Impact | Probability | Mitigation |
|------|--------|-------------|-----------|
| **Shared dependency version mismatch** | Breaking changes | Medium | Use singleton shared deps, strict versioning |
| **MFE deployment lag (async)** | Stale UI, data inconsistency | High | Manifest-based versioning, rollback ready |
| **Network failure loading remote** | Blank screen, poor UX | Medium | Error boundaries, offline fallback |
| **Token expiration mid-session** | User session drops | Medium | Global token refresh interceptor |
| **Performance degradation** | Slow app, user churn | Medium | Lazy loading, bundle analysis in CI |
| **Security: Token in window** | XSS vulnerability | Low | CSP headers, sanitize input, HTTPOnly cookies alternative |
| **Team coordination delays** | Schedule slips | Medium | Clear ownership, weekly syncs |

### **Contingency Plans**

```
If Phase 2 (Analytics) is delayed:
  → Skip Phase 3, move directly to Phase 4 (Tools)
  → Or extend Phase 1 (Auth) for stability

If production issues found:
  → Instant rollback: Deploy previous version manifest
  → Hotfix: Deploy patch version within minutes
  → Root cause analysis within 24h
```

---

## **10. SUCCESS CRITERIA & METRICS**

### **Launch Readiness Checklist**

- [ ] All phases completed & tested
- [ ] 99%+ uptime in staging (1 week)
- [ ] Performance benchmarks met (bundle sizes, load times)
- [ ] Security audit passed (CORS, CSP, tokens)
- [ ] Team trained on MFE operations
- [ ] Runbooks created & reviewed
- [ ] Rollback procedure tested
- [ ] Monitoring/alerting in place
- [ ] Stakeholder sign-off

### **Post-Launch Metrics**

```
Week 1: Stability
  ✓ Error rate < 0.1%
  ✓ Uptime > 99%
  ✓ P95 latency < 2s

Month 1: Performance
  ✓ Bundle size: host 250KB, MFEs 150KB avg (gzipped)
  ✓ Initial load: < 3s
  ✓ Time to Interactive: < 5s

Month 3: Velocity
  ✓ Feature deployment time: < 30 min (vs current)
  ✓ Team can deploy independently
  ✓ Zero coordination needed for MFE-only changes
```

---

## **11. TEAM RESPONSIBILITIES**

### **Role Breakdown**

```
Tech Lead / Architect
  ├─ Define MFE boundaries (done ✓)
  ├─ Design API contract
  ├─ Approve all vite.config changes
  └─ Resolve integration issues

Frontend Lead (Host + Shared)
  ├─ Implement host app shell
  ├─ Build shared-lib package
  ├─ Create EventBus system
  └─ Own cross-MFE communication

Frontend Dev 1 (Configuration & Setup)
  ├─ Configure vite-plugin-federation
  ├─ Set up docker-compose
  ├─ Extract auth MFE (Phase 1)
  └─ Extract analytics MFE (Phase 2-3)

Frontend Dev 2 (Services & Integration)
  ├─ Extract shared services
  ├─ Implement event subscriptions
  ├─ Error handling & fallbacks
  └─ E2E test scenarios

QA Lead
  ├─ Define test strategy
  ├─ Write integration tests
  ├─ Performance testing
  └─ Production validation

DevOps
  ├─ Docker image setup
  ├─ CDN configuration
  ├─ CI/CD pipelines
  ├─ Monitoring & alerting
  └─ Production deployment
```

---

## **12. GLOSSARY & REFERENCES**

### **Key Terms**

```
MFE: Micro Frontend - independently deployed UI modules
Host/Container: Root app that loads & orchestrates MFEs
Remote Entry: remoteEntry.js file that exposes MFE modules
Module Federation: Webpack/Vite technology for dynamic module loading
Shared Deps: Libraries (React, axios) used by multiple MFEs
Event Bus: Global publish-subscribe system for inter-MFE communication
```

### **External Resources**

- [Webpack Module Federation Docs](https://webpack.js.org/concepts/module-federation/)
- [Vite Plugin Federation](https://github.com/originjs/vite-plugin-federation)
- [Micro Frontends Book](https://micro-frontends.org/)
- [Module Federation Best Practices](https://webpack.js.org/concepts/module-federation/)

---

## **13. TIMELINE SUMMARY**

```
Week 1 (Apr 28 - May 4)
  Phase 0: Foundation Setup
  Deliverable: Dev environment working

Week 2 (May 5 - May 11)
  Phase 1: Extract Auth MFE
  Deliverable: Auth MFE deployed independently

Week 3-4 (May 12 - May 25)
  Phase 2: Extract Analytics MFE
  Deliverable: Dashboard + Charts working as MFE

Week 4-5 (May 26 - Jun 8)
  Phase 3: Extract Data Mgmt MFE
  Deliverable: Data upload + ingestion as MFE

Week 5-6 (Jun 9 - Jun 22)
  Phase 4: Extract Tools MFE
  Phase 5: Optimization & Hardening
  Deliverable: All MFEs performant & resilient

Week 6-7 (Jun 23 - Jul 6)
  Phase 6: Testing & QA
  Deliverable: All tests passing, ready for prod

Week 8 (Jul 7 - Jul 13)
  Phase 7: Production Deployment
  Deliverable: Live in production, monitored
```

---

## **14. NEXT STEPS (Immediate)**

1. **Review & Approve**
   - [ ] Tech lead reviews this plan
   - [ ] Stakeholders sign off on timeline
   - [ ] Team confirms bandwidth

2. **Week 1 Kickoff**
   - [ ] Schedule Phase 0 planning meeting
   - [ ] Create `apps/shared-lib/` structure
   - [ ] Set up vite-plugin-federation POC

3. **Documentation**
   - [ ] Create MFE_API_CONTRACT.md (template)
   - [ ] Set up runbooks repository
   - [ ] Create troubleshooting guide

4. **Tooling**
   - [ ] Verify Node.js 18+ installed
   - [ ] Install vite-plugin-federation
   - [ ] Set up monitoring (Sentry, Datadog)

---

## **Revision History**

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | Apr 25, 2026 | Tech Lead | Initial plan |
| - | - | - | - |

---

**Document Owner:** Tech Lead  
**Last Updated:** April 25, 2026  
**Next Review:** After Phase 0 completion

