/**
 * exportPayloadValidator.js
 * 
 * Validates the structured JSON payload for both Raw and Visual exports.
 * Ensures the chart context and frozen UI state are consistent.
 */

const validateRawExport = (payload) => {
    const { datasetId, format, context } = payload;

    if (!datasetId) throw new Error("datasetId is required.");
    if (!["csv", "excel", "xlsx"].includes(format?.toLowerCase())) {
        throw new Error("Invalid format. Supported: CSV, Excel.");
    }
    if (!context) throw new Error("Export context is required.");

    const { selectedDimensions, selectedMeasures } = context;
    if (!Array.isArray(selectedDimensions) || !Array.isArray(selectedMeasures)) {
        throw new Error("selectedDimensions and selectedMeasures must be arrays.");
    }

    // Basic check: Must have at least one dimension and one measure to be meaningful
    if (selectedDimensions.length === 0 && selectedMeasures.length === 0) {
        throw new Error("Export must contain at least one dimension or measure.");
    }

    return true;
};

const validateVisualExport = (payload) => {
    const { dashboardId, format, frozenState } = payload;

    if (!dashboardId) throw new Error("dashboardId is required.");
    if (!["pdf", "png"].includes(format?.toLowerCase())) {
        throw new Error("Invalid format. Supported: PDF, PNG.");
    }
    if (!frozenState) throw new Error("frozenState is required for visual exports.");

    const { activeTab, viewport } = frozenState;
    if (typeof activeTab !== "string" && activeTab !== null) {
        throw new Error("activeTab must be a string or null.");
    }

    return true;
};

module.exports = {
    validateRawExport,
    validateVisualExport,
};
