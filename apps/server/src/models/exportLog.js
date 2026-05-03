const mongoose = require("mongoose");

const exportLogSchema = new mongoose.Schema({
  datasetId:   { type: String, index: true },
  dashboardId: { type: String, index: true },
  jobId:       { type: String, unique: true, sparse: true },
  format:      { type: String, enum: ["csv", "xlsx", "pdf", "png", "embed", "visual"], required: true },
  status:      { type: String, enum: ["processing", "completed", "failed"], default: "processing" },
  exportedBy:  { type: String, default: "anonymous" },
  recordCount: { type: Number, default: 0 },
  filename:    { type: String },
  failureReason: { type: String },
  exportState: { type: Object },
  exportedAt:  { type: Date, default: Date.now },
});

module.exports = { ExportLog: mongoose.model("ExportLog", exportLogSchema) };