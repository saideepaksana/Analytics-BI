# iframe Embed Implementation - Visual Quick Start Guide

---

## What Exactly You're Building

```
┌────────────────────────────────────────────────────────────────────┐
│ USER STORY: "Generate iframe embed code for live dashboards"     │
└────────────────────────────────────────────────────────────────────┘

                            YOUR APPLICATION
                              Analytics BI
                            
                     📊 Dashboard Editor Page
                          ↓
                    [Export Button] 
                    Click to open menu
                          ↓
         ┌─────────────────┼─────────────────┐
         │                 │                 │
      📄 PDF          🖼️ PNG          💻 **EMBED** (NEW)
      Export          Export          Generate Code
                                           ↓
                              ┌────────────────────────┐
                              │ EmbedCodeModal Opens   │
                              │  (NEW COMPONENT)       │
                              │                        │
                              │ 📋 Configure:          │
                              │ • Expiration: 24h ▼    │
                              │ • Domains: example.com │
                              │ • Width: 100%          │
                              │ • Height: 600px        │
                              │                        │
                              │ [Generate Token]       │
                              └────────────────────────┘
                                      ↓
                              ┌──────────────────────────────┐
                              │ Generated iframe snippet:    │
                              │                              │
                              │ <iframe src="https://...     │
                              │ ?token=eyJhbGci..."          │
                              │ width="100%"                 │
                              │ height="600"                 │
                              │ frameborder="0">             │
                              │ </iframe>                    │
                              │                              │
                              │ [Copy] [Preview]             │
                              └──────────────────────────────┘
                                      ↓
                              User copies snippet
                                      ↓
                    Pastes into external website HTML
                                      ↓
┌─────────────────────────────────────────────────────────────┐
│ EXTERNAL WEBSITE (partner.com, client portal, etc.)        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  <html>                                                      │
│  <body>                                                      │
│                                                              │
│  <h1>Our Analytics Dashboard</h1>                           │
│                                                              │
│  <iframe src="https://analytics-bi.com/embed/123            │
│          ?token=eyJhbGc..." width="100%" height="600">      │
│  </iframe>                                                   │
│                                                              │
│  </body>                                                     │
│  </html>                                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
                                      ↓
                    Browser requests dashboard
                    with token in URL
                                      ↓
           YOUR BACKEND validates token & returns
              dashboard data (read-only)
                                      ↓
              Embedded Dashboard appears
              (Live data, read-only, no edit tools)
                                      ↓
                  Data updates in real-time
                  via WebSocket connection
```

---

## The 3 Main Tasks Explained Simply

### Task 1️⃣: Generate Iframe Embed Code

**In Plain English:**
Create a way for users to generate a special HTML snippet that can be pasted into any website to show a live dashboard.

**What Users Do:**
1. Open a published dashboard
2. Click "Export" → "Generate Embed Code"
3. Configure options (expiration, allowed domains)
4. Click "Generate"
5. Copy the `<iframe>` code
6. Paste it into their website HTML

**What You Build:**
- **Backend:** `POST /embed/token` endpoint that creates a secure token
- **Frontend:** Modal component with UI for configuration and copy button
- **Token:** JWT (not base64!) that proves user has permission

**Why It Matters:**
Without this, customers have to manually export/screenshot/copy dashboards. With this, they get **live** embedded dashboards that update automatically.

---

### Task 2️⃣: Secure Access with Token Validation

**In Plain English:**
Make sure only authorized people can view embedded dashboards, and only from allowed websites.

**Security Layers:**
```
Step 1: Browser requests embed
        ↓
Step 2: Must include valid token in URL
        ↓
Step 3: Server validates token signature (JWT)
        ↓
Step 4: Check token not expired (was created < 24h ago)
        ↓
Step 5: Check token not revoked (owner didn't disable it)
        ↓
Step 6: Check origin is allowed (browser domain matches whitelist)
        ↓
Step 7: Check dashboard still published (owner didn't unpublish)
        ↓
✅ Access Granted → Return dashboard data
❌ Access Denied → Return error
```

**What You Build:**
- **Middleware:** Check token on every request
- **Token Service:** Verify JWT signature, expiration, revocation status
- **CORS Headers:** Allow specific domains to embed
- **Rate Limiting:** Max 1000 requests/hour per token (prevent abuse)
- **Audit Log:** Track all access attempts (who, when, where, success/fail)

