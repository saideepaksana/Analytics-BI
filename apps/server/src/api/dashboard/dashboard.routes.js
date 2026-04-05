const express = require("express");
const { patchDashboardMetadata } = require("./dashboard.controller");

const router = express.Router();

router.patch("/:dashboardId/metadata", patchDashboardMetadata);

module.exports = router;
