const mongoose = require("mongoose");

const { Schema } = mongoose;

const SchemaColumnSchema = new Schema(
  {
    name: String,
    type: String,
    role: String
  },
  { _id: false }
);

const MetadataSchema = new Schema(
  {
    datasetId: {
      type: String,
      required: true,
      unique: true,
      index: true
    },
    fileName: {
      type: String,
      required: true
    },
    mode: {
      type: String,
      enum: ["new", "append", "replace"],
      default: "new"
    },
    schema: {
      type: [SchemaColumnSchema],
      default: []
    },
    rowCount: {
      type: Number,
      default: 0
    },
    quarantinedCount: {
      type: Number,
      default: 0
    },
    sourceFileId: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("Metadata", MetadataSchema);
