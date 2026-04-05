const express = require("express");
const {
  listCharts,
  getChartById,
  saveChart,
  deleteChart,
} = require("./charts.controller");

const router = express.Router();

/**
 * Chart API Routes
 * Base path: /api/charts
 */

// List all charts (supports filtering by datasetId)
router.get("/", listCharts);

// Get a single chart by chartId or _id
router.get("/:id", getChartById);

// Create or update a chart
router.post("/", saveChart);

// Delete a chart by chartId or _id
router.delete("/:id", deleteChart);

module.exports = router;
