const DLQRecord = require("../models/DLQRecord");
const crypto = require("crypto");

/**
 * DLQ Error Aggregation Service
 * - Groups similar errors across rows
 * - Suggests categorical fixes
 * - Tracks error patterns for bulk operations
 * - Provides analytics on error distribution
 */

// ─────────────────────────────────────────────────────────────
// Generate Error Fingerprint: Hash of error characteristics
// ─────────────────────────────────────────────────────────────
function generateErrorFingerprint(errorType, field, categoricalFix) {
  const key = `${errorType}|${field}|${categoricalFix}`;
  return crypto.createHash("md5").update(key).digest("hex");
}

// ─────────────────────────────────────────────────────────────
// Map Error Type to Categorical Fix
// ─────────────────────────────────────────────────────────────
const ERROR_TYPE_TO_FIX_MAP = {
  // TYPE_MISMATCH: Can't parse [value] as [expectedType]
  TYPE_MISMATCH: {
    category: "TYPE_CONVERSION",
    automatable: true,
    confidence: 85,
    description: "Convert between compatible types (string→number, etc.)"
  },

  // INVALID_FORMAT: Date format unrecognized, phone format invalid
  INVALID_FORMAT: {
    category: "FORMAT_NORMALIZATION",
    automatable: true,
    confidence: 75,
    description: "Normalize to standard format (dates, phone numbers, etc.)"
  },

  // INVALID_DATE: Unparseable date string
  INVALID_DATE: {
    category: "FORMAT_NORMALIZATION",
    automatable: true,
    confidence: 70,
    description: "Parse date using alternative formats"
  },

  // WHITESPACE_ISSUE: Extra spaces, invalid casing
  WHITESPACE_ISSUE: {
    category: "TRIMMING_AND_CASING",
    automatable: true,
    confidence: 95,
    description: "Trim whitespace and normalize casing"
  },

  // NULL_VALUE: Field is null but required
  NULL_VALUE: {
    category: "NULL_SUBSTITUTION",
    automatable: false,
    confidence: 30,
    description: "Provide default value or skip row"
  },

  // OUT_OF_RANGE: Number outside valid range
  OUT_OF_RANGE: {
    category: "RANGE_VALIDATION",
    automatable: true,
    confidence: 45,
    description: "Clamp to valid range or reject"
  },

  // DUPLICATE_KEY: Violates unique constraint
  DUPLICATE: {
    category: "DEDUPLICATION",
    automatable: false,
    confidence: 50,
    description: "Keep first occurrence, flag subsequent"
  },

  // CATEGORICAL_MISMATCH: Value not in allowed set
  CATEGORICAL_MISMATCH: {
    category: "CATEGORICAL_MAPPING",
    automatable: false,
    confidence: 40,
    description: "Map to standardized category or reject"
  },

  // COLUMN_MISSING: Expected column not found in row
  COLUMN_MISSING: {
    category: "STRUCTURAL_FIX",
    automatable: false,
    confidence: 20,
    description: "Check CSV structure and alignment"
  },

  // DELIMITER_ISSUE: CSV field not parsed correctly
  DELIMITER_ISSUE: {
    category: "DELIMITER_FIX",
    automatable: false,
    confidence: 35,
    description: "Adjust CSV delimiter or quoting"
  }
};

// ─────────────────────────────────────────────────────────────
// Create DLQ Record with Error Classification
// ─────────────────────────────────────────────────────────────
async function createDLQRecord(
  datasetId,
  rowNumber,
  rawData,
  errorDetails = [],
  categoricalFix = "UNKNOWN"
) {
  // Determine overall error category
  const errorCategory = determineErrorCategory(errorDetails);

  // Generate error fingerprint
  const primaryError = errorDetails[0];
  const fingerprint = {
    hash: generateErrorFingerprint(
      primaryError?.errorType || "UNKNOWN",
      primaryError?.field || "unknown",
      categoricalFix
    ),
    errorType: primaryError?.errorType || "UNKNOWN",
    affectedField: primaryError?.field || "unknown",
    categoricalFix
  };

  // Generate aggregation key
  const errorAggregationKey = `${datasetId}|${fingerprint.errorType}|${fingerprint.affectedField}|${categoricalFix}`;

  // Suggest fix based on error type
  const suggestedFix = getSuggestedFix(
    primaryError?.errorType || "UNKNOWN",
    primaryError?.field || "unknown",
    categoricalFix
  );

  const fixInstructions = generateFixInstructions(
    primaryError?.errorType,
    categoricalFix,
    rawData
  );

  const dlqRecord = new DLQRecord({
    datasetId,
    rowNumber,
    rawData,
    cleanedData: null,
    errorMessages: errorDetails.map(e => e.message),
    errorDetails,
    errorFingerprint: fingerprint,
    errorCategory,
    suggestedFix,
    fixInstructions,
    errorAggregationKey,
    status: suggestedFix?.automatable ? "QUARANTINED" : "MANUAL_FIX_NEEDED",
    severity: calculateSeverity(errorDetails, categoricalFix)
  });

  return await dlqRecord.save();
}

