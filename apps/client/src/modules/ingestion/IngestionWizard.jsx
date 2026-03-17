import { useEffect, useMemo, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import FileUpload from "./FileUpload";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5001";

const createUploadId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const MODE_OPTIONS = [
  {
    value: "new",
    title: "Create New Dataset",
    description: "Start a brand new dataset for this upload."
  },
  {
    value: "append",
    title: "Append to Existing Data",
    description: "Add this data as new rows to an existing dataset."
  },
  {
    value: "replace",
    title: "Replace Existing Data",
    description: "Overwrite an existing dataset entirely with this upload."
  }
];

const prettyMode = (mode) => {
  if (mode === "append") return "Append";
  if (mode === "replace") return "Replace";
  return "New";
};

function IngestionWizard({ onCompleted }) {
  const [currentStep, setCurrentStep] = useState(1);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState("new");
  const [datasetId, setDatasetId] = useState("");
  const [uploadId, setUploadId] = useState("");
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState("idle");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const needsDatasetId = mode === "append" || mode === "replace";

  const canSubmit = useMemo(() => {
    if (!file || loading) {
      return false;
    }
    if (needsDatasetId && !datasetId.trim()) {
      return false;
    }
    return true;
  }, [file, loading, datasetId, needsDatasetId]);

  const canGoStep2 = Boolean(file) && !loading;
  const canGoStep3 = canGoStep2 && (!needsDatasetId || Boolean(datasetId.trim()));

  useEffect(() => {
    if (!file && currentStep > 1) {
      setCurrentStep(1);
      return;
    }

    if (!canGoStep3 && currentStep > 2) {
      setCurrentStep(2);
    }
  }, [file, currentStep, canGoStep3]);

  useEffect(() => {
    if (!uploadId) {
      return undefined;
    }

    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socket.emit("upload:subscribe", { uploadId });

    socket.on("upload:progress", (event) => {
      if (event.uploadId !== uploadId) {
        return;
      }
      setProgress(event.progress || 0);
      setStage(event.stage || "processing");
      if (event.stage === "failed") {
        setError(event.detail || "Upload failed");
      }
    });

    return () => {
      socket.disconnect();
    };
  }, [uploadId]);

  const handleUpload = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setProgress(2);
      setStage("starting");

      const generatedUploadId = createUploadId();
      setUploadId(generatedUploadId);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      formData.append("uploadId", generatedUploadId);
      if (datasetId.trim()) {
        formData.append("datasetId", datasetId.trim());
      }

      const response = await axios.post(`${API_BASE_URL}/upload`, formData);

      setProgress(100);
      setStage("done");
      setCurrentStep(3);
      onCompleted?.(response.data);
    } catch (uploadError) {
      console.error("Upload error details:", uploadError.response?.data || uploadError);
      setError(uploadError.response?.data?.message || uploadError.message || "Upload failed");
      setStage("failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="card wizard-card">
      <div className="wizard-head">
        <h2>Upload Data File</h2>
        <p>Step {currentStep} of 3</p>
      </div>

      <div className="wizard-steps" aria-label="Upload wizard progress">
        <button
          type="button"
          className={`step-pill ${currentStep === 1 ? "active" : ""}`}
          onClick={() => setCurrentStep(1)}
          disabled={loading}
        >
          1. Select File
        </button>
        <button
          type="button"
          className={`step-pill ${currentStep === 2 ? "active" : ""}`}
          onClick={() => canGoStep2 && setCurrentStep(2)}
          disabled={!canGoStep2 || loading}
        >
          2. Ingestion Mode
        </button>
        <button
          type="button"
          className={`step-pill ${currentStep === 3 ? "active" : ""}`}
          onClick={() => canGoStep3 && setCurrentStep(3)}
          disabled={!canGoStep3 || loading}
        >
          3. Confirm & Upload
        </button>
      </div>

      {currentStep === 1 ? (
        <>
          <FileUpload file={file} onFileSelected={setFile} disabled={loading} />

          <div className="wizard-actions">
            <button type="button" className="ghost-btn" disabled>
              Cancel
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => setCurrentStep(2)}
              disabled={!canGoStep2}
            >
              Next: Ingestion Mode
            </button>
          </div>
        </>
      ) : null}

      {currentStep === 2 ? (
        <>
          <div className="mode-grid">
            {MODE_OPTIONS.map((option) => (
              <label
                key={option.value}
                className={`mode-card ${mode === option.value ? "selected" : ""}`}
              >
                <input
                  type="radio"
                  name="ingestion-mode"
                  value={option.value}
                  checked={mode === option.value}
                  onChange={(event) => setMode(event.target.value)}
                  disabled={loading}
                />
                <div>
                  <strong>{option.title}</strong>
                  <p>{option.description}</p>
                </div>
              </label>
            ))}
          </div>

          {needsDatasetId ? (
            <div className="form-row">
              <label htmlFor="datasetId">Target Dataset ID</label>
              <input
                id="datasetId"
                type="text"
                value={datasetId}
                onChange={(event) => setDatasetId(event.target.value)}
                placeholder="Enter existing dataset ID"
                disabled={loading}
              />
            </div>
          ) : null}

          <div className="wizard-actions">
            <button type="button" className="ghost-btn" onClick={() => setCurrentStep(1)} disabled={loading}>
              Back
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => setCurrentStep(3)}
              disabled={!canGoStep3}
            >
              Next: Confirm Upload
            </button>
          </div>
        </>
      ) : null}

      {currentStep === 3 ? (
        <>
          <div className="confirm-card">
            <h3>Review Upload Details</h3>
            <p><strong>File:</strong> {file?.name || "Not selected"}</p>
            <p><strong>Mode:</strong> {prettyMode(mode)}</p>
            {needsDatasetId ? <p><strong>Dataset ID:</strong> {datasetId || "Not set"}</p> : null}
          </div>

          <div className="progress-wrap" aria-live="polite">
            <div className="progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <p className="progress-text">Progress: {progress}% ({stage})</p>

          {error ? <p className="error-text">{error}</p> : null}

          <div className="wizard-actions">
            <button type="button" className="ghost-btn" onClick={() => setCurrentStep(2)} disabled={loading}>
              Back
            </button>
            <button type="button" className="primary-btn" onClick={handleUpload} disabled={!canSubmit}>
              {loading ? "Uploading..." : "Upload and Process"}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

export default IngestionWizard;
