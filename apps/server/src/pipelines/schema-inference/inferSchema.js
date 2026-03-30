/**
 * inferSchema.js
 *
 * Main entry point for the Schema Inference Engine.
 * Called after raw data is inserted into MongoDB.
 *
 * FLOW:
 *   1. Sample documents from the new collection
 *   2. Run classifyAllColumns() on the sample
 *   3. Fetch metadata for all other collections
 *   4. Run detectRelationships() across known collections
 *   5. Save results to the Metadata collection
 */

const mongoose = require("mongoose");
const { classifyAllColumns } = require("./classifyColumns");
const { detectRelationships } = require("./relationshipMapper");
const { saveMetadata, markInferenceFailed, getAllMetadata, } = require("./updateMetadata");

const SAMPLE_SIZE = 100;

/**
 * Safely sample documents from a MongoDB collection.
 * Falls back to a normal limited find if $sample is not available or fails.
 */
async function sampleDocuments(collectionName, limit = SAMPLE_SIZE) {   // document's here mean rows
    if (!mongoose.connection || !mongoose.connection.db) {
        throw new Error("MongoDB connection is not ready");
    }

    const collection = mongoose.connection.db.collection(collectionName);
    const estimatedCount = await collection.estimatedDocumentCount().catch(() => limit);

    if (!estimatedCount || estimatedCount <= 0) {
        return [];
    }

    const sampleSize = Math.max(1, Math.min(limit, estimatedCount));

    try {
        return await collection.aggregate([{ $sample: { size: sampleSize } }]).toArray();   // randomly samples documents.
    } catch (err) {
        // Fallback for environments where $sample is not ideal.
        return await collection.find({}).limit(sampleSize).toArray();
    }
}

/**
 * Normalize metadata records into the shape expected by detectRelationships().
 */
function toRelationshipInput(meta) {
    const columns = Array.isArray(meta.schema)
        ? meta.schema
        : Array.isArray(meta.columns)
            ? meta.columns
            : [];

    return {
        collectionName: meta.collectionName || meta.datasetId,
        rowCount: meta.rowCount ?? meta.totalRows ?? 0,
        totalRows: meta.totalRows ?? meta.rowCount ?? 0,
        columns: columns.map((col) => ({
            name: col.name,
            dataType: col.dataType || col.type,
            role: col.role,
            sampleValues: col.sampleValues || [],
            uniqueCount: col.uniqueCount ?? 0,
        })),
    };
}

/**
 * Run the full schema inference pipeline for one collection.
 */
async function runSchemaInference({
    collectionName,
    uploadedBy = "",
    ingestionRule = "new",
    totalRows = 0,
    fileName = "",
    sourceFileId = "",
    datasetId = collectionName,
}) {
    console.log(`[SchemaInference] Starting inference for collection: ${collectionName}`);

    try {
        if (!collectionName || typeof collectionName !== "string") {
            throw new Error("collectionName is required");
        }

        // Step 1: sample documents from the newly uploaded collection
        const sampleDocs = await sampleDocuments(collectionName, SAMPLE_SIZE);

        if (sampleDocs.length === 0) {
            throw new Error(`No documents found in collection "${collectionName}"`);
        }

        console.log(`[SchemaInference] Sampled ${sampleDocs.length} documents`);

        // Step 2: classify columns
        const columns = classifyAllColumns(sampleDocs, totalRows || sampleDocs.length);

        console.log(`[SchemaInference] Classified ${columns.length} columns`);
        for (const col of columns) {
            console.log(
                `  → ${col.name}: ${col.role} (${col.dataType}) [confidence: ${col.confidence}]`
            );
        }

        // Step 3: fetch metadata for other collections only
        const existingMetadata = await getAllMetadata();

        const otherCollections = existingMetadata
            .filter((meta) => {
                const metaCollectionName = meta.collectionName || meta.datasetId;
                const metaDatasetId = meta.datasetId || meta.collectionName;
                return metaCollectionName !== collectionName && metaDatasetId !== datasetId;
            })
            .map(toRelationshipInput);

        const currentCollection = {
            collectionName,
            rowCount: totalRows || sampleDocs.length,
            totalRows: totalRows || sampleDocs.length,
            columns: columns.map((col) => ({
                name: col.name,
                dataType: col.dataType,
                role: col.role,
                sampleValues: col.sampleValues || [],
                uniqueCount: col.uniqueCount ?? 0,
            })),
        };

        const allCollectionsData = [currentCollection, ...otherCollections];

        // Step 4: detect relationships
        const relationships = detectRelationships(allCollectionsData);

        console.log(`[SchemaInference] Detected ${relationships.length} relationships`);
        for (const rel of relationships) {
            console.log(
                `  → ${rel.fromCollection}.${rel.fromColumn} -> ${rel.toCollection}.${rel.toColumn} (${rel.strategy || "unknown"}, confidence: ${rel.confidence})`
            );
        }

        // Step 5: persist metadata
        const savedMeta = await saveMetadata(collectionName, {
            datasetId,
            fileName,
            sourceFileId,
            columns,
            relationships,
            totalRows,
            uploadedBy,
            ingestionRule,
        });

        console.log(
            `[SchemaInference] ✓ Metadata saved for "${collectionName}" (id: ${savedMeta._id})`
        );

        // Step 6: Update cross-collection edges for previously existing datasets
        for (const meta of existingMetadata) {
            const mCollName = meta.collectionName || meta.datasetId;
            const isRelatedToNew = relationships.some(r =>
                (r.fromCollection === collectionName && r.toCollection === mCollName) ||
                (r.toCollection === collectionName && r.fromCollection === mCollName)
            );

            if (isRelatedToNew) {
                await saveMetadata(mCollName, {
                    datasetId: meta.datasetId || mCollName,
                    fileName: meta.fileName,
                    sourceFileId: meta.sourceFileId,
                    columns: meta.schema || meta.columns || [],
                    relationships: relationships,
                    totalRows: meta.totalRows ?? meta.rowCount ?? 0,
                    uploadedBy: meta.uploadedBy,
                    ingestionRule: meta.ingestionRule,
                });
                console.log(`[SchemaInference] ✓ Cross-collection links updated for "${mCollName}"`);
            }
        }

        return savedMeta;
    } catch (err) {
        console.error(`[SchemaInference] ✗ Failed for "${collectionName}":`, err.message);

        try {
            await markInferenceFailed(collectionName, err.message, datasetId);
        } catch (markErr) {
            console.error(
                `[SchemaInference] Failed to mark inference as failed:`,
                markErr.message
            );
        }

        throw err;
    }
}

module.exports = { runSchemaInference };