**Why It Matters:**
- Prevents random people from viewing dashboards they shouldn't see
- Prevents hackers from embedding your dashboards on malicious sites
- Creates audit trail for compliance
- Blocks bot attacks with rate limiting

---

### Task 3️⃣: Live Data Updates (No Manual Re-export)

**In Plain English:**
When data in your database changes, embedded dashboards automatically update. User doesn't need to refresh browser or regenerate embed code.

**How It Works:**

```
Scenario: New customer signed up (data in database changes)
                                      ↓
Your backend detects data change
                                      ↓
Backend emits WebSocket event:
"dashboard 123's customer chart changed"
                                      ↓
All browsers with that dashboard embedded receive event
                                      ↓
Dashboard component re-fetches chart data
                                      ↓
Chart animates to new values
                                      ↓
User in external website sees live update
(no page refresh needed!)
```

**What You Build:**
- **WebSocket Connection:** Embedded dashboard connects with token
- **Event Handling:** Listen for data change events
- **Smart Refresh:** Only re-fetch affected charts (not entire dashboard)
- **Offline Mode:** Show "Offline" if connection drops, auto-reconnect
- **Batching:** Don't redraw 100 times per second, batch updates

**Why It Matters:**
- Embedded dashboards feel "alive" (not static)
- Users see latest data without manual refresh
- Provides better user experience for customers
- Competitive advantage over static exports

---

## What Gets Built - File by File

### 🔧 Backend Files (Server-Side)

**NEW FILES:**
```javascript
// 1. Token Generation & Validation
src/services/embedTokenService.js
  • generateToken() → creates JWT token
  • validateToken() → verifies signature, not expired
  • revokeToken() → adds to blacklist
  
// 2. Request Validation
src/middleware/embedTokenAuth.js
  • Extract token from request
  • Call embedTokenService.validateToken()
  • Reject if invalid/expired
  • Attach to req.embed for next middleware
  
// 3. Audit Trail
src/models/EmbedAccessLog.js
  • Store: dashboardId, tokenHash, accessTime, 
          referer, ipAddress, statusCode
  • Auto-delete after 90 days
```

**MODIFIED FILES:**
```javascript
// 1. Export Controller - ADD this function
src/api/export/exportController.js
  • generateEmbedToken() 
    [Already exists but uses base64 - needs JWT upgrade]
    
// 2. New endpoints for embed management
src/export/exportRoutes.js
  • POST /embed/token              (generate token)
  • GET /embed/:dashboardId         (access embedded dashboard)
  • GET /embed/tokens/:dashboardId  (list tokens for owner)
  • DELETE /embed/token/:tokenId    (revoke token)
  
// 3. Database model for Dashboard
src/models/Dashboard.js
  • Add: embedSettings { isEmbeddable, maxTokens }
  • Add: embedTokens [ { tokenHash, expiresAt, revokedAt, ... } ]
```

### 🎨 Frontend Files (Client-Side)

**NEW FILES:**
```javascript
// 1. Embed Page View
apps/client/src/modules/dashboard/pages/EmbedDashboard.jsx
  • Minimal UI (no navbar, no sidebar)
  • Read-only mode
  • Fetch dashboard data with token
  • Connect to WebSocket for live updates
  • Handle offline/reconnect
  
// 2. Token Generator Modal
apps/client/src/modules/dashboard/components/EmbedCodeModal.jsx
  • Show configuration form
  • Display generated iframe code
  • Copy button
  • Preview
  
// 3. WebSocket Hook
apps/client/src/hooks/useEmbedSocket.js
  • Connect socket with token auth
  • Subscribe to dashboard events
  • Handle data updates
  • Detect disconnect/reconnect
```

**MODIFIED FILES:**
```javascript
// 1. Dashboard Editor
apps/client/src/modules/dashboard/components/DashboardEditor.jsx
  • Add "Generate Embed Code" button to export menu
  • Open EmbedCodeModal when clicked
```

---

## Step-by-Step Implementation Order

