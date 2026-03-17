/**
 * test.schema-inference.js
 * 
 * Plain Node.js tests — no Jest, no Mocha needed.
 * Run with:  node test.schema-inference.js
 * 
 * Tests are split into two parts:
 *   PART 1 — Unit tests for classifyColumns (no DB needed, runs instantly)
 *   PART 2 — Unit tests for relationshipMapper (no DB needed, runs instantly)
 * 
 * (Integration test with real MongoDB is at the bottom, commented out)
 */

const { classifyAllColumns, classifyColumn, inferDataType } = require("./classifyColumns");
const { detectRelationships } = require("./relationshipMapper");

// ─── Simple test runner ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

function test(description, fn) {
  try {
    fn();
    console.log(`  ✓  ${description}`);
    passed++;
  } catch (err) {
    console.error(`  ✗  ${description}`);
    console.error(`     Expected: ${err.expected}`);
    console.error(`     Got:      ${err.actual}`);
    failed++;
  }
}

function expect(actual) {
  return {
    toBe(expected) {
      if (actual !== expected) {
        const err = new Error("Assertion failed");
        err.expected = expected;
        err.actual = actual;
        throw err;
      }
    },
    toContain(expected) {
      if (!String(actual).includes(String(expected))) {
        const err = new Error("Assertion failed");
        err.expected = `to contain "${expected}"`;
        err.actual = actual;
        throw err;
      }
    },
    toBeGreaterThan(n) {
      if (actual <= n) {
        const err = new Error("Assertion failed");
        err.expected = `> ${n}`;
        err.actual = actual;
        throw err;
      }
    },
  };
}
// ─────────────────────────────────────────────────────────────────────────────


// ═══════════════════════════════════════════════════════════════
// PART 1: inferDataType() tests
// ═══════════════════════════════════════════════════════════════
console.log("\n── inferDataType() ──────────────────────────────────────");

test("detects number type from numeric values", () => {
  expect(inferDataType([100, 200, 300, 50])).toBe("number");
});

test("detects string type from text values", () => {
  expect(inferDataType(["North", "South", "East"])).toBe("string");
});

test("detects date type from ISO strings", () => {
  expect(inferDataType(["2024-01-15", "2024-02-20", "2023-12-01"])).toBe("date");
});

test("detects boolean type", () => {
  expect(inferDataType([true, false, true])).toBe("boolean");
});

test("returns empty for all-null values", () => {
  expect(inferDataType([null, null, undefined, ""])).toBe("empty");
});

test("detects numbers stored as strings", () => {
  expect(inferDataType(["100", "200", "300"])).toBe("number");
});


// ═══════════════════════════════════════════════════════════════
// PART 2: classifyColumn() tests
// ═══════════════════════════════════════════════════════════════
console.log("\n── classifyColumn() ─────────────────────────────────────");

test("classifies 'revenue' (number) as measure", () => {
  const result = classifyColumn("revenue", [1000, 2500, 800, 4200], 100);
  expect(result.role).toBe("measure");
});

test("classifies 'region' (string) as dimension", () => {
  const result = classifyColumn("region", ["North", "South", "East", "West"], 100);
  expect(result.role).toBe("dimension");
});

test("classifies 'customer_id' as dimension even though it may be numeric (suffix rule)", () => {
  const result = classifyColumn("customer_id", [101, 102, 103, 104], 100);
  expect(result.role).toBe("dimension");
});

test("classifies 'product_code' as dimension (suffix rule)", () => {
  const result = classifyColumn("product_code", ["P001", "P002", "P003"], 100);
  expect(result.role).toBe("dimension");
});

test("classifies 'sales' (number) as measure", () => {
  const result = classifyColumn("sales", [500, 300, 700, 100], 50);
  expect(result.role).toBe("measure");
});

test("classifies 'date' column as dimension", () => {
  const result = classifyColumn("date", ["2024-01-01", "2024-02-01"], 50);
  expect(result.role).toBe("dimension");
});

