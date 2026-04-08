const mongoose = require("mongoose");

const { Schema } = mongoose;

const DashboardSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    tags: { type: [String], default: [] },
    isFavorite: { type: Boolean, default: false },
    status: { type: String, enum: ["draft", "published"], default: "draft" },
    layout: { type: Schema.Types.Mixed, default: [] },
    chartRefs: [{ type: Schema.Types.ObjectId, ref: "Chart" }],
    // Normalized dashboard state fields
    filters: { type: Schema.Types.Mixed, default: {} },
    metadata: { type: Schema.Types.Mixed, default: {} },
    // Optional, lossless snapshot of the raw frontend payload (not source of truth)
    _rawFrontendState: { type: Schema.Types.Mixed, default: null },
    createdBy: { type: String, default: "anonymous" },
    updatedBy: { type: String, default: "anonymous" },
  },
  // OCC is implemented explicitly in controllers via version matching + $inc on __v.
  // Keep schema behavior simple to avoid any implicit version semantics.
  { timestamps: true }
);

DashboardSchema.index({ updatedAt: -1 });
DashboardSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Dashboard", DashboardSchema);
