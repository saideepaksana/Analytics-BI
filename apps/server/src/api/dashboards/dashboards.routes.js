const express = require('express');
const router = express.Router();
const dashboardsController = require('./dashboards.controller');

router.get('/', dashboardsController.getDashboards);
router.post('/', dashboardsController.createDashboard);
router.get('/:id', dashboardsController.getDashboardById);
router.put('/:id', dashboardsController.updateDashboard);
router.delete('/:id', dashboardsController.deleteDashboard);

module.exports = router;
