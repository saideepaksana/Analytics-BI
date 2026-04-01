const mongoose = require('mongoose');

const chartSchema = new mongoose.Schema({
  name: { type: String, required: true },
  datasetId: { type: String, required: true },
  chartType: { type: String, required: true },
  dimensions: [{ type: String }],
  measures: [{ type: String }],
  customization: { type: mongoose.Schema.Types.Mixed }, // Arbitrary UI specs
  data: { type: mongoose.Schema.Types.Mixed }, // A snapshot of rows pulled from dataset
  columns: [{ type: String }] // Columns mapped from dataset
}, { timestamps: true });

// Prevent overwrite errors during hot-reloads
module.exports = mongoose.models.Chart || mongoose.model('Chart', chartSchema);
