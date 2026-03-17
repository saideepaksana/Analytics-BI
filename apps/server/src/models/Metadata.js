const mongoose = require("mongoose");

/**
 * Metadata Schema
 * Stores the inferred schema for every collection uploaded to the platform.
 * Each document here represents one uploaded dataset/collection.
 */
const ColumnSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },       // e.g. "Revenue", "Region"
    dataType: { type: String, required: true },   // "string", "number", "date", "boolean"
    role: {
      type: String,
      enum: ["dimension", "measure"],
      required: true,
    },
    // For measures: what aggregation makes sense
    suggestedAggregation: {
      type: String,
      enum: ["sum", "avg", "count", "min", "max", null],
      default: null,
    },
    // For dimensions: example values sampled from the data
    sampleValues: [mongoose.Schema.Types.Mixed],
    nullCount: { type: Number, default: 0 },
    uniqueCount: { type: Number, default: 0 },
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
    // Which MongoDB collection this metadata describes
    collectionName: { type: String, required: true, unique: true },

    // Who uploaded it and when
    uploadedBy: { type: String, required: true },
    ingestionRule: {
      type: String,
      enum: ["new", "append", "replace"],
      required: true,
    },

    // Total rows in the collection
    totalRows: { type: Number, default: 0 },

    // Inferred columns (the main output of your work)
    columns: [ColumnSchema],

    // Detected relationships with other collections
    relationships: [RelationshipSchema],

    // Status of the inference run
    inferenceStatus: {
      type: String,
      enum: ["pending", "complete", "failed"],
      default: "pending",
    },
    inferenceError: { type: String, default: null },
  },
  { timestamps: true } // adds createdAt and updatedAt
);

module.exports = mongoose.model("Metadata", MetadataSchema);