const mongoose = require("mongoose");

const { Schema } = mongoose;

const ChartSchema = new Schema(
  {
    title: { type: String, required: true, trim: true },
    datasetId: { type: String, required: true, index: true },
    chartType: { type: String, required: true, trim: true },
    queryConfig: {
      dimensions: { type: [String], default: [] },
      measures: { type: [String], default: [] },
      filters: { type: [Schema.Types.Mixed], default: [] },
      sort: { type: [Schema.Types.Mixed], default: [] },
      limit: { type: Number, default: 1000 },
    },
    visualization: {
      theme: { type: String, default: "default" },
      options: { type: Schema.Types.Mixed, default: {} },
    },
    state: {
      type: Schema.Types.Mixed,
      default: {},
    },
    version: { type: Number, default: 1 },
    createdBy: { type: String, default: "anonymous" },
    updatedBy: { type: String, default: "anonymous" },
  },
  { timestamps: true }
);

ChartSchema.index({ datasetId: 1, updatedAt: -1 });
ChartSchema.index({ title: "text", chartType: "text" });

module.exports = mongoose.model("Chart", ChartSchema);
