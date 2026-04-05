const express = require("express");
const {
  listCharts,
  getChartById,
  saveChart,
  persistChartState,
} = require("./charts.controller");

const router = express.Router();

router.get("/", listCharts);
router.get("/:chartId", getChartById);
router.post("/save", saveChart);
router.patch("/:chartId/state", persistChartState);

module.exports = router;