test("classifies low-cardinality number with no measure keyword as dimension", () => {
  // 'priority' has no measure keyword match, only 3 unique values (1,2,3) → dimension
  const result = classifyColumn("priority", [1, 2, 3, 2, 1, 3], 100);
  expect(result.role).toBe("dimension");
});

test("assigns 'sum' aggregation to revenue measure", () => {
  const result = classifyColumn("total_revenue", [1000, 2000, 3000], 50);
  expect(result.suggestedAggregation).toBe("sum");
});

test("assigns 'avg' aggregation to rate/percentage measure", () => {
  const result = classifyColumn("conversion_rate", [0.12, 0.45, 0.30], 50);
  expect(result.suggestedAggregation).toBe("avg");
});

test("classifies 'status' as dimension", () => {
  const result = classifyColumn("status", ["active", "inactive", "pending"], 100);
  expect(result.role).toBe("dimension");
});


// ═══════════════════════════════════════════════════════════════
// PART 3: classifyAllColumns() integration
// ═══════════════════════════════════════════════════════════════
console.log("\n── classifyAllColumns() ─────────────────────────────────");

// Simulate what a MongoDB document looks like after upload
const FAKE_SALES_DOCS = [
  { customer_id: 1, region: "North", product: "Laptop", revenue: 1200, units: 3, order_date: "2024-01-10", status: "completed" },
  { customer_id: 2, region: "South", product: "Phone",  revenue: 800,  units: 2, order_date: "2024-01-11", status: "pending" },
  { customer_id: 3, region: "East",  product: "Tablet", revenue: 450,  units: 1, order_date: "2024-01-12", status: "completed" },
  { customer_id: 4, region: "West",  product: "Laptop", revenue: 2400, units: 6, order_date: "2024-01-13", status: "cancelled" },
  { customer_id: 5, region: "North", product: "Phone",  revenue: 1600, units: 4, order_date: "2024-01-14", status: "completed" },
];

const classified = classifyAllColumns(FAKE_SALES_DOCS);

test("returns correct number of columns", () => {
  expect(classified.length).toBe(7); // customer_id, region, product, revenue, units, order_date, status
});

test("customer_id is classified as dimension (suffix rule)", () => {
  const col = classified.find((c) => c.name === "customer_id");
  expect(col.role).toBe("dimension");
});

test("region is classified as dimension", () => {
  const col = classified.find((c) => c.name === "region");
  expect(col.role).toBe("dimension");
});

test("revenue is classified as measure", () => {
  const col = classified.find((c) => c.name === "revenue");
  expect(col.role).toBe("measure");
});

test("units is classified as measure", () => {
  const col = classified.find((c) => c.name === "units");
  expect(col.role).toBe("measure");
});

test("order_date is classified as dimension", () => {
  const col = classified.find((c) => c.name === "order_date");
  expect(col.role).toBe("dimension");
});

test("each column has sampleValues populated", () => {
  const col = classified.find((c) => c.name === "region");
  expect(col.sampleValues.length).toBeGreaterThan(0);
});

test("nullCount is 0 for clean data", () => {
  const col = classified.find((c) => c.name === "revenue");
  expect(col.nullCount).toBe(0);
});


// ═══════════════════════════════════════════════════════════════
// PART 4: detectRelationships() tests
// ═══════════════════════════════════════════════════════════════
console.log("\n── detectRelationships() ────────────────────────────────");

const COLLECTION_A = {
  collectionName: "orders",
  columns: [
    { name: "order_id",   dataType: "number", role: "dimension", sampleValues: [1, 2, 3] },
    { name: "customer_id",dataType: "number", role: "dimension", sampleValues: [101, 102, 103] },
    { name: "revenue",    dataType: "number", role: "measure",   sampleValues: [500, 300, 700] },
  ],
};

