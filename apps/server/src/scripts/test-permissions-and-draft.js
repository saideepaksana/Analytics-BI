/**
 * Integration test suite — Tasks #305, #306, #308
 *
 * Tests permission enforcement (owner / editor / viewer), draft/publish
 * workflow, and draft-state validation without requiring a running MongoDB.
 *
 * Run: node apps/server/src/scripts/test-permissions-and-draft.js
 */
require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });

const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

// ── Minimal in-process HTTP server ────────────────────────────────────────────
const express   = require('express');
const cors      = require('cors');

// We re-use the real middleware and controllers
const authMiddleware         = require('../middleware/auth');
const { requireAuth, canMutate }  = require('../middleware/rbac');
const { sanitizeInput, sqlInjectionProtection } = require('../middleware/security');
const dashboardController    = require('../api/dashboard/dashboard.controller');

// ── Test helpers ──────────────────────────────────────────────────────────────
const http = require('http');

let mongod;
let serverInstance;
let BASE_URL;

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use(sanitizeInput);
  app.use(sqlInjectionProtection);
  app.use(authMiddleware);

  app.get('/dashboards',           dashboardController.listDashboards);
  app.post('/dashboards',          requireAuth, canMutate, dashboardController.createDashboard);
  app.get('/dashboards/:dashboardId', dashboardController.getDashboard);
  app.delete('/dashboards/:dashboardId', requireAuth, canMutate, dashboardController.deleteDashboard);
  app.patch('/dashboards/:dashboardId/metadata', requireAuth, canMutate, dashboardController.patchDashboardMetadata);
  app.post('/dashboards/:dashboardId/publish',  requireAuth, canMutate, dashboardController.publishDashboard);
  app.post('/dashboards/:dashboardId/unpublish', requireAuth, canMutate, dashboardController.unpublishDashboard);
  app.post('/dashboards/:dashboardId/save-draft', requireAuth, canMutate, dashboardController.saveDraft);
  app.get('/dashboards/:dashboardId/draft', requireAuth, dashboardController.getDraftState);
  return app;
}

