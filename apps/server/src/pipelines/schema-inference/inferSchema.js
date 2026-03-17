/**
 * inferSchema.js
 * 
 * Main entry point for the Schema Inference Engine.
 * Called by the Parser (Role 4) after raw data is inserted into MongoDB.
 * 
 * FLOW:
 *   1. Sample documents from the newly uploaded collection
 *   2. Run classifyAllColumns() on the sample
 *   3. Fetch existing metadata for all other collections
 *   4. Run detectRelationships() across all known collections
 *   5. Save everything to the Metadata collection
 * 
 * USAGE (called by parser or upload controller):
 *   const { runSchemaInference } = require('./schema-inference/inferSchema');
 *   await runSchemaInference({
 *     collectionName: "sales_data_2025",
 *     uploadedBy: "user_abc123",
 *     ingestionRule: "new",
 *     totalRows: 1500,
 *   });
 */

const mongoose = require("mongoose");
const { classifyAllColumns } = require("./classifyColumns");
const { detectRelationships } = require("./relationshipMapper");
const {
  saveMetadata,
  markInferenceFailed,
  getAllMetadata,
} = require("./updateMetadata");

const SAMPLE_SIZE = 100; // How many documents to sample for inference

/**
 * Sample documents from a MongoDB collection using the Aggregation Pipeline.
 * Uses $sample for a random sample — avoids loading the entire collection.
 * 
 * @param {string} collectionName
 * @param {number} limit
 * @returns {Array<Object>}
 */
async function sampleDocuments(collectionName, limit = SAMPLE_SIZE) {
  const collection = mongoose.connection.db.collection(collectionName);

  // Use aggregation pipeline with $sample for efficient random sampling
  const docs = await collection
    .aggregate([{ $sample: { size: limit } }])
    .toArray();

  return docs;
}

/**
 * Run the full schema inference pipeline for one collection.
 * 
 * @param {Object} options
 * @param {string} options.collectionName  - MongoDB collection that was just ingested
 * @param {string} options.uploadedBy      - User ID or name
 * @param {string} options.ingestionRule   - "new" | "append" | "replace"
 * @param {number} options.totalRows       - Total rows in the collection
 */
async function runSchemaInference({ collectionName, uploadedBy, ingestionRule, totalRows }) {
  console.log(`[SchemaInference] Starting inference for collection: ${collectionName}`);

  try {
    // --- STEP 1: Sample documents from the new collection ---
    const sampleDocs = await sampleDocuments(collectionName, SAMPLE_SIZE);

    if (sampleDocs.length === 0) {
      throw new Error(`No documents found in collection "${collectionName}"`);
    }

    console.log(`[SchemaInference] Sampled ${sampleDocs.length} documents`);

    // --- STEP 2: Classify all columns ---
    const columns = classifyAllColumns(sampleDocs, totalRows);
    console.log(`[SchemaInference] Classified ${columns.length} columns`);
    columns.forEach((col) => {
      console.log(`  → ${col.name}: ${col.role} (${col.dataType}) [confidence: ${col.confidence}]`);
    });

    // --- STEP 3: Fetch metadata for all OTHER existing collections ---
    const existingMetadata = await getAllMetadata();

    // Build the format expected by detectRelationships:
    // [{ collectionName, columns (with sampleValues), sampleDocs }]
    const allCollectionsData = [
      // The newly uploaded collection
      {
        collectionName,
        columns: columns.map((col) => ({
          name: col.name,
          dataType: col.dataType,
          role: col.role,
          sampleValues: col.sampleValues,
        })),
        sampleDocs,
      },
      // All previously known collections
      ...existingMetadata.map((meta) => ({
        collectionName: meta.collectionName,
        columns: meta.columns.map((col) => ({
          name: col.name,
          dataType: col.dataType,
          role: col.role,
          sampleValues: col.sampleValues || [],
        })),
        sampleDocs: [], // We don't re-sample old collections for performance
      })),
    ];

    // --- STEP 4: Detect relationships ---
    const relationships = detectRelationships(allCollectionsData);
    console.log(`[SchemaInference] Detected ${relationships.length} relationships`);
    relationships.forEach((rel) => {
      console.log(
        `  → ${rel.fromCollection}.${rel.fromColumn} ↔ ${rel.toCollection}.${rel.toColumn} (${rel.strategy}, confidence: ${rel.confidence})`
      );
    });

    // --- STEP 5: Save metadata to MongoDB ---
    const savedMeta = await saveMetadata(collectionName, {
      columns,
      relationships,
      totalRows,
      uploadedBy,
      ingestionRule,
    });

    console.log(`[SchemaInference] ✓ Metadata saved for "${collectionName}" (id: ${savedMeta._id})`);
    return savedMeta;

  } catch (err) {
    console.error(`[SchemaInference] ✗ Failed for "${collectionName}":`, err.message);
    await markInferenceFailed(collectionName, err.message);
    throw err; // Re-throw so the caller can handle it
  }
}

module.exports = { runSchemaInference };