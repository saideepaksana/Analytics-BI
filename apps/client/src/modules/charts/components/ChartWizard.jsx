import React, { useState, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, Loader2, Sparkles } from "lucide-react";
import DatasetExplorer from "./DatasetExplorer";
import ChartTypeSelector from "./ChartTypeSelector";
import DimensionMeasureSelector from "./DimensionMeasureSelector";
import ChartPreview from "./ChartPreview";
import { getDatasetMetadata } from "../../../services/datasets.service";
import { queryDataset, saveChartData } from "../../../services/charts.service";
import "../styles/wizard.css";

export default function ChartWizard({ isOpen, onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [selectedChartType, setSelectedChartType] = useState("bar");
  const [availableColumns, setAvailableColumns] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [measures, setMeasures] = useState([]);
  const [loadingSchema, setLoadingSchema] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewData, setPreviewData] = useState([]);
  const [error, setError] = useState(null);

  const fetchSchema = useCallback(async (datasetId) => {
    setLoadingSchema(true);
    setError(null);
    try {
      const data = await getDatasetMetadata(datasetId);
      const schema = data.schema || [];
      setAvailableColumns(schema);

      const numericTypes = schema
        .filter(col => {
          const t = (col.type || "").toLowerCase();
          return t.includes("int") || t.includes("float") || t.includes("number") || t.includes("decimal");
        })
        .map(col => col.name);

      const nonNumericTypes = schema
        .filter(col => !numericTypes.includes(col.name))
        .map(col => col.name)
        .slice(0, 1);

      setMeasures(numericTypes.slice(0, 1));
      setDimensions(nonNumericTypes);
    } catch (err) {
      setError("Failed to fetch dataset schema");
      console.error(err);
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  const fetchPreview = useCallback(async () => {
    setLoadingPreview(true);
    setError(null);
    try {
      let query;
      if (selectedChartType === "scatter") {
        // Scatter needs raw rows, not aggregated data
        query = {
          dimensions: dimensions.map(d => ({ field: d })),
          measures: measures.map(m => ({ field: m })),
          groupBy: [],
          orderBy: [],
          raw: true
        };
      } else {
        query = {
          dimensions,
          measures: measures.map(m => ({ field: m, aggregation: "SUM" })),
          groupBy: dimensions,
          orderBy: measures.length > 0 ? [{ field: measures[0], direction: "desc" }] : []
        };
      }
      const response = await queryDataset(selectedDatasetId, query);
      setPreviewData(response.results || []);
    } catch (err) {
      setError("Failed to generate chart preview data");
      console.error(err);
    } finally {
      setLoadingPreview(false);
    }
  }, [selectedDatasetId, selectedChartType, dimensions, measures]);

  const handleCreateChart = useCallback(async () => {
    try {
      const chartPayload = {
        name: `New ${selectedChartType.charAt(0).toUpperCase() + selectedChartType.slice(1)} Chart`,
        dataSource: {
          datasetId: selectedDatasetId,
          table: "cleaned_records"
        },
        query: {
          dimensions: dimensions.map(d => ({ field: d, type: "categorical" })),
          measures: measures.map(m => ({ field: m, aggregation: "SUM" })),
          groupBy: dimensions,
          orderBy: measures.length > 0 ? [{ field: measures[0], direction: "desc" }] : []
        },
        visualization: {
          type: selectedChartType,
          xAxis: dimensions[0],
          yAxis: measures[0],
          series: { stack: false, grouped: true }
        },
        style: {
          colorPalette: ["#6366f1", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6"],
          showLegend: true,
          showGrid: true
        }
      };

      const newChart = await saveChartData(chartPayload);
      onComplete?.(newChart);
      // Reset state
      setStep(1);
      setSelectedDatasetId("");
      setSelectedChartType("bar");
      setDimensions([]);
      setMeasures([]);
      setError(null);
      onClose();
    } catch (err) {
      setError("Failed to save chart");
      console.error(err);
    }
  }, [selectedDatasetId, selectedChartType, dimensions, measures, onComplete, onClose]);

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      fetchSchema(selectedDatasetId);
      setStep(3);
    } else if (step === 3) {
      fetchPreview();
      setStep(4);
    } else {
      handleCreateChart();
    }
  };

  const handleBack = () => {
    if (step > 1) {
      setError(null);
      setStep(step - 1);
    }
  };

  const handleClose = () => {
    setStep(1);
    setSelectedDatasetId("");
    setSelectedChartType("bar");
    setDimensions([]);
    setMeasures([]);
    setError(null);
    onClose();
  };

  // --- Validation ---
  const CHART_CONSTRAINTS = {
    bar:     { minDim: 1, maxDim: null, minMeas: 1, maxMeas: null, label: "Bar Chart" },
    line:    { minDim: 1, maxDim: null, minMeas: 1, maxMeas: null, label: "Line Chart" },
    area:    { minDim: 1, maxDim: null, minMeas: 1, maxMeas: null, label: "Area Chart" },
    pie:     { minDim: 1, maxDim: 1,    minMeas: 1, maxMeas: 1,    label: "Pie Chart" },
    scatter: { minDim: 0, maxDim: null, minMeas: 2, maxMeas: 2,    label: "Scatter Plot" },
    kpi:     { minDim: 0, maxDim: 1,    minMeas: 1, maxMeas: 1,    label: "KPI Summary Card" },
    table:   { minDim: 0, maxDim: null, minMeas: 0, maxMeas: null, label: "Data Table" },
  };

  const c = CHART_CONSTRAINTS[selectedChartType];
  let validationError = null;
  if (step === 3 && c) {
    if (selectedChartType === "table" && dimensions.length === 0 && measures.length === 0) {
      validationError = "Add at least one dimension or measure for the Data Table.";
    } else if (c.maxDim !== null && dimensions.length > c.maxDim) {
      validationError = `${c.label} supports at most ${c.maxDim} dimension — remove ${dimensions.length - c.maxDim}.`;
    } else if (c.maxMeas !== null && measures.length > c.maxMeas) {
      validationError = `${c.label} supports at most ${c.maxMeas} measure(s) — remove ${measures.length - c.maxMeas}.`;
    } else if (c.minDim > 0 && dimensions.length < c.minDim) {
      validationError = `Add ${c.minDim - dimensions.length} more dimension(s) for ${c.label}.`;
    } else if (c.minMeas > 0 && measures.length < c.minMeas) {
      validationError = `Add ${c.minMeas - measures.length} more measure(s) for ${c.label}.`;
    }
  }

  const isNextDisabled =
    (step === 1 && !selectedDatasetId) ||
    (step === 2 && !selectedChartType) ||
    (step === 3 && !!validationError);

  // --- Early return AFTER all hooks ---
  if (!isOpen) return null;

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <header className="wizard-header">
          <div className="header-title">
            <Sparkles size={24} className="accent-icon" />
            <h2>Create New Chart</h2>
          </div>
          <button className="wizard-close-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </header>

        <nav className="wizard-progress">
          {[1, 2, 3, 4].map(s => (
            <div
              key={s}
              className={`wizard-step-pill ${step >= s ? "active" : ""} ${step > s ? "completed" : ""}`}
            />
          ))}
        </nav>

        <main className="wizard-content">
          <div className="wizard-step-info">
            <span className="step-number">Step {step} of 4</span>
            <h3>
              {step === 1 && "Select Data Source"}
              {step === 2 && "Choose Chart Type"}
              {step === 3 && (validationError ? <span className="validation-text">{validationError}</span> : "Assign Dimensions & Measures")}
              {step === 4 && "Live Chart Preview"}
            </h3>
            {error && <div className="wizard-error">{error}</div>}
          </div>

          <div className="step-content-box">
            {step === 1 && (
              <DatasetExplorer
                selectedId={selectedDatasetId}
                onSelect={setSelectedDatasetId}
              />
            )}

            {step === 2 && (
              <ChartTypeSelector
                selectedType={selectedChartType}
                onSelect={setSelectedChartType}
              />
            )}

            {step === 3 && (
              loadingSchema ? (
                <div className="loading-stage">
                  <Loader2 className="spinner" size={40} />
                  <p>Analyzing dataset structure...</p>
                </div>
              ) : (
                <DimensionMeasureSelector
                  availableColumns={availableColumns}
                  dimensions={dimensions}
                  measures={measures}
                  chartType={selectedChartType}
                  validationError={validationError}
                  onMoveToDimension={(name) => {
                    setDimensions(prev => [...prev, name]);
                    setMeasures(prev => prev.filter(m => m !== name));
                  }}
                  onMoveToMeasure={(name) => {
                    setMeasures(prev => [...prev, name]);
                    setDimensions(prev => prev.filter(d => d !== name));
                  }}
                  onRemove={(name) => {
                    setDimensions(prev => prev.filter(d => d !== name));
                    setMeasures(prev => prev.filter(m => m !== name));
                  }}
                />
              )
            )}

            {step === 4 && (
              loadingPreview ? (
                <div className="loading-stage">
                  <Loader2 className="spinner" size={40} />
                  <p>Rendering visualization...</p>
                </div>
              ) : (
                <ChartPreview
                  type={selectedChartType}
                  data={previewData}
                  dimensions={dimensions}
                  measures={measures.map(m => ({ field: m }))}
                     title={chartName}
                />
              )
            )}
          </div>
        </main>

        <footer className="wizard-footer">
          <button
            className="wizard-footer-btn secondary"
            onClick={handleBack}
            disabled={step === 1}
          >
            <ChevronLeft size={18} />
            Back
          </button>

          <div style={{ display: "flex", gap: "12px" }}>
            <button className="wizard-footer-btn secondary" onClick={handleClose}>
              Cancel
            </button>
            <button
              className="wizard-footer-btn primary"
              onClick={handleNext}
              disabled={isNextDisabled || loadingSchema || loadingPreview}
            >
              {step === 4 ? (
                <>Save Chart <Sparkles size={16} /></>
              ) : (
                <>Next <ChevronRight size={18} /></>
              )}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
