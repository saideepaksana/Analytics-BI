const mongoose = require("mongoose");

const { Schema } = mongoose;

const CleanRecordSchema = new Schema(
  {
    // ── Dataset context ─────────────────────────────
    datasetId: {
      type: String,
      required: true,
      index: true
    },

    rowNumber: {
      type: Number,
      required: true
    },

    // ── Actual cleaned row (dynamic) ────────────────
    data: {
      type: Schema.Types.Mixed,
      required: true
    },


    searchable: {
      type: Map,
      of: Schema.Types.Mixed,
      default: {}
    },

    // ── Metadata ────────────────────────────────────
    sourceFileName: {
      type: String,
      default: ""
    },

    status: {
      type: String,
      enum: ["VALID", "WARNING"],
      default: "VALID"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("CleanRecord", CleanRecordSchema);