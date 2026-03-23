const mongoose = require("mongoose");

// Column-level metadata for a dataset schema row.
// Includes schema inference details and usage hints for UI/analytics.
const ColumnSchema = new mongoose.Schema(
    {
        name: { type: String, required: true },
        // Keep both keys for backward compatibility across old/new inference flows.
        type: { type: String },
        dataType: { type: String },
        // analytic role: dimension vs. measure.
        role: {
            type: String,
            enum: ["dimension", "measure"],
            default: "dimension"
        },
        // Suggested default aggregation for measure columns.
        suggestedAggregation: {
            type: String,
            enum: ["sum", "avg", "count", "min", "max", null],
            default: null
        },
        sampleValues: [mongoose.Schema.Types.Mixed],        // like a vector in cpp of any data type, used for schema inference and UI previews.
        nullCount: { type: Number, default: 0 },            // Number of null/empty values in the sample (for data quality insights).
        uniqueCount: { type: Number, default: 0 }           // Number of unique values in the sample (for cardinality estimation).
    },
    { _id: false }
);

// Relationship between two collections (or tables) inferred by schema analysis.
const RelationshipSchema = new mongoose.Schema(
    {
        fromCollection: { type: String, required: true },
        fromColumn: { type: String, required: true },
        toCollection: { type: String, required: true },
        toColumn: { type: String, required: true },
        confidence: { type: Number, min: 0, max: 1 }, // 0.0 - 1.0 // Confidence score of the inferred relationship (for filtering/validation).
    },
    { _id: false }
);

// Metadata document stored per dataset in MongoDB.
const MetadataSchema = new mongoose.Schema(
    {
        // Primary dataset identifier used by Data Review APIs.
        datasetId: { type: String, required: true, unique: true, index: true },
        fileName: { type: String, default: "" },

        // ingestion mode controls how incoming rows are applied.
        mode: {
            type: String,
            enum: ["new", "append", "replace"],
            default: "new"
        },

        // Inferred schema columns (new pipeline uses `schema`).
        schema: { type: [ColumnSchema], default: [] },          // like vector<ColumnSchema> in cpp, stores inferred schema details for each column.
        rowCount: { type: Number, default: 0 },
        quarantinedCount: { type: Number, default: 0 },
        sourceFileId: { type: String, default: "" },

        // Legacy fields for older schema-inference and upload flows.
        collectionName: { type: String },
        uploadedBy: { type: String },
        ingestionRule: {
            type: String,
            enum: ["new", "append", "replace"]
        },
        totalRows: { type: Number, default: 0 },
        columns: { type: [ColumnSchema], default: [] },

        // Inferred FK-like relationships across collections.
        relationships: { type: [RelationshipSchema], default: [] },

        // Status fields for schema inference workflow.
        inferenceStatus: {                                      // the status of the schema inference process, not the data ingestion status. It indicates whether the system is still analyzing the sample data to infer the schema, or if it has completed that process.
            type: String,
            enum: ["pending", "complete", "failed"],
            default: "pending"
        },
        inferenceError: { type: String, default: null }
    },
    { timestamps: true }
);

module.exports = mongoose.model("Metadata", MetadataSchema);        // Export the Mongoose model for Metadata, which includes column-level schema details and inferred relationships.
