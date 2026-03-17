const express = require("express");
const router = express.Router();
const {
  getDatasetMetadata,
  updateSchemaColumn,
  deleteQuarantinedRow,
  deleteAllQuarantinedRows,
  validateQuarantinedRow,
  restoreQuarantinedRow,
  restoreAllValidQuarantinedRows,
} = require("./datasets.controller");

router.get("/:datasetId/metadata", getDatasetMetadata);
router.patch("/:datasetId/schema/:columnName", updateSchemaColumn);
router.delete("/:datasetId/quarantine/:rowIndex", deleteQuarantinedRow);
router.delete("/:datasetId/quarantine", deleteAllQuarantinedRows);
// restore-all must be before /:rowIndex routes to avoid route conflict
router.post("/:datasetId/quarantine/restore-all", restoreAllValidQuarantinedRows);
router.post("/:datasetId/quarantine/:rowIndex/validate", validateQuarantinedRow);
router.post("/:datasetId/quarantine/:rowIndex/restore", restoreQuarantinedRow);

module.exports = router;