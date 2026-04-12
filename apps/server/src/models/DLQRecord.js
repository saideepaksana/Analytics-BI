const mongoose = require("mongoose");

const { Schema } = mongoose;

const DLQRecordSchema = new Schema(
  {
    datasetId: {
      type: String,
      required: true,
      index: true
    },
    rowNumber: {
      type: Number,
      required: true
    },
    rawData: {
      type: Schema.Types.Mixed,
      required: true
    },
    cleanedData: {
      type: Schema.Types.Mixed,
      default: null
    },
    errorMessages: {
      type: [String],
      default: []
    },
    errorCategory: {
      type: String,
      enum: ["structural", "validation", "unknown"],
      default: "unknown"
    },
    suggestion: {
      type: String,
      default: ""
    },
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium"
    },
    status: {
      type: String,
      default: "QUARANTINED"
    },
    attemptedRestores: {
      type: Number,
      default: 0
    },
    manualEdits: {
      type: Number,
      default: 0
    },
    lastModifiedBy: {
      type: String,
      default: "system"
    }
  },
  {
    timestamps: true
  }
);

DLQRecordSchema.index({ datasetId: 1, rowNumber: 1 }, { unique: true });
DLQRecordSchema.index({ datasetId: 1, createdAt: -1 });
DLQRecordSchema.index({ errorMessages: "text" });
DLQRecordSchema.index({ status: 1, severity: 1, createdAt: -1 });
DLQRecordSchema.index({ errorCategory: 1, createdAt: -1 });

module.exports = mongoose.model("DLQRecord", DLQRecordSchema);
