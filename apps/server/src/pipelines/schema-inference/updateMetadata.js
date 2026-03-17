/**
 * updateMetadata.js
 * 
 * Handles reading from and writing to the Metadata MongoDB collection.
 * Called at the end of the inference pipeline to persist results.
 */

const Metadata = require("../../models/Metadata");

/**
 * Create or update a metadata document for a given collection.
 * Uses upsert so re-running inference on the same collection updates the record.
 * 
 * @param {string} collectionName
 * @param {Object} inferredData
 * @param {Array}  inferredData.columns      - From classifyAllColumns()
 * @param {Array}  inferredData.relationships - From detectRelationships()
 * @param {number} inferredData.totalRows
 * @param {string} inferredData.uploadedBy
 * @param {string} inferredData.ingestionRule
 */
async function saveMetadata(collectionName, inferredData) {
  const { columns, relationships, totalRows, uploadedBy, ingestionRule } = inferredData;

  // Strip internal-only fields (like "confidence") before saving
  const cleanColumns = columns.map(({ confidence, ...rest }) => rest);

  // Only save relationships where this collection is the "from" side
  const relevantRelationships = (relationships || []).filter(
    (r) => r.fromCollection === collectionName
  ).map(({ strategy, ...rest }) => rest); // strip internal "strategy" field

  const result = await Metadata.findOneAndUpdate(
    { collectionName },
    {
      $set: {
        collectionName,
        uploadedBy,
        ingestionRule,
        totalRows,
        columns: cleanColumns,
        relationships: relevantRelationships,
        inferenceStatus: "complete",
        inferenceError: null,
      },
    },
    { upsert: true, returnDocument: "after" }
  );

  return result;
}

/**
 * Mark a collection's metadata as failed (for error handling).
 */
async function markInferenceFailed(collectionName, errorMessage) {
  await Metadata.findOneAndUpdate(
    { collectionName },
    {
      $set: {
        inferenceStatus: "failed",
        inferenceError: errorMessage,
      },
    },
    { upsert: true }
  );
}

/**
 * Fetch all metadata entries (used by the Relationship Mapper to compare all collections).
 */
async function getAllMetadata() {
  return Metadata.find({}).lean();
}

/**
 * Fetch metadata for a specific collection.
 */
async function getMetadataForCollection(collectionName) {
  return Metadata.findOne({ collectionName }).lean();
}

module.exports = {
  saveMetadata,
  markInferenceFailed,
  getAllMetadata,
  getMetadataForCollection,
};