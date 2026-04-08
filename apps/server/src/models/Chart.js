const mongoose = require("mongoose");

const { Schema } = mongoose;

const ChartSchema = new Schema(
  {
    chartId: { type: String, required: true, unique: true, index: true },
    name: { type: String, required: true, trim: true },

    dataSource: {
      datasetId: { type: String, required: true, index: true },
      table: { type: String, default: "" },
    },

    query: {
      dimensions: [
        {
          field: { type: String },
          type: { type: String },
          label: { type: String },
          format: { type: Schema.Types.Mixed },
          meta: { type: Schema.Types.Mixed },
        },
      ],
      measures: [
        {
          field: { type: String },
          aggregation: { type: String },
          label: { type: String },
          format: { type: Schema.Types.Mixed },
          meta: { type: Schema.Types.Mixed },
        },
      ],
      filters: [
        {
          field: { type: String },
          operator: { type: String },
          value: { type: Schema.Types.Mixed },
        },
      ],
      groupBy: { type: [String], default: [] },
      orderBy: [
        {
          field: { type: String },
          direction: { type: String, enum: ["asc", "desc"] },
        },
      ],
    },

    visualization: {
      type: { type: String, required: true },
      xAxis: { type: String },
      yAxis: { type: String },
      series: { type: Schema.Types.Mixed, default: {} },
    },

    style: {
      colorPalette: { type: [String], default: [] },
      showLegend: { type: Boolean, default: true },
      showGrid: { type: Boolean, default: true },
    },

    state: {
      validation: { type: String, default: "valid" },
    },

    createdBy: { type: String, default: "anonymous" },
    updatedBy: { type: String, default: "anonymous" },
  },
  { timestamps: true }
);

ChartSchema.index({ "dataSource.datasetId": 1, updatedAt: -1 });
ChartSchema.index({ name: "text" });

module.exports = mongoose.model("Chart", ChartSchema);