const COLLECTION_B = {
  collectionName: "customers",
  columns: [
    { name: "customer_id", dataType: "number", role: "dimension", sampleValues: [101, 102, 103] },
    { name: "name",        dataType: "string", role: "dimension", sampleValues: ["Alice", "Bob"] },
    { name: "region",      dataType: "string", role: "dimension", sampleValues: ["North", "South"] },
  ],
};

const COLLECTION_C = {
  collectionName: "products",
  columns: [
    { name: "product_code", dataType: "string", role: "dimension", sampleValues: ["P001", "P002"] },
    { name: "price",        dataType: "number", role: "measure",   sampleValues: [100, 200] },
  ],
};

const relationships = detectRelationships([COLLECTION_A, COLLECTION_B, COLLECTION_C]);

test("detects relationship between orders.customer_id and customers.customer_id", () => {
  const rel = relationships.find(
    (r) =>
      (r.fromCollection === "orders" && r.fromColumn === "customer_id" &&
       r.toCollection === "customers" && r.toColumn === "customer_id") ||
      (r.fromCollection === "customers" && r.fromColumn === "customer_id" &&
       r.toCollection === "orders" && r.toColumn === "customer_id")
  );
  expect(!!rel).toBe(true);
});

test("detected relationship has confidence >= 0.5", () => {
  const rel = relationships.find(
    (r) => r.fromColumn === "customer_id" || r.toColumn === "customer_id"
  );
  expect(rel.confidence >= 0.5).toBe(true);
});

test("does not create false relationship between revenue and price (both numbers but unrelated)", () => {
  const rel = relationships.find(
    (r) =>
      (r.fromColumn === "revenue" && r.toColumn === "price") ||
      (r.fromColumn === "price" && r.toColumn === "revenue")
  );
  // These should NOT be linked — different names, no overlap
  expect(!!rel).toBe(false);
});

test("returns relationships sorted by confidence descending", () => {
  if (relationships.length >= 2) {
    expect(relationships[0].confidence >= relationships[1].confidence).toBe(true);
  } else {
    expect(true).toBe(true); // pass if only 0-1 relationships
  }
});


// ═══════════════════════════════════════════════════════════════
// SUMMARY
// ═══════════════════════════════════════════════════════════════
console.log(`\n${"─".repeat(50)}`);
console.log(`Results: ${passed} passed, ${failed} failed out of ${passed + failed} tests`);
if (failed === 0) {
  console.log("✓ All tests passed!\n");
} else {
  console.log("✗ Some tests failed. Check output above.\n");
  process.exit(1); // non-zero exit for CI
}


// ═══════════════════════════════════════════════════════════════
// PART 5: Manual integration test (requires MongoDB running)
// Uncomment and run separately: node test.schema-inference.js --integration
// ═══════════════════════════════════════════════════════════════


async function runIntegrationTest() {
  const mongoose = require("mongoose");
  const { runSchemaInference } = require("./inferSchema");

  // Connect to your local MongoDB
  await mongoose.connect("mongodb://localhost:27017/analytics_bi_test");
  console.log("Connected to MongoDB");

  // Insert fake data into a test collection
  const col = mongoose.connection.db.collection("test_sales");
  await col.deleteMany({}); // clean slate
  await col.insertMany([
    { customer_id: 1, region: "North", revenue: 1200, units: 3 },
    { customer_id: 2, region: "South", revenue: 800,  units: 2 },
    { customer_id: 3, region: "East",  revenue: 450,  units: 1 },
  ]);

  // Run inference
  const result = await runSchemaInference({
    collectionName: "test_sales",
    uploadedBy: "test_user",
    ingestionRule: "new",
    totalRows: 3,
  });

  console.log("\nInferred schema:");
  console.log(JSON.stringify(result, null, 2));

  await mongoose.disconnect();
}

if (process.argv.includes("--integration")) {
  runIntegrationTest().catch(console.error);
}