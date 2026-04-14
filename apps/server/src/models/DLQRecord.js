const mongoose = require("mongoose");

const { Schema } = mongoose;

// ─────────────────────────────────────────────────────────────
// Error Fingerprint: Groups similar errors for aggregation
// ─────────────────────────────────────────────────────────────
const ErrorFingerprintSchema = new Schema({
  hash: {
    type: String,
    // Hash of: errorType + field + categoricalFix
    // Allows grouping rows with identical errors
  },
  errorType: {
    type: String,
    // Examples: "TYPE_MISMATCH", "INVALID_FORMAT", "NULL_VIOLATION", "RANGE_VIOLATION", "DUPLICATE"
  },
  affectedField: {
    type: String,
  },
  categoricalFix: {
    type: String,
    enum: [
      "TYPE_CONVERSION",        // Convert string→number, date→string, etc.
      "FORMAT_NORMALIZATION",   // Fix date format, phone format, currency, etc.
      "TRIMMING_AND_CASING",    // Clean whitespace, uppercase/lowercase
      "NULL_SUBSTITUTION",      // Replace null/empty with default
      "RANGE_VALIDATION",       // Clamp to valid range
      "DEDUPLICATION",          // Remove duplicate entries
      "CATEGORICAL_MAPPING",    // Map values (Y/N → true/false, states → codes)
      "STRUCTURAL_FIX",         // Fix column misalignment, missing columns
      "DELIMITER_FIX",          // Fix CSV parsing (quoted fields, etc.)
      "UNKNOWN"
    ],
    default: "UNKNOWN"
  },
}, { _id: false });

// ─────────────────────────────────────────────────────────────
// Categorical Fix Template: Suggested fix for this error category
// ─────────────────────────────────────────────────────────────
const FixTemplateSchema = new Schema({
  fixId: String,              // Unique ID for this fix template
  category: String,           // TYPE_CONVERSION, FORMAT_NORMALIZATION, etc.
  description: String,        // "Convert string values to numbers"
  appliesTo: [String],        // Fields this fix can apply to
  automatable: Boolean,       // Can be auto-applied?
  confidence: Number,         // 0-100: how confident we are this will work
  exampleBefore: Schema.Types.Mixed,
  exampleAfter: Schema.Types.Mixed,
  script: String,             // Optional: JavaScript function to apply fix
}, { _id: false });

// ─────────────────────────────────────────────────────────────
// Error Pattern: Identifies rows with similar errors
// ─────────────────────────────────────────────────────────────
const ErrorPatternSchema = new Schema({
  patternId: String,
  errorFingerprint: String,   // Reference to ErrorFingerprint.hash
  totalAffectedRows: Number,
  sampleRows: [Number],       // Row numbers sharing this error (first 10)
  firstOccurrence: Date,
  lastOccurrence: Date,
  frequency: Number,          // How often this error occurs
}, { _id: false });

