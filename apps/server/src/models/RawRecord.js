const mongoose = require("mongoose");

const { Schema } = mongoose;

const RawRecordSchema = new Schema(
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
    data: {
      type: Schema.Types.Mixed,
      required: true
    },
    sourceFileName: {
      type: String,
      default: ""
    }
  },
  {
    timestamps: true
  }
);

module.exports = mongoose.model("RawRecord", RawRecordSchema);
