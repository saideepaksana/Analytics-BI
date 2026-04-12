const mongoose = require('mongoose');
const logger = require('./logger');

/**
 * Database Index Initialization Script
 * Ensures all required indexes are created for optimal query performance
 */
const initIndexes = async () => {
  try {
    logger.info('Initializing database indexes...', 'DBIndexes');

    // Metadata indexes
    const Metadata = mongoose.model('Metadata');
    await Metadata.createIndexes();
    logger.info('Metadata indexes created', 'DBIndexes');

    // Chart indexes
    const Chart = mongoose.model('Chart');
    await Chart.createIndexes();
    logger.info('Chart indexes created', 'DBIndexes');

    // Dashboard indexes
    const Dashboard = mongoose.model('Dashboard');
    await Dashboard.createIndexes();
    logger.info('Dashboard indexes created', 'DBIndexes');

    // DLQRecord indexes
    const DLQRecord = mongoose.model('DLQRecord');
    await DLQRecord.createIndexes();
    logger.info('DLQRecord indexes created', 'DBIndexes');

    // CleanRecord indexes (assuming exists)
    if (mongoose.models.CleanRecord) {
      const CleanRecord = mongoose.model('CleanRecord');
      await CleanRecord.createIndexes();
      logger.info('CleanRecord indexes created', 'DBIndexes');
    }

    // RawRecord indexes
    if (mongoose.models.RawRecord) {
      const RawRecord = mongoose.model('RawRecord');
      await RawRecord.createIndexes();
      logger.info('RawRecord indexes created', 'DBIndexes');
    }

    logger.success('All database indexes initialized successfully', 'DBIndexes');
  } catch (error) {
    logger.error(`Failed to initialize indexes: ${error.message}`, 'DBIndexes');
    throw error;
  }
};

/**
 * Index Maintenance Strategy:
 * - Text indexes: Used for search functionality (Chart.name, Dashboard.title/description, Metadata.fileName, DLQRecord.errorMessages)
 * - Compound indexes: For common query patterns (datasetId + createdAt, status + severity, etc.)
 * - Single field indexes: For frequent filters (mode, rowCount, createdBy)
 * - TTL indexes: For automatic cleanup (Idempotency.expiresAt)
 *
 * Monitoring:
 * - Use MongoDB profiler to identify slow queries
 * - Run db.collection.stats() to check index usage
 * - Monitor index size with db.collection.totalIndexSize()
 *
 * Maintenance:
 * - Rebuild indexes periodically: db.collection.reIndex()
 * - Drop unused indexes based on usage stats
 * - Ensure indexes fit in RAM for best performance
 */

module.exports = { initIndexes };