// ─────────────────────────────────────────────────────────────
// Main DLQ Schema: Enhanced with aggregation & categorical fixes
// ─────────────────────────────────────────────────────────────
const DLQRecordSchema = new Schema(
  {
    // ─── Basic Identification ───
    datasetId: {
      type: String,
      required: true,
      index: true
    },
    rowNumber: {
      type: Number,
      required: true
    },

    // ─── Data Storage ───
    rawData: {
      type: Schema.Types.Mixed,
      required: true
    },
    cleanedData: {
      type: Schema.Types.Mixed,
      default: null
    },

    // ─── Error Details (Individual Row Error) ───
    errorMessages: {
      type: [String],
      default: []
    },
    errorDetails: {
      type: [{
        field: String,
        errorType: String,      // TYPE_MISMATCH, INVALID_FORMAT, etc.
        message: String,
        value: Schema.Types.Mixed,
        expectedType: String,
        receivedType: String
      }],
      default: []
    },

    // ─── NEW: Error Fingerprint for Aggregation ───
    errorFingerprint: {
      type: ErrorFingerprintSchema,
      default: null
    },

    // ─── NEW: Categorical Error Classification ───
    errorCategory: {
      type: String,
      enum: [
        "structural",           // Column misalignment, missing columns
        "validation",           // Type mismatch, invalid format
        "data_quality",         // Nulls, duplicates, outliers
        "encoding",             // Character encoding issues
        "delimiter",            // CSV parsing issues
        "unknown"
      ],
      default: "unknown",
      index: true
    },

    // ─── NEW: Fix Template & Suggestions ───
    suggestedFix: {
      type: FixTemplateSchema,
      default: null
    },

    fixInstructions: {
      type: String,
      // Human-readable: "1. Convert string to number. 2. Validate against range 0-100"
    },

    // ─── Error Patterns & Aggregation ───
    errorPattern: {
      type: ErrorPatternSchema,
      default: null
    },

    affectedRowCount: {
      type: Number,
      default: 1
    },

    // ─── Severity & Resolution ───
    severity: {
      type: String,
      enum: ["low", "medium", "high", "critical"],
      default: "medium"
    },

    status: {
      type: String,
      enum: ["QUARANTINED", "AUTO_FIXED", "MANUAL_FIX_NEEDED", "RESOLVED", "IGNORED"],
      default: "QUARANTINED",
      index: true
    },

    // ─── Resolution History ───
    resolutionHistory: {
      type: [{
        action: String,
        fixApplied: String,
        timestamp: { type: Date, default: Date.now },
        user: { type: String, default: "system" },
        details: Schema.Types.Mixed,
        autoApplied: { type: Boolean, default: false }
      }],
      default: []
    },

    // ─── Tracking & Metrics ───
    attemptedRestores: {
      type: Number,
      default: 0
    },

    manualEdits: {
      type: Number,
      default: 0
    },

    autoFixAttempts: {
      type: Number,
      default: 0
    },

    autoFixSuccesses: {
      type: Number,
      default: 0
    },

    lastModifiedBy: {
      type: String,
      default: "system"
    },

    // ─── NEW: Bulk Fix Tracking ───
    bulkFixGroupId: {
      type: String,
      // If this row was fixed as part of a bulk fix operation, store the group ID
      index: true
    },

    // ─── NEW: Error Categories for Aggregation ───
    errorAggregationKey: {
      type: String,
      // Format: "datasetId|errorType|affectedField|categoricalFix"
      // Used to quickly find all rows with same error type
      index: true
    }
  },
  {
    timestamps: true
  }
);

// ─────────────────────────────────────────────────────────────
// INDEXES: Optimized for aggregation & bulk operations
// ─────────────────────────────────────────────────────────────

// Find specific row's error
DLQRecordSchema.index({ datasetId: 1, rowNumber: 1 }, { unique: true });

// List all DLQ records for a dataset (sorted by creation)
DLQRecordSchema.index({ datasetId: 1, createdAt: -1 });

// Text search on error messages
DLQRecordSchema.index({ errorMessages: "text" });

// Filter by status & severity
DLQRecordSchema.index({ status: 1, severity: 1, createdAt: -1 });

// Filter by error category (NEW)
DLQRecordSchema.index({ errorCategory: 1, createdAt: -1 });

// Aggregate errors by fingerprint (NEW) - GROUP errors
DLQRecordSchema.index({ "errorFingerprint.hash": 1, datasetId: 1 });

// Find all rows with same error pattern (NEW)
DLQRecordSchema.index({ errorAggregationKey: 1, datasetId: 1 });

// Find all rows in a bulk fix group (NEW)
DLQRecordSchema.index({ bulkFixGroupId: 1, datasetId: 1 });

// Query for auto-fixable errors (NEW)
DLQRecordSchema.index({ 
  datasetId: 1, 
  "suggestedFix.automatable": 1, 
  status: 1 
});

module.exports = mongoose.model("DLQRecord", DLQRecordSchema);
