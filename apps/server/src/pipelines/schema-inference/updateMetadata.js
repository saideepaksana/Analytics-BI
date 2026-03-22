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
 */
function sanitizeRelationships(relationships = [], collectionName) {
    return (Array.isArray(relationships) ? relationships : [])
        .filter((r) => r && r.fromCollection === collectionName)
        .map((r) => {
            const {
                strategy, // internal matching strategy
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
        datasetId = collectionName, // fallback for older callers
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
            new: true,
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
            new: true,
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