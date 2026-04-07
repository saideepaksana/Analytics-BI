const Chart = require("../../models/Chart");
const crypto = require("crypto");
const logger = require("../../core/logger");

/**
 * Maps incoming request body to the professional Chart schema.
 * Provides defaults for missing nested fields.
 */
const mapToChartSchema = (body = {}) => {
  return {
    chartId: body.chartId || crypto.randomUUID(),
    name: body.name || body.title || "Untitled Chart",

    dataSource: {
      datasetId: body.dataSource?.datasetId || body.datasetId || "",
      table: body.dataSource?.table || body.table || "",
    },

    query: {
      dimensions: Array.isArray(body.query?.dimensions) ? body.query.dimensions : [],
      measures: Array.isArray(body.query?.measures) ? body.query.measures : [],
      filters: Array.isArray(body.query?.filters) ? body.query.filters : [],
      groupBy: Array.isArray(body.query?.groupBy) ? body.query.groupBy : [],
      orderBy: Array.isArray(body.query?.orderBy) ? body.query.orderBy : [],
    },

    visualization: {
      type: body.visualization?.type || body.chartType || "bar",
      xAxis: body.visualization?.xAxis || "",
      yAxis: body.visualization?.yAxis || "",
      series: body.visualization?.series || {},
    },

    style: {
      colorPalette: body.style?.colorPalette || ["#5470C6"],
      showLegend: body.style?.showLegend !== false,
      showGrid: body.style?.showGrid !== false,
    },

    state: {
      validation: body.state?.validation || "valid",
    },
  };
};

/**
 * GET /api/charts
 * Lists charts with pagination and optional dataset filtering.
 */
exports.listCharts = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit, 10) || 20, 200);
    const offset = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const datasetId = String(req.query.datasetId || "").trim();

    const filter = {};
    if (datasetId) {
      filter["dataSource.datasetId"] = datasetId;
    }

    const [charts, total] = await Promise.all([
      Chart.find(filter)
        .sort({ updatedAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean(),
      Chart.countDocuments(filter),
    ]);

    return res.json({
      charts,
      pagination: {
        total,
        limit,
        offset,
      },
    });
  } catch (error) {
    logger.error(`List charts failed: ${error.message}`, "ChartsController");
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * GET /api/charts/:id
 * Fetches a single chart by chartId or MongoDB _id.
 */
exports.getChartById = async (req, res) => {
  try {
    const { id } = req.params;
    const isMongoId = id.match(/^[0-9a-fA-F]{24}$/);

    const chart = await Chart.findOne({
      $or: [
        { chartId: id },
        ...(isMongoId ? [{ _id: id }] : [])
      ]
    }).lean();

    if (!chart) {
      return res.status(404).json({ message: "Chart not found" });
    }

    return res.json({ chart });
  } catch (error) {
    logger.error(`Get chart failed: ${error.message}`, "ChartsController");
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * POST /api/charts
 * Saves a chart (creates if new chartId, updates if existing).
 */
exports.saveChart = async (req, res) => {
  try {
    const payload = mapToChartSchema(req.body);
    const actor = req.user?.id || "anonymous";

    if (!payload.dataSource.datasetId) {
      return res.status(400).json({ message: "datasetId is required" });
    }

    const chart = await Chart.findOneAndUpdate(
      { chartId: payload.chartId },
      {
        $set: {
          ...payload,
          updatedBy: actor,
        },
        $setOnInsert: { createdBy: actor }
      },
      { upsert: true, new: true, runValidators: true }
    );

    return res.json({
      message: "Chart saved successfully",
      chart,
    });
  } catch (error) {
    logger.error(`Save chart failed: ${error.message}`, "ChartsController");
    return res.status(500).json({ message: "Internal server error", detail: error.message });
  }
};

/**
 * DELETE /api/charts/:id
 * Removes a chart by chartId or MongoDB _id.
 */
exports.deleteChart = async (req, res) => {
  try {
    const { id } = req.params;
    const isMongoId = id.match(/^[0-9a-fA-F]{24}$/);

    const deleted = await Chart.findOneAndDelete({
      $or: [
        { chartId: id },
        ...(isMongoId ? [{ _id: id }] : [])
      ]
    });

    if (!deleted) {
      return res.status(404).json({ message: "Chart not found" });
    }

    return res.json({ message: "Chart deleted successfully" });
  } catch (error) {
    logger.error(`Delete chart failed: ${error.message}`, "ChartsController");
    return res.status(500).json({ message: "Internal server error" });
  }
};
