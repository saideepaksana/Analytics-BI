import React, { useState } from "react";
import { X, ChevronRight, ChevronLeft, BarChart3, Settings2 } from "lucide-react";
import DatasetExplorer from "./DatasetExplorer";
import "../styles/wizard.css";

export default function ChartWizard({ isOpen, onClose, onComplete }) {
  const [step, setStep] = useState(1);
  const [selectedDatasetId, setSelectedDatasetId] = useState("");

  if (!isOpen) return null;

  const handleNext = () => {
    if (step < 2) setStep(step + 1);
    else {
      // Finalize creation (placeholder for now)
      onComplete?.({
        datasetId: selectedDatasetId,
        title: "New Chart (Configured)",
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
    onClose();
  };

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
          <div className={`wizard-step-pill ${step >= 2 ? "active" : ""}`} />
        </nav>

        <main className="wizard-content">
          {step === 1 && (
            <DatasetExplorer
              selectedId={selectedDatasetId}
              onSelect={setSelectedDatasetId}
            />
          )}

          {step === 2 && (
            <div className="wizard-placeholder">
              <div className="wizard-placeholder-icon">
                <Settings2 size={64} strokeWidth={1.5} />
              </div>
              <h3>Step 2: Configure Chart</h3>
              <p>
                Visualizing data for dataset: <strong className="mono">{selectedDatasetId}</strong>
              </p>
              <div className="alert-info" style={{ marginTop: "24px", padding: "16px", borderRadius: "12px", background: "rgba(59, 130, 246, 0.1)", color: "#60a5fa", fontSize: "0.9rem" }}>
                Chart configuration UI (AXIS, SERIES, COLORS) is coming soon.
              </div>
            </div>
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
              disabled={step === 1 && !selectedDatasetId}
            >
              {step === 2 ? "Create Chart" : "Next"}
              <ChevronRight size={18} />
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
