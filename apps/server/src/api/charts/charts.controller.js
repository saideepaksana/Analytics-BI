const Chart = require("../../models/Chart");
const logger = require("../../core/logger");
const chartMapper = require("./chartMapper");
const { validateChart, ChartValidationError } = require("./chartValidator");

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
      charts: charts.map(chartMapper.fromDB),
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

    return res.json({ chart: chartMapper.fromDB(chart) });
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
    // 1. Validation Logic
    await validateChart(req.body);

    // 2. Map frontend -> DB
    const payload = chartMapper.toDB(req.body);
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
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    return res.json({
      message: "Chart saved successfully",
      chart: chartMapper.fromDB(chart.toJSON()),
    });
  } catch (error) {
    if (error instanceof ChartValidationError) {
      return res.status(422).json({ message: error.message, error: "ValidationError" });
    }
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
