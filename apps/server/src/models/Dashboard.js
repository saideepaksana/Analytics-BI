const mongoose = require('mongoose');

const dashboardSchema = new mongoose.Schema({
  name: { type: String, required: true },
  chartIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Chart' }],
  layout: { type: mongoose.Schema.Types.Mixed }, // React-Grid-Layout state
  annotations: { type: mongoose.Schema.Types.Mixed }, // Map of annotations applied to tiles
  filters: { type: mongoose.Schema.Types.Mixed } // Global current filters state
}, { timestamps: true });

module.exports = mongoose.models.Dashboard || mongoose.model('Dashboard', dashboardSchema);
