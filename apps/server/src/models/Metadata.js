const mongoose = require("mongoose");

const ColumnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    // Keep both keys for backward compatibility across old/new inference flows.
    type: { type: String },
    dataType: { type: String },
    role: {
      type: String,
      enum: ["dimension", "measure"],
      default: "dimension"
    },
    suggestedAggregation: {
      type: String,
      enum: ["sum", "avg", "count", "min", "max", null],
      default: null
    },
    sampleValues: [mongoose.Schema.Types.Mixed],
    nullCount: { type: Number, default: 0 },
    uniqueCount: { type: Number, default: 0 }
  },
  { _id: false }
);

const RelationshipSchema = new mongoose.Schema(
  {
    fromCollection: { type: String, required: true },
    fromColumn: { type: String, required: true },
    toCollection: { type: String, required: true },
    toColumn: { type: String, required: true },
    confidence: { type: Number, min: 0, max: 1 }, // 0.0 - 1.0
  },
  { _id: false }
);

const MetadataSchema = new mongoose.Schema(
  {
    // Primary key used by current Data Review APIs.
    datasetId: { type: String, required: true, unique: true, index: true },
    fileName: { type: String, default: "" },
    mode: {
      type: String,
      enum: ["new", "append", "replace"],
      default: "new"
    },
    schema: { type: [ColumnSchema], default: [] },
    rowCount: { type: Number, default: 0 },
    quarantinedCount: { type: Number, default: 0 },
    sourceFileId: { type: String, default: "" },

    // Legacy fields used by older schema-inference flow.
    collectionName: { type: String },
    uploadedBy: { type: String },
    ingestionRule: {
      type: String,
      enum: ["new", "append", "replace"]
    },
    totalRows: { type: Number, default: 0 },
    columns: { type: [ColumnSchema], default: [] },

    relationships: { type: [RelationshipSchema], default: [] },

    inferenceStatus: {
      type: String,
      enum: ["pending", "complete", "failed"],
      default: "pending"
    },
    inferenceError: { type: String, default: null }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Metadata", MetadataSchema);