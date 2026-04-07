const express = require("express");
const router = express.Router();
const {
  listDatasets,
  getDatasetMetadata,
  updateSchemaColumn,
  deleteQuarantinedRow,
  deleteAllQuarantinedRows,
  validateQuarantinedRow,
  restoreQuarantinedRow,
  restoreAllValidQuarantinedRows,
  deleteDataset,
  queryDatasetData,
  validatePayload,
  previewGroupStage,
} = require("./datasets.controller");

router.get("/", listDatasets);
router.get("/:datasetId/metadata", getDatasetMetadata);
router.post("/:datasetId/query", queryDatasetData);
router.post("/:datasetId/query/preview-stage", previewGroupStage);
router.post("/:datasetId/validate-payload", validatePayload);
router.patch("/:datasetId/schema/:columnName", updateSchemaColumn);
router.delete("/:datasetId/quarantine/:rowIndex", deleteQuarantinedRow);
router.delete("/:datasetId/quarantine", deleteAllQuarantinedRows);
// restore-all must be before /:rowIndex routes to avoid route conflict
router.post("/:datasetId/quarantine/restore-all", restoreAllValidQuarantinedRows);
router.post("/:datasetId/quarantine/:rowIndex/validate", validateQuarantinedRow);
router.post("/:datasetId/quarantine/:rowIndex/restore", restoreQuarantinedRow);
router.delete("/:datasetId", deleteDataset);

module.exports = router;