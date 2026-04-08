const path = require("path");

// Ensure mongodb-memory-server writes its binaries inside the workspace (CI/sandbox safe)
const MONGO_CACHE_DIR = path.resolve(__dirname, "..", ".cache", "mongodb-binaries");
process.env.MONGOMS_HOME = MONGO_CACHE_DIR;
process.env.MONGOMS_DOWNLOAD_DIR = MONGO_CACHE_DIR;
process.env.MONGOMS_CACHE_DIR = MONGO_CACHE_DIR;

const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const Metadata = require("../src/models/Metadata");
const Chart = require("../src/models/Chart");
const chartValidator = require("../src/api/charts/chartValidator");
const chartMapper = require("../src/api/charts/chartMapper");
const { getDatasetSchema } = require("../src/api/query/datasets.controller");

async function run() {
  // Pin to a widely available MongoDB version to avoid platform gaps.
  const mongoServer = await MongoMemoryServer.create({
    binary: { version: "7.0.14" },
  });
  await mongoose.connect(mongoServer.getUri());

  // Seed DB
  await Metadata.create({
    datasetId: "ds-123",
    fileName: "sales.csv",
    schema: [
      { name: "Region", type: "string" },
      { name: "Revenue", type: "number" },
      { name: "Date", type: "date" },
      { name: "IsActive", type: "boolean" }
    ]
  });

  // Test 1: getDatasetSchema behavior
  const mockReq = { params: { datasetId: "ds-123" } };
  let schemaRes;
  const mockRes = {
    status: () => mockRes,
    json: (data) => { schemaRes = data; return data; }
  };
  await getDatasetSchema(mockReq, mockRes);
  const regionCol = schemaRes.columns.find(c => c.name === "Region");
  const revCol = schemaRes.columns.find(c => c.name === "Revenue");
  const dateCol = schemaRes.columns.find(c => c.name === "Date");
  const boolCol = schemaRes.columns.find(c => c.name === "IsActive");
  
  console.assert(regionCol.classification === "dimension", "Region should be dimension");
  console.assert(dateCol.classification === "dimension", "Date should be dimension");
  console.assert(boolCol.classification === "dimension", "Bool should be dimension");
  console.assert(revCol.classification === "measure", "Revenue should be measure");
  console.log("✅ Schema classification test passed");

  // Test 2: Validator Failure Examples
  const invalidConfigs = [
    { type: "bar", datasetId: "ds-123", x: "Revenue", y: "Revenue" }, // bar with numeric x
    { type: "scatter", datasetId: "ds-123", x: "Region", y: "Revenue" }, // scatter with categorical
    { type: "pie", datasetId: "ds-123", x: "Revenue", y: "Revenue" }, // pie with numeric category
  ];

  for (let cfg of invalidConfigs) {
    try {
      await chartValidator.validateChart(cfg);
      console.error("❌ Validator should have failed:", cfg.type);
    } catch(err) {
      console.assert(err.name === "ChartValidationError", "Expected ChartValidationError");
      console.log(`✅ Validator correctly failed ${cfg.type}: ${err.message}`);
    }
  }

  // Test 3: Validator Success Examples
  const validConfigs = [
    { type: "bar", datasetId: "ds-123", x: "Region", y: "Revenue" },
    { type: "line", datasetId: "ds-123", x: "Date", y: "Revenue" },
    { type: "scatter", datasetId: "ds-123", x: "Revenue", y: "Revenue" },
    { type: "pie", datasetId: "ds-123", x: "Region", y: "Revenue" }
  ];
  for (let cfg of validConfigs) {
    try {
      await chartValidator.validateChart(cfg);
      console.log(`✅ Validator passed valid ${cfg.type} config`);
    } catch(err) {
      console.error(`❌ Validator wrongly failed valid ${cfg.type} config`, err);
    }
  }

  // Test 4: Mapper Round Trip
  console.log("\nTesting mapper round trip...");
  const frontendConfig = {
    chartId: "chart-bar-1",
    name: "Bar Test",
    datasetId: "ds-123",
    type: "bar",
    x: { field: "Region", type: "categorical", label: "Custom X Region Label" },
    y: { field: "Revenue", aggregation: "avg", format: "currency" },
    filters: [{ field: "Date", operator: ">", value: "2024-01-01" }],
    colorPalette: ["#000"],
    showLegend: false,
    showGrid: true,
    series: { customProp: 1 },
    customFrontendMetadata: { foo: "bar" } // arbitrary data!
  };

  const dbReady = chartMapper.toDB(frontendConfig);
  const dbConfig = await Chart.create(dbReady);
  const doc = await Chart.findOne({ chartId: "chart-bar-1" }).lean();
  const backToFrontend = chartMapper.fromDB(doc);
  
  if (backToFrontend.x.label !== "Custom X Region Label") console.error("❌ Lost x.label during round trip!");
  else console.log("✅ x.label preserved");
  
  if (backToFrontend.customFrontendMetadata?.foo !== "bar") console.error("❌ Lost custom metadata during round trip!");
  else console.log("✅ custom metadata preserved");
  
  await mongoose.disconnect();
  await mongoServer.stop();
}

run().catch(console.error);
