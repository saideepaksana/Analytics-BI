require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("../src/core/logger");

// Import all models
const Chart = require("../src/models/Chart");
const CleanRecord = require("../src/models/CleanRecord");
const Dashboard = require("../src/models/Dashboard");
const DLQRecord = require("../src/models/DLQRecord");
const Metadata = require("../src/models/Metadata");
const RawRecord = require("../src/models/RawRecord");
const Idempotency = require("../src/models/Idempotency");
const exportLog = require("../src/models/exportLog");

const initIndexes = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/analytics-bi";
    await mongoose.connect(MONGO_URI);
    logger.success("Connected to MongoDB for index initialization", "InitIndexes");

    const models = [Chart, CleanRecord, Dashboard, DLQRecord, Metadata, RawRecord, Idempotency, exportLog];
    
    for (const model of models) {
      if (model && model.syncIndexes) {
        logger.info(`Syncing indexes for collection: ${model.collection.name}...`, "InitIndexes");
        await model.syncIndexes();
        logger.success(`Synced indexes for ${model.collection.name}`, "InitIndexes");
      }
    }

    logger.success("All indexes synchronized successfully.", "InitIndexes");
  } catch (error) {
    logger.error(`Error syncing indexes: ${error.message}`, "InitIndexes");
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

initIndexes();
