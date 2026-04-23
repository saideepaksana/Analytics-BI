/**
 * exportPayloadValidator.js
 * 
 * Validates the structured JSON payload for both Raw and Visual exports.
 * Ensures the chart context and frozen UI state are consistent.
 */

const validateRawExport = (payload) => {
    const { datasetId, format, context } = payload || {};

    if (!datasetId) throw new Error("datasetId is required.");
    if (!["csv", "excel", "xlsx"].includes(format?.toLowerCase())) {
        throw new Error("Invalid format. Supported: CSV, Excel.");
    }
    if (!context || typeof context !== "object") {
        throw new Error("Export context is required.");
    }

    const hasStructuredQuery = context.query && typeof context.query === "object";
    const hasLegacySelections =
        Array.isArray(context.selectedDimensions) ||
        Array.isArray(context.selectedMeasures);

    if (!hasStructuredQuery && !hasLegacySelections) {
        throw new Error("Export context must include a query or selected dimensions/measures.");
    }

    if (hasStructuredQuery) {
        if (context.query.dimensions !== undefined && !Array.isArray(context.query.dimensions)) {
            throw new Error("context.query.dimensions must be an array when provided.");
        }
        if (context.query.measures !== undefined && !Array.isArray(context.query.measures)) {
            throw new Error("context.query.measures must be an array when provided.");
        }
        if (context.query.filters !== undefined && !Array.isArray(context.query.filters)) {
            throw new Error("context.query.filters must be an array when provided.");
        }
    }

    if (hasLegacySelections) {
        const { selectedDimensions = [], selectedMeasures = [] } = context;
        if (!Array.isArray(selectedDimensions) || !Array.isArray(selectedMeasures)) {
            throw new Error("selectedDimensions and selectedMeasures must be arrays.");
        }
        if (selectedDimensions.length === 0 && selectedMeasures.length === 0 && !hasStructuredQuery) {
            throw new Error("Export must contain at least one dimension or measure.");
        }
    }

    if (context.dashboardFilters !== undefined) {
        const dashboardFiltersValid =
            Array.isArray(context.dashboardFilters) ||
            (context.dashboardFilters && typeof context.dashboardFilters === "object");

        if (!dashboardFiltersValid) {
            throw new Error("dashboardFilters must be an array or object when provided.");
        }
    }

    return true;
};

const validateVisualExport = (payload) => {
    const { dashboardId, format, frozenState } = payload || {};

    if (!dashboardId) throw new Error("dashboardId is required.");
    if (!["pdf", "png"].includes(format?.toLowerCase())) {
        throw new Error("Invalid format. Supported: PDF, PNG.");
    }
    if (!frozenState) throw new Error("frozenState is required for visual exports.");

    const { activeTab, annotations, dashboardName, filters, viewport, visibleSection } = frozenState;

    if (typeof dashboardName !== "string" || !dashboardName.trim()) {
        throw new Error("frozenState.dashboardName must be a non-empty string.");
    }

    if (!visibleSection || typeof visibleSection !== "object" || Array.isArray(visibleSection)) {
        throw new Error("frozenState.visibleSection must be an object.");
    }

    if (typeof visibleSection.id !== "string" && visibleSection.id !== null) {
        throw new Error("frozenState.visibleSection.id must be a string or null.");
    }

    if (!Array.isArray(visibleSection.widgets)) {
        throw new Error("frozenState.visibleSection.widgets must be an array.");
    }

    const filtersValid =
        Array.isArray(filters) ||
        (filters && typeof filters === "object");
    if (!filtersValid) {
        throw new Error("frozenState.filters must be an object or array.");
    }

    if (!Array.isArray(annotations)) {
        throw new Error("frozenState.annotations must be an array.");
    }

    if (typeof activeTab !== "string" && activeTab !== null) {
        throw new Error("frozenState.activeTab must be a string or null.");
    }

    if (viewport !== undefined) {
        if (!viewport || typeof viewport !== "object" || Array.isArray(viewport)) {
            throw new Error("frozenState.viewport must be an object when provided.");
        }

        const width = Number(viewport?.width);
        const height = Number(viewport?.height);

        if (!Number.isFinite(width) || width <= 0 || !Number.isFinite(height) || height <= 0) {
            throw new Error("frozenState.viewport.width and frozenState.viewport.height must be positive numbers.");
        }
    }

    return true;
};

module.exports = {
    validateRawExport,
    validateVisualExport,
};
