const express = require("express");
const dlqService = require("../services/dlqService");
const DLQRecord = require("../models/DLQRecord");

const router = express.Router();

/**
 * DLQ Management Routes
 * - Get error patterns
 * - View error statistics
 * - Apply bulk fixes
 * - Manage individual DLQ records
 */

// ─────────────────────────────────────────────────────────────
// GET /dlq/:datasetId/patterns
// Aggregate errors by pattern (group similar errors)
// ─────────────────────────────────────────────────────────────
router.get("/:datasetId/patterns", async (req, res) => {
  try {
    const { datasetId } = req.params;

    const patterns = await dlqService.getErrorPatterns(datasetId);

    res.json({
      datasetId,
      totalPatterns: patterns.length,
      patterns: patterns.map(p => ({
        aggregationKey: p._id,
        errorType: p.errorType,
        affectedField: p.affectedField,
        categoricalFix: p.categoricalFix,
        affectedRowCount: p.totalCount,
        sampleRows: p.rowNumbers.slice(0, 5),
        severity: p.severity,
        automatable: p.automatable,
        confidence: p.autoFixConfidence,
        fixDescription: dlqService.ERROR_TYPE_TO_FIX_MAP[p.errorType]?.description || "Unknown"
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /dlq/:datasetId/statistics
// Get error distribution statistics
// ─────────────────────────────────────────────────────────────
router.get("/:datasetId/statistics", async (req, res) => {
  try {
    const { datasetId } = req.params;

    const stats = await dlqService.getErrorStatistics(datasetId);

    res.json({
      datasetId,
      summary: {
        totalErrors: stats.totalErrors[0]?.total || 0,
        autoFixable: stats.autoFixable[0]?.total || 0,
        manualReviewRequired: (stats.totalErrors[0]?.total || 0) - (stats.autoFixable[0]?.total || 0)
      },
      byStatus: Object.fromEntries(
        stats.byStatus.map(s => [s._id, s.count])
      ),
      bySeverity: Object.fromEntries(
        stats.bySeverity.map(s => [s._id, s.count])
      ),
      byCategory: Object.fromEntries(
        stats.byCategory.map(s => [s._id, s.count])
      )
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /dlq/:datasetId/errors/:aggregationKey
// Get all rows with a specific error pattern
// ─────────────────────────────────────────────────────────────
router.get("/:datasetId/errors/:aggregationKey", async (req, res) => {
  try {
    const { datasetId, aggregationKey } = req.params;
    const { limit = 20, offset = 0 } = req.query;

    const errors = await dlqService.getErrorsByAggregationKey(
      datasetId,
      Buffer.from(aggregationKey, "base64").toString(),
      limit
    );

    res.json({
      datasetId,
      aggregationKey,
      total: errors.length,
      limit,
      offset,
      errors: errors.map(e => ({
        recordId: e._id,
        rowNumber: e.rowNumber,
        errorType: e.errorFingerprint?.errorType,
        affectedField: e.errorFingerprint?.affectedField,
        errorMessage: e.errorMessages[0],
        rawData: e.rawData,
        suggestedFix: e.suggestedFix,
        status: e.status,
        severity: e.severity
      }))
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /dlq/:datasetId/bulk-fix
// Apply fix to all rows with a specific error pattern
// ─────────────────────────────────────────────────────────────
router.post("/:datasetId/bulk-fix", async (req, res) => {
  try {
    const { datasetId } = req.params;
    const { errorAggregationKey, fixScript, confirmedBy } = req.body;

    if (!errorAggregationKey || !fixScript) {
      return res.status(400).json({
        error: "Missing required fields: errorAggregationKey, fixScript"
      });
    }

    const result = await dlqService.bulkApplyFix(
      datasetId,
      errorAggregationKey,
      fixScript,
      confirmedBy || "system"
    );

    res.json({
      success: true,
      bulkFixGroupId: result.bulkFixGroupId,
      summary: {
        totalAttempted: result.totalAttempted,
        successful: result.successful,
        failed: result.failed,
        successRate: `${Math.round((result.successful / result.totalAttempted) * 100)}%`
      },
      details: result.details.filter(d => !d.success).slice(0, 5) // Show failures
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// POST /dlq/:recordId/resolve
// Mark individual error record as resolved
// ─────────────────────────────────────────────────────────────
router.post("/:recordId/resolve", async (req, res) => {
  try {
    const { recordId } = req.params;
    const { status = "RESOLVED", notes = "" } = req.body;

    const updated = await dlqService.markAsResolved(recordId, status, notes);

    res.json({
      success: true,
      record: {
        recordId: updated._id,
        status: updated.status,
        lastResolution: updated.resolutionHistory[updated.resolutionHistory.length - 1]
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /dlq/:datasetId/quarantine-dashboard
// Full dashboard view of quarantine status
// ─────────────────────────────────────────────────────────────
router.get("/:datasetId/quarantine-dashboard", async (req, res) => {
  try {
    const { datasetId } = req.params;

    const [patterns, stats, totalRecords] = await Promise.all([
      dlqService.getErrorPatterns(datasetId),
      dlqService.getErrorStatistics(datasetId),
      DLQRecord.countDocuments({ datasetId })
    ]);

    // Priority order: by frequency + severity + autofix confidence
    const prioritizedPatterns = patterns
      .sort((a, b) => {
        const aSeverityScore = { critical: 4, high: 3, medium: 2, low: 1 }[a.severity] || 0;
        const bSeverityScore = { critical: 4, high: 3, medium: 2, low: 1 }[b.severity] || 0;

        return (
          b.totalCount - a.totalCount || // More frequent first
          bSeverityScore - aSeverityScore || // Higher severity first
          b.autoFixConfidence - a.autoFixConfidence // Higher confidence first
        );
      })
      .slice(0, 10); // Top 10 issues

    res.json({
      datasetId,
      dashboard: {
        totalQuarantined: totalRecords,
        resolvable: {
          automatic: stats.autoFixable[0]?.total || 0,
          manual: (stats.totalErrors[0]?.total || 0) - (stats.autoFixable[0]?.total || 0)
        },
        summary: {
          byStatus: Object.fromEntries(stats.byStatus.map(s => [s._id, s.count])),
          bySeverity: Object.fromEntries(stats.bySeverity.map(s => [s._id, s.count])),
          byCategory: Object.fromEntries(stats.byCategory.map(s => [s._id, s.count]))
        },
        topIssues: prioritizedPatterns.map(p => ({
          aggregationKey: Buffer.from(p._id).toString("base64"),
          errorType: p.errorType,
          affectedField: p.affectedField,
          categoricalFix: p.categoricalFix,
          affectedRows: p.totalCount,
          severity: p.severity,
          automatable: p.automatable,
          confidence: `${p.autoFixConfidence}%`,
          action: p.automatable ? "AUTO_FIX_AVAILABLE" : "MANUAL_REVIEW_NEEDED"
        }))
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ─────────────────────────────────────────────────────────────
// GET /dlq/:recordId
// View single DLQ record in detail
// ─────────────────────────────────────────────────────────────
router.get("/:recordId/detail", async (req, res) => {
  try {
    const { recordId } = req.params;

    const record = await DLQRecord.findById(recordId);

    if (!record) {
      return res.status(404).json({ error: "Record not found" });
    }

    res.json({
      recordId: record._id,
      rowNumber: record.rowNumber,
      datasetId: record.datasetId,
      rawData: record.rawData,
      cleanedData: record.cleanedData,
      errorDetails: record.errorDetails,
      categoricalFix: record.errorFingerprint?.categoricalFix,
      suggestedFix: record.suggestedFix,
      fixInstructions: record.fixInstructions,
      status: record.status,
      severity: record.severity,
      automatable: record.suggestedFix?.automatable,
      confidence: record.suggestedFix?.confidence,
      resolutionHistory: record.resolutionHistory,
      createdAt: record.createdAt,
      updatedAt: record.updatedAt
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;
