const express = require("express");
const { 
  patchDashboardMetadata,
  listDashboards,
  createDashboard,
  getDashboard,
  deleteDashboard,
  saveDashboardLayout 
} = require("./dashboard.controller");

const router = express.Router();

router.get('/', listDashboards);
router.post('/', createDashboard);
router.get('/:dashboardId', getDashboard);
router.delete('/:dashboardId', deleteDashboard);
router.patch('/:dashboardId/layout', saveDashboardLayout);
router.patch("/:dashboardId/metadata", patchDashboardMetadata);

module.exports = router;
