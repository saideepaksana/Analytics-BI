const express = require('express');
const {
  createAnnotation,
  getAnnotationsByChart,
  getAnnotationsByDashboard,
  updateAnnotation,
  deleteAnnotation,
} = require('./annotations.controller');

const router = express.Router();

// Chart‑level annotations
router.get('/chart/:chartId', getAnnotationsByChart);

// Dashboard‑level annotations
router.get('/dashboard/:dashboardId', getAnnotationsByDashboard);

// CRUD
router.post('/', createAnnotation);
router.put('/:id', updateAnnotation);
router.delete('/:id', deleteAnnotation);

module.exports = router;
