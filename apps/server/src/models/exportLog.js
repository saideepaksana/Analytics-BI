const mongoose = require("mongoose");

const exportLogSchema = new mongoose.Schema({
  datasetId:   { type: String, required: true, index: true },
  format:      { type: String, enum: ["csv", "xlsx", "pdf", "embed"], required: true },
  exportedBy:  { type: String, default: "anonymous" },
  recordCount: { type: Number, default: 0 },
  exportedAt:  { type: Date, default: Date.now },
});

module.exports = { ExportLog: mongoose.model("ExportLog", exportLogSchema) };