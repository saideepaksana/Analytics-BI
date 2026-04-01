const express = require('express');
const router = express.Router();
const chartsController = require('./charts.controller');

router.get('/', chartsController.getCharts);
router.post('/', chartsController.createChart);
router.get('/:id', chartsController.getChartById);
router.put('/:id', chartsController.updateChart);
router.delete('/:id', chartsController.deleteChart);

module.exports = router;
