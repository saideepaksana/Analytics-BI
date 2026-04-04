import React, { useState, useEffect, useCallback } from "react";
import { X, ChevronRight, ChevronLeft, BarChart3, Settings2 } from "lucide-react";
import DatasetExplorer from "./DatasetExplorer";
import ChartTypeSelector from "./ChartTypeSelector";
import DimensionMeasureSelector from "./DimensionMeasureSelector";
import { getDatasetMetadata } from "../../../services/datasets.service";
import "../styles/wizard.css";

export default function ChartWizard({ isOpen, onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [selectedChartType, setSelectedChartType] = useState("");
  const [availableColumns, setAvailableColumns] = useState([]);
  const [dimensions, setDimensions] = useState([]);
  const [measures, setMeasures] = useState([]);
  const [loadingSchema, setLoadingSchema] = useState(false);

  if (!isOpen) return null;

  const fetchSchema = useCallback(async (datasetId) => {
    setLoadingSchema(true);
    try {
      const data = await getDatasetMetadata(datasetId);
      const schema = data.schema || [];
      setAvailableColumns(schema);
      
      // Auto-categorize
      const initialMeasures = schema
        .filter(col => {
          const t = (col.type || "").toLowerCase();
          return t.includes("int") || t.includes("float") || t.includes("number") || t.includes("decimal");
        })
        .map(col => col.name);
      
      const initialDimensions = schema
        .filter(col => !initialMeasures.includes(col.name))
        .map(col => col.name)
        .slice(0, 2); // Pick first 2 as safety default

      setMeasures(initialMeasures);
      setDimensions(initialDimensions);
    } catch (err) {
      console.error("Failed to fetch dataset schema", err);
    } finally {
      setLoadingSchema(false);
    }
  }, []);

  const handleNext = () => {
    if (step === 1) {
      setStep(2);
    } else if (step === 2) {
      fetchSchema(selectedDatasetId);
      setStep(3);
    } else {
      // Finalize creation
      onComplete?.({
        datasetId: selectedDatasetId,
        type: selectedChartType,
        dimensions,
        measures,
        title: `New ${selectedChartType.charAt(0).toUpperCase() + selectedChartType.slice(1)} Chart`,
      });
      handleClose();
    }
  };

  const handleBack = () => {
    if (step > 1) setStep(step - 1);
  };

  const handleClose = () => {
    setStep(1);
    setSelectedDatasetId("");
    setSelectedChartType("");
    setDimensions([]);
    setMeasures([]);
    onClose();
  };

  const isNextDisabled = 
    (step === 1 && !selectedDatasetId) || 
    (step === 2 && !selectedChartType) ||
    (step === 3 && (dimensions.length === 0 && measures.length === 0));

  return (
    <div className="wizard-overlay">
      <div className="wizard-container">
        <header className="wizard-header">
          <h2>Create New Chart</h2>
          <button className="wizard-close-btn" onClick={handleClose}>
            <X size={20} />
          </button>
        </header>

        <nav className="wizard-progress">
          <div className={`wizard-step-pill ${step >= 1 ? "active" : ""} ${step > 1 ? "completed" : ""}`} />
          <div className={`wizard-step-pill ${step >= 2 ? "active" : ""} ${step > 2 ? "completed" : ""}`} />
          <div className={`wizard-step-pill ${step >= 3 ? "active" : ""}`} />
        </nav>

        <main className="wizard-content">
          <div className="wizard-step-info">
            <span className="step-number">Step {step} of 3</span>
            <h3>
              {step === 1 && "Select Data Source"}
              {step === 2 && "Choose Chart Type"}
              {step === 3 && "Assign Dimensions & Measures"}
            </h3>
          </div>

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
              <div className="loading-schema">Fetching dataset structure...</div>
            ) : (
              <DimensionMeasureSelector
                availableColumns={availableColumns}
                dimensions={dimensions}
                measures={measures}
                onMoveToDimension={(name) => {
                  setDimensions([...dimensions, name]);
                  setMeasures(measures.filter(m => m !== name));
                }}
                onMoveToMeasure={(name) => {
                  setMeasures([...measures, name]);
                  setDimensions(dimensions.filter(d => d !== name));
                }}
                onRemove={(name) => {
                  setDimensions(dimensions.filter(d => d !== name));
                  setMeasures(measures.filter(m => m !== name));
                }}
              />
            )
          )}
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
              disabled={isNextDisabled || loadingSchema}
            >
              {step === 3 ? "Create Chart" : "Next"}
              <ChevronRight size={18} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