// ─────────────────────────────────────────────────────────────
// Determine Error Category from Error Details
// ─────────────────────────────────────────────────────────────
function determineErrorCategory(errorDetails) {
  if (!errorDetails || errorDetails.length === 0) return "unknown";

  const errorTypes = errorDetails.map(e => e.errorType);

  if (errorTypes.includes("COLUMN_MISSING") || errorTypes.includes("DELIMITER_ISSUE")) {
    return "structural";
  }

  if (
    errorTypes.some(t => 
      t.includes("TYPE_MISMATCH") || 
      t.includes("INVALID") || 
      t.includes("OUT_OF_RANGE")
    )
  ) {
    return "validation";
  }

  if (errorTypes.includes("NULL_VALUE") || errorTypes.includes("DUPLICATE")) {
    return "data_quality";
  }

  return "unknown";
}

// ─────────────────────────────────────────────────────────────
// Get Suggested Fix based on Error Type
// ─────────────────────────────────────────────────────────────
function getSuggestedFix(errorType, field, categoricalFix) {
  const fixTemplate = ERROR_TYPE_TO_FIX_MAP[errorType];

  if (!fixTemplate) {
    return {
      fixId: "unknown",
      category: "UNKNOWN",
      description: "Manual review needed",
      appliesTo: [field],
      automatable: false,
      confidence: 0
    };
  }

  return {
    fixId: `${errorType.toLowerCase()}_${field}`,
    category: fixTemplate.category,
    description: fixTemplate.description,
    appliesTo: [field],
    automatable: fixTemplate.automatable,
    confidence: fixTemplate.confidence,
    exampleBefore: null,
    exampleAfter: null
  };
}

// ─────────────────────────────────────────────────────────────
// Generate Human-Readable Fix Instructions
// ─────────────────────────────────────────────────────────────
function generateFixInstructions(errorType, categoricalFix, rowData) {
  const instructions = [];

  const fixMap = ERROR_TYPE_TO_FIX_MAP[errorType];
  if (!fixMap) {
    return `Manual review required for [${errorType}]`;
  }

  instructions.push(`Fix Category: ${fixMap.category}`);
  instructions.push(`Action: ${fixMap.description}`);

  if (fixMap.automatable) {
    instructions.push("✓ This can be auto-applied with confirmation");
  } else {
    instructions.push("⚠ Manual action required");
  }

  instructions.push(`Confidence: ${fixMap.confidence}%`);

  return instructions.join("\n");
}

// ─────────────────────────────────────────────────────────────
// Calculate Severity based on Error Impact
// ─────────────────────────────────────────────────────────────
function calculateSeverity(errorDetails, categoricalFix) {
  if (!errorDetails || errorDetails.length === 0) return "low";

  // Structural or delimiter issues = critical
  const criticalErrors = errorDetails.filter(e => 
    e.errorType?.includes("COLUMN_MISSING") || 
    e.errorType?.includes("DELIMITER_ISSUE")
  );
  if (criticalErrors.length > 0) return "critical";

  // Multiple errors on same row = high
  if (errorDetails.length > 2) return "high";

  // Null violations or duplicates = medium
  const mediumErrors = errorDetails.filter(e =>
    e.errorType?.includes("NULL") || e.errorType?.includes("DUPLICATE")
  );
  if (mediumErrors.length > 0) return "medium";

  return "low";
}

// ─────────────────────────────────────────────────────────────
// Aggregate Errors by Pattern (Get error groups)
// ─────────────────────────────────────────────────────────────
async function getErrorPatterns(datasetId) {
  const pipeline = [
    {
      $match: { datasetId, status: { $ne: "RESOLVED" } }
    },
    {
      $group: {
        _id: "$errorAggregationKey",
        errorType: { $first: "$errorFingerprint.errorType" },
        affectedField: { $first: "$errorFingerprint.affectedField" },
        categoricalFix: { $first: "$errorFingerprint.categoricalFix" },
        totalCount: { $sum: 1 },
        rowNumbers: { $push: "$rowNumber" },
        severity: { $first: "$severity" },
        automatable: { $first: "$suggestedFix.automatable" },
        autoFixConfidence: { $first: "$suggestedFix.confidence" }
      }
    },
    {
      $sort: { totalCount: -1 }
    }
  ];

  return await DLQRecord.aggregate(pipeline);
}

