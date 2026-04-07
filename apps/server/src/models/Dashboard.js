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
    createdBy: { type: String, default: "anonymous" },
    updatedBy: { type: String, default: "anonymous" },
  },
  { timestamps: true }
);

DashboardSchema.index({ updatedAt: -1 });
DashboardSchema.index({ title: "text", description: "text" });

module.exports = mongoose.model("Dashboard", DashboardSchema);
