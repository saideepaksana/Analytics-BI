const express = require('express');
const {
  listDashboards,
  createDashboard,
  getDashboard,
  deleteDashboard,
  saveDashboardLayout,
  patchDashboardMetadata,
  patchDashboardState,
} = require('./dashboard.controller');

const router = express.Router();

router.get('/', listDashboards);
router.post('/', createDashboard);
router.get('/:dashboardId', getDashboard);
router.delete('/:dashboardId', deleteDashboard);
router.patch('/:dashboardId/layout', saveDashboardLayout);
router.patch('/:dashboardId/metadata', patchDashboardMetadata);
// Autosave endpoint – partial state updates with OCC
router.patch('/:dashboardId', patchDashboardState);

module.exports = router;

