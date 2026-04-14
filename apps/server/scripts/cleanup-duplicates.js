const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../.env') }); // Try server .env
require('dotenv').config({ path: path.join(__dirname, '../../../.env') }); // Try root .env

// Mock Logger
const logger = {
  info: (msg) => console.log(`[INFO] ${msg}`),
  success: (msg) => console.log(`[SUCCESS] ${msg}`),
  error: (msg) => console.error(`[ERROR] ${msg}`),
  warn: (msg) => console.warn(`[WARN] ${msg}`),
};

// Import CleanRecord model
// We need to register Schema before model if required, but since we are importing the file, it should be fine.
const CleanRecord = require('../src/models/CleanRecord');

async function cleanup() {
  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/analytics-bi';
  
  try {
    logger.info(`Connecting to MongoDB at ${mongoUri}...`);
    await mongoose.connect(mongoUri);
    logger.success('Connected to MongoDB');

    logger.info('Identifying duplicate CleanRecords based on { datasetId, rowNumber }...');

    const duplicates = await CleanRecord.aggregate([
      {
        $group: {
          _id: { datasetId: '$datasetId', rowNumber: '$rowNumber' },
          count: { $sum: 1 },
          ids: { $push: '$_id' },
          lastUpdated: { $max: '$updatedAt' }
        }
      },
      {
        $match: {
          count: { $gt: 1 }
        }
      }
    ]);

    if (duplicates.length === 0) {
      logger.success('No duplicates found. Database is clean.');
      process.exit(0);
    }

    logger.info(`Found ${duplicates.length} duplicate sets. Starting cleanup...`);

    let totalRemoved = 0;

    for (const group of duplicates) {
      // Keep the most recently updated record (or just the first one)
      // We'll keep the first ID in the list for simplicity, or we could find the one matching lastUpdated.
      const [keepId, ...removeIds] = group.ids;
      
      const result = await CleanRecord.deleteMany({ _id: { $in: removeIds } });
      totalRemoved += result.deletedCount;
      
      logger.info(`Cleaned datasetId: ${group._id.datasetId}, rowNumber: ${group._id.rowNumber} (Removed ${result.deletedCount} duplicates)`);
    }

    logger.success(`Cleanup complete! Total records removed: ${totalRemoved}`);
    
    // Attempt to create indexes to verify
    logger.info('Attempting to create indexes now...');
    await CleanRecord.createIndexes();
    logger.success('Indexes created successfully!');

  } catch (error) {
    logger.error(`Cleanup failed: ${error.message}`);
    process.exit(1);
  } finally {
    await mongoose.connection.close();
    logger.info('Database connection closed.');
  }
}

cleanup();
