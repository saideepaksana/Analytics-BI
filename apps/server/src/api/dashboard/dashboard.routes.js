const express = require('express');
const {
  listDashboards,
  createDashboard,
  getDashboard,
  deleteDashboard,
  saveDashboardLayout,
  patchDashboardMetadata,
  patchDashboardState,
  getDashboardFull,
  refreshDashboard,
  publishDashboard,
  unpublishDashboard,
  getDraftState,
  saveDraft,
} = require('./dashboard.controller');
const { requireAuth, canMutate } = require('../../middleware/rbac');

const router = express.Router();

// ── Read endpoints (all authenticated users, viewers included) ─────────────
router.get('/', listDashboards);
router.get('/:dashboardId', getDashboard);
router.get('/:dashboardId/full', getDashboardFull);
// Draft endpoint – ownership check is enforced inside the controller
router.get('/:dashboardId/draft', requireAuth, getDraftState);

// ── Write endpoints (editor role or above) ─────────────────────────────────
router.post('/', requireAuth, canMutate, createDashboard);
router.post('/:dashboardId/refresh', requireAuth, canMutate, refreshDashboard);
router.post('/:dashboardId/publish', requireAuth, canMutate, publishDashboard);
router.post('/:dashboardId/unpublish', requireAuth, canMutate, unpublishDashboard);
router.post('/:dashboardId/save-draft', requireAuth, canMutate, saveDraft);
router.delete('/:dashboardId', requireAuth, canMutate, deleteDashboard);
router.patch('/:dashboardId/layout', requireAuth, canMutate, saveDashboardLayout);
router.patch('/:dashboardId/metadata', requireAuth, canMutate, patchDashboardMetadata);
// Autosave endpoint – partial state updates with OCC
router.patch('/:dashboardId', requireAuth, canMutate, patchDashboardState);

module.exports = router;