```
WEEK 1-2: Backend Foundation
├─ [ ] Create embedTokenService.js
├─ [ ] Create embedTokenAuth.js middleware
├─ [ ] Extend Dashboard model with embedSettings
├─ [ ] Create EmbedAccessLog model
├─ [ ] Modify generateEmbedToken() to use JWT
├─ [ ] Add 3 new endpoints to exportRoutes
├─ [ ] Add rate limiting middleware
├─ [ ] Add CORS configuration for embeds
└─ [ ] Test all backend endpoints

WEEK 3-4: Frontend Infrastructure
├─ [ ] Create EmbedDashboard component (basic structure)
├─ [ ] Add routing: /embed/:dashboardId
├─ [ ] Implement token extraction from URL
├─ [ ] Fetch dashboard data with token auth
├─ [ ] Render dashboard in read-only mode
├─ [ ] Test embed page loads correctly
└─ [ ] Test with invalid/expired tokens (error handling)

WEEK 5: Real-Time Updates
├─ [ ] Create useEmbedSocket hook
├─ [ ] Connect WebSocket with token auth
├─ [ ] Handle data update events
├─ [ ] Implement smart chart refresh
├─ [ ] Add offline indicator & auto-reconnect
├─ [ ] Test live data updates
└─ [ ] Test disconnect/reconnect scenarios

WEEK 6: UI & User Experience
├─ [ ] Create EmbedCodeModal component
├─ [ ] Add configuration form
├─ [ ] Display generated iframe snippet
├─ [ ] Implement copy-to-clipboard
├─ [ ] Add "Generate Embed Code" button to export menu
├─ [ ] Create token management page (revoke, view logs)
└─ [ ] User test: Generate → Copy → Embed → Works?

WEEK 7: Testing & Security
├─ [ ] Unit tests (token validation, permissions)
├─ [ ] Integration tests (full embed flow)
├─ [ ] Security tests (CORS, rate limiting, XSS)
├─ [ ] Cross-browser testing
├─ [ ] Performance testing
├─ [ ] Security audit
└─ [ ] Bug fixes

WEEK 8: Documentation & Launch
├─ [ ] API documentation
├─ [ ] Integration guide for customers
├─ [ ] Troubleshooting guide
├─ [ ] Code examples
├─ [ ] Internal documentation
├─ [ ] Training for support team
└─ [ ] Launch! 🚀
```

---

## Decision Tree: What Should I Build First?

```
Question: "What part of this should I start with?"

Answer:
  
  A. Backend-First Approach (Recommended)
     Reason: Frontend can't work without backend endpoints
     Order: Token Service → Validation → Endpoints → Then Frontend
     Time: 1-2 weeks backend, then parallel with frontend
     
  B. Frontend-First Approach (If UI/UX critical)
     Reason: Show stakeholders UI mockups early
     Order: Design → Mockups → Mock backend → Build real backend
     Time: 1 week design, 1 week frontend, 1 week backend
     
  C. Full-Stack in Parallel (If team has 2+ developers)
     Reason: Split team - backend does token service while
            frontend builds embed page component
     Time: Same 2-week backend timeline, frontend parallel
     Result: Faster integration when both ready
```

---

## Success Indicators

### After Week 2 (Backend Done)
- ✅ `POST /embed/token` generates JWT tokens
- ✅ `GET /embed/dashboard-123` validates token and returns data
- ✅ Tokens expire after 24 hours
- ✅ Invalid tokens rejected with 403 error
- ✅ All endpoints have rate limiting
- ✅ CORS headers set correctly

### After Week 4 (Frontend UI Done)
- ✅ Users can generate tokens via modal UI
- ✅ Copy button works, copies iframe snippet
- ✅ Embed page loads with valid token
- ✅ Embed page shows error for invalid token
- ✅ Dashboard displays read-only (no edit buttons)
- ✅ Responsive design (works in any iframe size)

### After Week 5 (Live Updates Done)
- ✅ Data changes appear in embedded dashboard in < 1 second
- ✅ WebSocket connection shows "Connected" status
- ✅ Shows "Offline" if connection drops
- ✅ Auto-reconnects after 30 seconds
- ✅ No errors in browser console
- ✅ Performance good (no lagging)

### After Week 8 (Complete)
- ✅ Full end-to-end flow working
- ✅ All tests passing
- ✅ Security audit passed
- ✅ Documentation complete
- ✅ Customers can embed dashboards
- ✅ Live data updates working
- ✅ Zero critical bugs

---

## Common Pitfalls to Avoid

