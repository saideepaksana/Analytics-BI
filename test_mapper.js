require("dotenv").config({ path: "/home/sampadram/Analytics-BI/apps/server/.env" });
const mongoose = require("mongoose");
const Dashboard = require("/home/sampadram/Analytics-BI/apps/server/src/models/Dashboard");
const connectDB = require("/home/sampadram/Analytics-BI/apps/server/src/core/db");
const mapper = require("/home/sampadram/Analytics-BI/apps/server/src/api/dashboard/dashboardMapper");

async function run() {
  await connectDB();
  const dbs = await Dashboard.find({}).lean();
  console.log("Found", dbs.length, "dashboards.");
  for (const db of dbs) {
    try {
      console.log("Mapping dashboard", db._id);
      mapper.fromDB(db);
      console.log("Mapped", db._id);
    } catch(e) {
      console.error(e);
    }
  }
  process.exit(0);
}
run();
