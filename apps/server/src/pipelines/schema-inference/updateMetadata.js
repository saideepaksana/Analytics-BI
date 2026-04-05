/**
 * updateMetadata.js
 *
 * Persists schema inference results into MongoDB.
 * Keeps compatibility with both the new `schema` field and the legacy `columns` field.
 */

const Metadata = require("../../models/Metadata");

/**
 * Remove internal-only fields and keep only what should be stored in metadata.
 */
function sanitizeColumns(columns = []) {
    return (Array.isArray(columns) ? columns : []).map((col) => {
        const {
            confidence, // internal scoring only
            ...rest
        } = col || {};

        return rest;
    });
}

/**
 * Remove internal-only fields from relationship objects.
 *
 * FIX: The previous version filtered relationships with:
 *   .filter((r) => r && r.fromCollection === collectionName)
 *
 * This silently dropped every relationship where the current collection appeared
 * on the toCollection side, and made it impossible to persist cross-collection
 * relationships when the new upload happened to score as the "to" side.
 *
 * The correct approach is to keep ALL relationships that involve this collection
 * (either as fromCollection or toCollection) so the full graph is preserved.
 * The relationship direction is determined by the scorer, not by who uploaded last.
 */
function sanitizeRelationships(relationships = [], collectionName) {
    return (Array.isArray(relationships) ? relationships : [])
        .filter((r) => {
            if (!r) return false;
            // Keep any relationship where this collection is either endpoint
            return r.fromCollection === collectionName || r.toCollection === collectionName;
        })
        .map((r) => {
            const {
                strategy, // internal matching strategy — not stored in DB
                score,    // optional internal score if present
                ...rest
            } = r;

            return rest;
        });
}

/**
 * Create or update a metadata document for a given collection/dataset.
 * Uses upsert so rerunning inference updates the same record.
 */
async function saveMetadata(collectionName, inferredData = {}) {
    const {
        datasetId = collectionName,
        columns = [],
        relationships = [],
        totalRows = 0,
        uploadedBy = "",
        ingestionRule = "new",
        fileName = "",
        sourceFileId = "",
    } = inferredData;

    const cleanColumns = sanitizeColumns(columns);
    const relevantRelationships = sanitizeRelationships(relationships, collectionName);

    const update = {
        $set: {
            datasetId,
            collectionName,
            fileName,
            sourceFileId,
            uploadedBy,
            ingestionRule,
            totalRows: Number(totalRows) || 0,
            rowCount: Number(totalRows) || 0,

            // Keep both fields in sync for backward compatibility.
            schema: cleanColumns,
            columns: cleanColumns,

            relationships: relevantRelationships,
            inferenceStatus: "complete",
            inferenceError: null,
        },
    };

    const result = await Metadata.findOneAndUpdate(
        { datasetId },
        update,
        {
            upsert: true,
            returnDocument: 'after',
            runValidators: true,
            setDefaultsOnInsert: true,
        }
    );

    return result;
}

/**
 * Mark inference as failed for a collection/dataset.
 */
async function markInferenceFailed(collectionName, errorMessage, datasetId = collectionName) {
    await Metadata.findOneAndUpdate(
        { datasetId },
        {
            $set: {
                datasetId,
                collectionName,
                inferenceStatus: "failed",
                inferenceError: errorMessage || "Unknown inference error",
            },
        },
        {
            upsert: true,
            returnDocument: 'after',
            runValidators: true,
            setDefaultsOnInsert: true,
        }
    );
}

/**
 * Fetch all metadata entries.
 */
async function getAllMetadata() {
    return Metadata.find({}).lean();
}

/**
 * Fetch metadata for a specific collection/dataset.
 */
async function getMetadataForCollection(collectionName) {
    return Metadata.findOne({
        $or: [{ collectionName }, { datasetId: collectionName }],
    }).lean();
}

module.exports = {
    saveMetadata,
    markInferenceFailed,
    getAllMetadata,
    getMetadataForCollection,
};