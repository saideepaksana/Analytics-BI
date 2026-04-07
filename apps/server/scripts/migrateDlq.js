require("dotenv").config();
const mongoose = require("mongoose");
const logger = require("../src/core/logger");
const DLQRecord = require("../src/models/DLQRecord");

const MIGRATION_BATCH_SIZE = 1000;

const migrateDlq = async () => {
  try {
    const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017/analytics-bi";
    await mongoose.connect(MONGO_URI);
    logger.success("Connected to MongoDB for DLQ migration", "Migration");

    // Only update records that do not have errorCategory or severity defined
    const query = { 
        $or: [
            { errorCategory: { $exists: false } },
            { severity: { $exists: false } }
        ]
    };

    const count = await DLQRecord.countDocuments(query);
    logger.info(`Found ${count} DLQ records needing migration.`, "Migration");

    if (count > 0) {
        const updateResult = await DLQRecord.updateMany(query, {
            $set: {
                errorCategory: "unknown",
                severity: "medium",
                suggestion: "No suggestion available",
                attemptedRestores: 0,
                manualEdits: 0,
                lastModifiedBy: "system"
            }
        });

        logger.success(`Migrated ${updateResult.modifiedCount} DLQ records.`, "Migration");
    } else {
        logger.info("No records to migrate.", "Migration");
    }

  } catch (error) {
    logger.error(`Error during DLQ migration: ${error.message}`, "Migration");
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
};

migrateDlq();
