const express = require("express");
const router = express.Router();
const { exportCSV, exportExcel, exportPDF, getExportLog, generateEmbedToken } = require("./exportController");

router.get("/:datasetId/csv",  exportCSV);
router.get("/:datasetId/xlsx", exportExcel);
router.get("/:datasetId/pdf",  exportPDF);
router.get("/:datasetId/log",  getExportLog);
router.post("/embed/token",    generateEmbedToken);

module.exports = router;