async function req(method, path, { headers = {}, body } = {}) {
  return new Promise((resolve, reject) => {
    const url = new URL(`${BASE_URL}${path}`);
    const opts = {
      method: method.toUpperCase(),
      hostname: url.hostname,
      port: url.port,
      // Include query string so ?$where=1 etc. are actually sent
      path: url.pathname + url.search,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    const r = http.request(opts, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    r.on('error', reject);
    if (body) r.write(JSON.stringify(body));
    r.end();
  });
}

// ── Assertion helpers ─────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function assert(label, condition, detail = '') {
  if (condition) {
    console.log(`  ✅ ${label}`);
    passed++;
  } else {
    console.error(`  ❌ ${label}${detail ? ` — ${detail}` : ''}`);
    failed++;
  }
}

function section(name) {
  console.log(`\n${'─'.repeat(60)}\n  ${name}\n${'─'.repeat(60)}`);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

async function testPermissions() {
  section('Task #305/#306 — Permission Enforcement');

  // Create a dashboard as alice (editor)
  const create = await req('POST', '/dashboards', {
    headers: { 'x-user-id': 'alice@test.com', 'x-user-role': 'editor' },
    body: { title: 'Alice\'s Board', description: 'owned by alice' },
  });
  assert('Editor can create dashboard (201)', create.status === 201,
    `got ${create.status}`);

  const dashboardId = create.body?.dashboard?._id || create.body?.dashboard?.id;
  assert('Response contains dashboard id', !!dashboardId, `body=${JSON.stringify(create.body)}`);

  // List (viewer can see published... but this is draft, so viewer shouldn't see it)
  const listAsViewer = await req('GET', '/dashboards', {
    headers: { 'x-user-id': 'viewer@test.com', 'x-user-role': 'viewer' },
  });
  assert('Viewer does not see Alice\'s draft', 
    !(listAsViewer.body?.dashboards || []).some(d => d._id === dashboardId),
    `dashboards=${JSON.stringify(listAsViewer.body?.dashboards?.map(d=>d._id))}`);

  // List as alice — she should see her own draft
  const listAsAlice = await req('GET', '/dashboards', {
    headers: { 'x-user-id': 'alice@test.com', 'x-user-role': 'editor' },
  });
  assert('Alice sees her own draft',
    (listAsAlice.body?.dashboards || []).some(d => d._id === dashboardId || d.id === dashboardId));

  // Bob (viewer) cannot delete Alice's dashboard — first, must be editor
  const deleteAsViewer = await req('DELETE', `/dashboards/${dashboardId}`, {
    headers: { 'x-user-id': 'bob@test.com', 'x-user-role': 'viewer' },
  });
  assert('Viewer blocked from deleting (403)', deleteAsViewer.status === 403,
    `got ${deleteAsViewer.status}`);

  // Bob as editor (but not owner) CAN delete per policy (editor role = can edit all)
  const deleteAsEditor = await req('DELETE', `/dashboards/${dashboardId}`, {
    headers: { 'x-user-id': 'bob@test.com', 'x-user-role': 'editor' },
  });
  assert('Editor (non-owner) CAN delete (200)', deleteAsEditor.status === 200,
    `got ${deleteAsEditor.status}`);

  // Create another board and test owner-only access
  const create2 = await req('POST', '/dashboards', {
    headers: { 'x-user-id': 'carol@test.com', 'x-user-role': 'editor' },
    body: { title: 'Carol\'s Board' },
  });
  const carol_id = create2.body?.dashboard?._id || create2.body?.dashboard?.id;

  // Viewer bob cannot edit metadata
  const metaAsViewer = await req('PATCH', `/dashboards/${carol_id}/metadata`, {
    headers: { 'x-user-id': 'bob@test.com', 'x-user-role': 'viewer' },
    body: { title: 'Hacked Title' },
  });
  assert('Viewer blocked from editing metadata (403)', metaAsViewer.status === 403,
    `got ${metaAsViewer.status}`);

  // Unauthenticated request blocked at requireAuth
  const noAuth = await req('DELETE', `/dashboards/${carol_id}`, {});
  assert('Unauthenticated request blocked (401)', noAuth.status === 401,
    `got ${noAuth.status}`);

  return carol_id; // pass to draft tests
}

async function testDraftWorkflow(dashboardId) {
  section('Task #308 — Draft / Publish Workflow');

  // Save a valid draft
  const saveDraft = await req('POST', `/dashboards/${dashboardId}/save-draft`, {
    headers: { 'x-user-id': 'carol@test.com', 'x-user-role': 'editor' },
    body: {
      draftState: {
        tabs: [
          { id: 'tab-1', name: 'Main', widgets: [{ id: 'w1', x: 0, y: 0, w: 4, h: 4 }] }
        ],
        activeTabId: 'tab-1',
      }
    },
  });
  assert('Save valid draft (200)', saveDraft.status === 200,
    `got ${saveDraft.status} — ${JSON.stringify(saveDraft.body)}`);
  assert('Dashboard status is draft', saveDraft.body?.dashboard?.status === 'draft');

  // Get draft state as owner
  const getDraft = await req('GET', `/dashboards/${dashboardId}/draft`, {
    headers: { 'x-user-id': 'carol@test.com', 'x-user-role': 'editor' },
  });
  assert('Owner can read draft state (200)', getDraft.status === 200,
    `got ${getDraft.status}`);
  assert('Draft contains saved tabs', Array.isArray(getDraft.body?.draftState?.tabs));

  // Get draft state as viewer (should be 403)
  const getDraftAsViewer = await req('GET', `/dashboards/${dashboardId}/draft`, {
    headers: { 'x-user-id': 'viewer@test.com', 'x-user-role': 'viewer' },
  });
  assert('Viewer blocked from reading draft state (403)', getDraftAsViewer.status === 403,
    `got ${getDraftAsViewer.status}`);

  // Save draft with invalid layout (overlap)
  const badDraft = await req('POST', `/dashboards/${dashboardId}/save-draft`, {
    headers: { 'x-user-id': 'carol@test.com', 'x-user-role': 'editor' },
    body: {
      draftState: {
        tabs: [
          {
            id: 'tab-1',
            name: 'Main',
            widgets: [
              { id: 'w1', x: 0, y: 0, w: 4, h: 4 },
              { id: 'w2', x: 1, y: 1, w: 4, h: 4 }, // overlaps w1
            ]
          }
        ]
      }
    },
  });
  assert('Invalid draft layout rejected (400)', badDraft.status === 400,
    `got ${badDraft.status} — ${JSON.stringify(badDraft.body)}`);

  // Save draft with invalid draftState type (array instead of object)
  const invalidTypeDraft = await req('POST', `/dashboards/${dashboardId}/save-draft`, {
    headers: { 'x-user-id': 'carol@test.com', 'x-user-role': 'editor' },
    body: { draftState: [1, 2, 3] },
  });
  assert('Invalid draftState type rejected (400)', invalidTypeDraft.status === 400,
    `got ${invalidTypeDraft.status}`);

  // Publish the dashboard
  const publish = await req('POST', `/dashboards/${dashboardId}/publish`, {
    headers: { 'x-user-id': 'carol@test.com', 'x-user-role': 'editor' },
  });
  assert('Publish dashboard (200)', publish.status === 200,
    `got ${publish.status}`);
  assert('Status is published', publish.body?.dashboard?.status === 'published');
  assert('publishedAt is set', !!publish.body?.dashboard?.publishedAt);

  // Viewer CAN now see the published dashboard
  const viewerSeePublished = await req('GET', `/dashboards/${dashboardId}`, {
    headers: { 'x-user-id': 'viewer@test.com', 'x-user-role': 'viewer' },
  });
  assert('Viewer can view published dashboard (200)', viewerSeePublished.status === 200,
    `got ${viewerSeePublished.status}`);

  const listAsViewer2 = await req('GET', '/dashboards', {
    headers: { 'x-user-id': 'viewer@test.com', 'x-user-role': 'viewer' },
  });
  assert('Published dashboard appears in viewer\'s list',
    (listAsViewer2.body?.dashboards || []).some(d => d._id === dashboardId || d.id === dashboardId));

  // Unpublish
  const unpublish = await req('POST', `/dashboards/${dashboardId}/unpublish`, {
    headers: { 'x-user-id': 'carol@test.com', 'x-user-role': 'editor' },
  });
  assert('Unpublish dashboard (200)', unpublish.status === 200,
    `got ${unpublish.status}`);
  assert('Status reverts to draft', unpublish.body?.dashboard?.status === 'draft');

  // After unpublish the snapshot should be set
  const getDraft2 = await req('GET', `/dashboards/${dashboardId}/draft`, {
    headers: { 'x-user-id': 'carol@test.com', 'x-user-role': 'editor' },
  });
  assert('Draft snapshot preserved after unpublish', !!getDraft2.body?.draftState);

  // Viewer can no longer see the draft
  const viewerSeeUnpublished = await req('GET', `/dashboards/${dashboardId}`, {
    headers: { 'x-user-id': 'viewer@test.com', 'x-user-role': 'viewer' },
  });
  assert('Viewer gets 404 for unpublished dashboard', viewerSeeUnpublished.status === 404,
    `got ${viewerSeeUnpublished.status}`);
}

async function testInputValidation() {
  section('Task #312 — Input Validation');

  // SQL injection in title
  const sqlTitle = await req('POST', '/dashboards', {
    headers: { 'x-user-id': 'hacker@test.com', 'x-user-role': 'editor' },
    body: { title: "'; DROP TABLE dashboards; --" },
  });
  // sanitize-html strips it clean; SQL injection guard rejects it
  assert('SQL injection in title blocked or sanitized',
    sqlTitle.status === 400 || (sqlTitle.body?.dashboard?.title || '').indexOf('DROP') === -1,
    `status=${sqlTitle.status} title=${sqlTitle.body?.dashboard?.title}`);

  // NoSQL injection via query key
  const noSqlQuery = await req('GET', '/dashboards?$where=1', {
    headers: { 'x-user-id': 'hacker@test.com', 'x-user-role': 'editor' },
  });
  assert('NoSQL injection in query rejected (400)', noSqlQuery.status === 400,
    `got ${noSqlQuery.status}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n🔧 Starting in-memory MongoDB…');
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri(), { dbName: 'test' });
  console.log('✅ MongoDB ready\n');

  const app = buildApp();
  serverInstance = app.listen(0);
  await new Promise((res) => serverInstance.once('listening', res));
  const { port } = serverInstance.address();
  BASE_URL = `http://127.0.0.1:${port}`;

  try {
    const dashboardId = await testPermissions();
    await testDraftWorkflow(dashboardId);
    await testInputValidation();
  } catch (err) {
    console.error('\n💥 Unexpected test error:', err);
    failed++;
  } finally {
    serverInstance.close();
    await mongoose.disconnect();
    await mongod.stop();

    console.log(`\n${'═'.repeat(60)}`);
    console.log(`  Results: ${passed} passed, ${failed} failed`);
    console.log(`${'═'.repeat(60)}\n`);

    process.exit(failed > 0 ? 1 : 0);
  }
})();
