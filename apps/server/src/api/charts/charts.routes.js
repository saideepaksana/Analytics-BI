const express = require("express");
const {
  listCharts,
  getChartById,
  saveChart,
  deleteChart,
} = require("./charts.controller");
const { requireAuth, canMutate } = require("../../middleware/rbac");

const router = express.Router();

/**
 * Chart API Routes
 * Base path: /api/charts
 */

// List all charts (supports filtering by datasetId) – readable by all
router.get("/", listCharts);

// Get a single chart by chartId or _id – readable by all
router.get("/:id", getChartById);

// Create or update a chart – editor/admin only
router.post("/", requireAuth, canMutate, saveChart);

// Delete a chart by chartId or _id – editor/admin only
router.delete("/:id", requireAuth, canMutate, deleteChart);

module.exports = router;
