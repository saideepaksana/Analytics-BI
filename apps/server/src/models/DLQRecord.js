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
    errorMessages: {
      type: [String],
      default: []
    },
    status: {
      type: String,
      default: "QUARANTINED"
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("DLQRecord", DLQRecordSchema);