// ─────────────────────────────────────────────────────────────
// Get Error Statistics for Dataset
// ─────────────────────────────────────────────────────────────
async function getErrorStatistics(datasetId) {
  const stats = await DLQRecord.aggregate([
    { $match: { datasetId } },
    {
      $facet: {
        byStatus: [
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 }
            }
          }
        ],
        bySeverity: [
          {
            $group: {
              _id: "$severity",
              count: { $sum: 1 }
            }
          }
        ],
        byCategory: [
          {
            $group: {
              _id: "$errorCategory",
              count: { $sum: 1 }
            }
          }
        ],
        autoFixable: [
          {
            $match: { "suggestedFix.automatable": true }
          },
          {
            $count: "total"
          }
        ],
        totalErrors: [
          {
            $count: "total"
          }
        ]
      }
    }
  ]);

  return stats[0];
}

// ─────────────────────────────────────────────────────────────
// Bulk Apply Fix to Error Group
// ─────────────────────────────────────────────────────────────
async function bulkApplyFix(
  datasetId,
  errorAggregationKey,
  fixScript,
  appliedBy = "system"
) {
  // Find all rows with this error pattern
  const records = await DLQRecord.find({
    datasetId,
    errorAggregationKey,
    status: { $ne: "RESOLVED" }
  });

  const bulkFixGroupId = `bulk-fix-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`;
  const results = [];

  for (const record of records) {
    try {
      // Apply the fix
      const fixed = evalFixScript(fixScript, record.rawData);

      // Update record
      record.cleanedData = fixed;
      record.status = "AUTO_FIXED";
      record.bulkFixGroupId = bulkFixGroupId;
      record.autoFixAttempts += 1;
      record.autoFixSuccesses += 1;
      record.lastModifiedBy = appliedBy;

      record.resolutionHistory.push({
        action: "BULK_AUTO_FIX",
        fixApplied: errorAggregationKey,
        timestamp: new Date(),
        user: appliedBy,
        autoApplied: true
      });

      await record.save();
      results.push({ rowNumber: record.rowNumber, success: true });
    } catch (error) {
      record.autoFixAttempts += 1;
      await record.save();
      results.push({ rowNumber: record.rowNumber, success: false, error: error.message });
    }
  }

  return {
    bulkFixGroupId,
    totalAttempted: records.length,
    successful: results.filter(r => r.success).length,
    failed: results.filter(r => !r.success).length,
    details: results
  };
}

// ─────────────────────────────────────────────────────────────
// Execute Fix Script (Sandbox for safety)
// ─────────────────────────────────────────────────────────────
function evalFixScript(script, data) {
  // Simple implementation - in production, use vm2 or similar for safety
  try {
    // eslint-disable-next-line no-new-func
    const fixFn = new Function("data", `return (${script})(data);`);
    return fixFn(data);
  } catch (error) {
    throw new Error(`Fix script failed: ${error.message}`);
  }
}

// ─────────────────────────────────────────────────────────────
// Get Error Details for Manual Review
// ─────────────────────────────────────────────────────────────
async function getErrorsByAggregationKey(datasetId, errorAggregationKey, limit = 10) {
  return await DLQRecord.find({
    datasetId,
    errorAggregationKey,
    status: { $ne: "RESOLVED" }
  })
    .limit(limit)
    .exec();
}

// ─────────────────────────────────────────────────────────────
// Mark Error as Resolved/Ignored
// ─────────────────────────────────────────────────────────────
async function markAsResolved(recordId, status = "RESOLVED", notes = "") {
  return await DLQRecord.findByIdAndUpdate(
    recordId,
    {
      status,
      $push: {
        resolutionHistory: {
          action: status,
          timestamp: new Date(),
          details: { notes }
        }
      }
    },
    { new: true }
  );
}

module.exports = {
  createDLQRecord,
  getErrorPatterns,
  getErrorStatistics,
  bulkApplyFix,
  getErrorsByAggregationKey,
  markAsResolved,
  generateErrorFingerprint,
  determineErrorCategory,
  ERROR_TYPE_TO_FIX_MAP
};
