const mongoose = require("mongoose");
const { ExportLog } = require("../models/exportLog");
require("dotenv").config({ path: "apps/server/.env" });

async function checkAllLogs() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/analytics-bi";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const logs = await ExportLog.find({})
      .sort({ exportedAt: -1 })
      .limit(10);

    console.log("Most Recent Export Logs:");
    logs.forEach(log => {
      console.log(`ID: ${log._id}, JobID: ${log.jobId}, Status: ${log.status}, Format: ${log.format}, ExportedAt: ${log.exportedAt}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkAllLogs();
