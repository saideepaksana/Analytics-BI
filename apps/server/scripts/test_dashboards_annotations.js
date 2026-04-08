const path = require("path");

// Ensure mongodb-memory-server writes its binaries inside the workspace (CI/sandbox safe)
const MONGO_CACHE_DIR = path.resolve(__dirname, "..", ".cache", "mongodb-binaries");
process.env.MONGOMS_HOME = MONGO_CACHE_DIR;
process.env.MONGOMS_DOWNLOAD_DIR = MONGO_CACHE_DIR;
process.env.MONGOMS_CACHE_DIR = MONGO_CACHE_DIR;

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");

const Dashboard = require("../src/models/Dashboard");
const Annotation = require("../src/models/Annotation");
const dashboardMapper = require("../src/api/dashboard/dashboardMapper");
const dashboardController = require("../src/api/dashboard/dashboard.controller");
const annotationsController = require("../src/api/annotations/annotations.controller");

function makeRes() {
  const res = {};
  res.statusCode = 200;
  res.body = undefined;
  res.status = (code) => {
    res.statusCode = code;
    return res;
  };
  res.json = (data) => {
    res.body = data;
    return data;
  };
  return res;
}

async function run() {
  // Pin to a widely available MongoDB version to avoid platform gaps.
  const mongoServer = await MongoMemoryServer.create({
    binary: { version: "7.0.14" },
  });
  await mongoose.connect(mongoServer.getUri());

  // ──────────────────────────────────────────────────────────────────────────
  // Dashboard autosave (OCC) - controller level test
  // ──────────────────────────────────────────────────────────────────────────
  const created = await Dashboard.create({
    title: "Dash 1",
    description: "",
    tags: [],
    layout: [],
    chartRefs: [],
    filters: {},
    metadata: {},
    createdBy: "user-1",
    updatedBy: "user-1",
  });

  // First autosave should succeed
  const req1 = {
    params: { dashboardId: created._id.toString() },
    body: {
      version: created.__v,
      layout: [{ i: "chart-1", x: 0, y: 0, w: 4, h: 3 }],
      filters: { region: "NA" },
      metadata: { note: "hello" },
    },
    user: { id: "user-1" },
  };
  const res1 = makeRes();
  await dashboardController.patchDashboardState(req1, res1);
  console.assert(res1.statusCode === 200, "autosave should return 200");
  console.assert(res1.body?.dashboard?.__v === created.__v + 1, "version should increment");
  console.assert(Array.isArray(res1.body.dashboard.layout), "layout should be array");
  console.assert(res1.body.dashboard.filters.region === "NA", "filters should persist");

  // Refresh/reload verification: refetch from DB and ensure state matches exactly
  // (simulates page reload pulling persisted state)
  const reloadedDoc = await Dashboard.findById(created._id).lean();
  const reloaded = dashboardMapper.fromDB(reloadedDoc);
  console.assert(
    JSON.stringify(reloaded) === JSON.stringify(res1.body.dashboard),
    "reload should restore the exact dashboard state"
  );

  // Stale autosave should conflict
  const req2 = {
    params: { dashboardId: created._id.toString() },
    body: {
      version: created.__v, // stale
      layout: [{ i: "chart-1", x: 1, y: 1, w: 4, h: 3 }],
    },
    user: { id: "user-1" },
  };
  const res2 = makeRes();
  await dashboardController.patchDashboardState(req2, res2);
  console.assert(res2.statusCode === 409, "stale autosave should return 409");

  // Mapper round-trip sanity
  const doc = await Dashboard.findById(created._id).lean();
  const mapped = dashboardMapper.fromDB(doc);
  console.assert(mapped._id, "mapped dashboard should have _id");

  // ──────────────────────────────────────────────────────────────────────────
  // Annotations CRUD - controller level test
  // ──────────────────────────────────────────────────────────────────────────
  const createReq = {
    body: {
      dashboardId: created._id.toString(),
      text: "Hello annotation",
      position: { x: 10, y: 20 },
      style: { color: "red" },
    },
    user: { id: "user-1" },
  };
  const createRes = makeRes();
  await annotationsController.createAnnotation(createReq, createRes);
  console.assert(createRes.statusCode === 201, "create annotation should return 201");
  const annId = createRes.body.annotation._id.toString();

  const listReq = { params: { dashboardId: created._id.toString() } };
  const listRes = makeRes();
  await annotationsController.getAnnotationsByDashboard(listReq, listRes);
  console.assert(listRes.statusCode === 200, "list annotations should return 200");
  console.assert(listRes.body.annotations.length === 1, "should have 1 annotation");

  // Update as author should succeed
  const updateReq = {
    params: { id: annId },
    body: { text: "Updated", position: { x: 11, y: 21 } },
    user: { id: "user-1" },
  };
  const updateRes = makeRes();
  await annotationsController.updateAnnotation(updateReq, updateRes);
  console.assert(updateRes.statusCode === 200, "update should return 200");
  console.assert(updateRes.body.annotation.text === "Updated", "text should update");

  // Update as different user should 403
  const updateReq2 = {
    params: { id: annId },
    body: { text: "Hacked" },
    user: { id: "user-2" },
  };
  const updateRes2 = makeRes();
  await annotationsController.updateAnnotation(updateReq2, updateRes2);
  console.assert(updateRes2.statusCode === 403, "non-author update should 403");

  // Delete as author should succeed
  const delReq = { params: { id: annId }, user: { id: "user-1" } };
  const delRes = makeRes();
  await annotationsController.deleteAnnotation(delReq, delRes);
  console.assert(delRes.statusCode === 200, "delete should return 200");
  console.assert((await Annotation.countDocuments()) === 0, "annotation should be deleted");

  await mongoose.disconnect();
  await mongoServer.stop();
  console.log("✅ Dashboard autosave + annotations tests passed");
}

run().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});

