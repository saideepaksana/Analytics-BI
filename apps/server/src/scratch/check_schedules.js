const mongoose = require("mongoose");
const ScheduledExport = require("../models/ScheduledExport");
require("dotenv").config({ path: "apps/server/.env" });

async function checkSchedules() {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/analytics-bi";
    await mongoose.connect(mongoUri);
    console.log("Connected to MongoDB");

    const schedules = await ScheduledExport.find({});
    console.log(`Found ${schedules.length} schedules:`);
    schedules.forEach(s => {
      console.log(`ID: ${s._id}, Name: ${s.name}, DashboardId: ${s.dashboardId}, Format: ${s.format}, Recipients: ${s.recipients}, Status: ${s.status}`);
    });

    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
}

checkSchedules();