| Pitfall | Problem | Solution |
|---------|---------|----------|
| Using base64 instead of JWT | Not secure, can be decoded | Use HMAC-SHA256 signed JWT |
| No token expiration | Tokens live forever, security risk | Default 24h, configurable up to 90d |
| Embedding on any domain | Your dashboards on malicious sites | Whitelist allowed domains per token |
| No rate limiting | Hackers can spam with tokens | Max 1000 req/hour per token |
| Refreshing entire dashboard | Slow, causes lag | Only re-fetch affected charts |
| No offline handling | Page breaks if connection drops | Show offline indicator, auto-reconnect |
| Exposing user data | Privacy breach | Filter to dashboard data only |
| No audit trail | Can't comply with regulations | Log all embed access |

---

## Team Communication Template

**For Backend Developer:**
```
Responsibility: Token service, validation, endpoints
  Week 1: embedTokenService.js + middleware
  Week 2: Endpoints + database + rate limiting
  Deliverable: 3 working API endpoints (generate, access, manage)
```

**For Frontend Developer:**
```
Responsibility: Embed page, modal UI, live updates
  Week 1: Embed component + routing
  Week 2: Modal UI for code generation
  Week 3: WebSocket integration
  Deliverable: Working embedded dashboard that updates live
```

**For QA/Tester:**
```
Responsibility: Testing, security audit
  Week 1-7: Test as features are built
  Week 8: Full security audit, performance testing
  Deliverable: All tests passing, zero critical bugs
```

---

## Questions Your Team Will Ask

**Q: "Can embedded dashboards be edited?"**  
A: No. Embed mode is read-only. Users can view and interact (drill-down, filters) but not change dashboard structure.

**Q: "What if someone shares a token publicly?"**  
A: Anyone with that token can view the dashboard. Token can be revoked immediately. Recommend short expiration (24h) for public sharing.

**Q: "Can I see who's using my embedded dashboards?"**  
A: Yes, in token management page. Shows access count, last access time, IP addresses, referring domains.

**Q: "Does embedding affect my subscription/license?"**  
A: No. Embedded views count as API calls, not logged-in users. Enterprise plans get higher rate limits.

**Q: "How many people can view an embedded dashboard?"**  
A: Unlimited, as long as they're within rate limit (1000 req/hour per token).

**Q: "Can I change the embed styling (colors, fonts)?"**  
A: Yes, embedded dashboard respects your theme settings (light/dark mode, colors).

---

## Launch Checklist

Before going live:

**Security:**
- [ ] HTTPS enforced for all embed endpoints
- [ ] JWT secret stored in environment variables
- [ ] No secrets in code
- [ ] Security audit completed
- [ ] Penetration testing passed

**Performance:**
- [ ] Load time < 2 seconds
- [ ] Live updates < 500ms latency
- [ ] No memory leaks
- [ ] Can handle 1000 concurrent embeds

**Documentation:**
- [ ] API docs written
- [ ] Integration guide ready
- [ ] Troubleshooting guide done
- [ ] Code examples provided

**User Experience:**
- [ ] Error messages clear
- [ ] UI intuitive
- [ ] Works on all major browsers
- [ ] Mobile-friendly

**Monitoring:**
- [ ] Error tracking enabled
- [ ] Performance monitoring in place
- [ ] Alert system for high error rates
- [ ] Dashboard analytics ready

---

## Next 24 Hours - Action Items

1. **Review these 4 documents:**
   - ✅ IFRAME_EMBED_SUMMARY.md (this one)
   - ✅ IFRAME_EMBED_IMPLEMENTATION_PLAN.md (detailed tasks)
   - ✅ IFRAME_EMBED_CHECKLIST.md (quick reference)
   - ✅ IFRAME_EMBED_ARCHITECTURE.md (system design)

2. **Share with team:**
   - Send these docs to backend dev, frontend dev, PM
   - Have sync meeting to discuss questions
   - Clarify any ambiguous requirements

3. **Create project tasks:**
   - Break into Jira/GitHub issues
   - Assign to developers
   - Set sprint goals (Week 1-2: backend)

4. **Setup infrastructure:**
   - Plan Redis setup for token caching
   - Plan database indices
   - Reserve server capacity for new endpoints

5. **Schedule kickoff:**
   - Team meeting on Monday to start Week 1
   - Daily 15-min standups
   - Weekly demos to stakeholders

---

**You're ready to build! 🚀**

**Questions? Refer to:**
- Architecture details → IFRAME_EMBED_ARCHITECTURE.md
- Specific tasks → IFRAME_EMBED_IMPLEMENTATION_PLAN.md
- Task tracking → IFRAME_EMBED_CHECKLIST.md

