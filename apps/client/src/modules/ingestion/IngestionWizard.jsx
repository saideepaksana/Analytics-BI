import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import FileUpload from "./FileUpload";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000/api";
const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || "http://localhost:5000";

const createUploadId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // keep in sync with backend multer limit

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

const getAxiosErrorMessage = (err) => {
  if (!err) return "Upload failed";
  if (axios.isCancel?.(err)) return "Upload cancelled";
  return err.response?.data?.message || err.message || "Upload failed";
};

const getAppendMismatchDetails = (payload = {}) => ({
  expectedCount: payload.expectedCount ?? "-",
  receivedCount: payload.receivedCount ?? "-",
  missingColumns: Array.isArray(payload.missingColumns) ? payload.missingColumns : [],
  unexpectedColumns: Array.isArray(payload.unexpectedColumns) ? payload.unexpectedColumns : []
});

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
  const [appendMismatchDetails, setAppendMismatchDetails] = useState(null);
  const cancelSourceRef = useRef(null);
  const socketRef = useRef(null);

  const needsDatasetId = mode === "append" || mode === "replace";

  const canSubmit = useMemo(() => {
    if (!file || loading) {
      return false;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
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
    if (mode === "new" && datasetId) {
      setDatasetId("");
    }
  }, [mode, datasetId]);

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!file && currentStep > 1) {
      setCurrentStep(1);
      return;
    }

    if (!canGoStep3 && currentStep > 2) {
      setCurrentStep(2);
    }
  }, [file, currentStep, canGoStep3, loading]);

  useEffect(() => {
    setError("");
    setProgress(0);
    setStage("idle");
    setUploadId("");
    setAppendMismatchDetails(null);
    cancelSourceRef.current?.cancel?.("Upload superseded");
    cancelSourceRef.current = null;
    socketRef.current?.disconnect?.();
    socketRef.current = null;
  }, [file]);

  useEffect(() => () => cancelSourceRef.current?.cancel?.("Component unmounted"), []);

  useEffect(() => {
    if (!uploadId) {
      return undefined;
    }

    const socket = io(SOCKET_URL, { transports: ["websocket"] });
    socketRef.current = socket;
    socket.emit("upload:subscribe", { uploadId });

    socket.on("upload:progress", (event) => {
      if (!event || event.uploadId !== uploadId) {
        return;
      }

      if (typeof event.progress === "number") {
        setProgress((prev) => Math.max(prev, Math.min(100, event.progress)));
      }
      if (event.stage) {
        setStage(event.stage);
      }
      if (event.stage === "failed") {
        setError(event.detail || "Upload failed");
      }
    });

    return () => {
      socket.emit("upload:unsubscribe", { uploadId });
      socket.disconnect();
      if (socketRef.current === socket) {
        socketRef.current = null;
      }
    };
  }, [uploadId]);

  const handleUpload = async () => {
    if (!canSubmit) {
      return;
    }

    try {
      setLoading(true);
      setError("");
      setAppendMismatchDetails(null);
      setProgress(0);
      setStage("uploading");

      const generatedUploadId = createUploadId();
      setUploadId(generatedUploadId);

      const formData = new FormData();
      formData.append("file", file);
      formData.append("mode", mode);
      formData.append("uploadId", generatedUploadId);
      if (datasetId.trim()) {
        formData.append("datasetId", datasetId.trim());
      }

      const cancelSource = axios.CancelToken?.source?.();
      cancelSourceRef.current = cancelSource;

      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        cancelToken: cancelSource?.token,
        onUploadProgress: (event) => {
          if (!event.total) return;
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          setProgress(percent);
        },
      });

      setProgress(100);
      setStage("done");
      setCurrentStep(3);
      onCompleted?.(response.data);
    } catch (uploadError) {
      console.error("Upload error details:", uploadError.response?.data || uploadError);
      const errorPayload = uploadError.response?.data;
      if (errorPayload?.code === "APPEND_SCHEMA_MISMATCH") {
        setAppendMismatchDetails(getAppendMismatchDetails(errorPayload));
      }
      setError(getAxiosErrorMessage(uploadError));
      setStage("failed");
    } finally {
      setLoading(false);
      cancelSourceRef.current = null;
    }
  };

  const handleCancel = () => {
    cancelSourceRef.current?.cancel?.("User cancelled");
    cancelSourceRef.current = null;
    socketRef.current?.disconnect?.();
    socketRef.current = null;
    setLoading(false);
    setStage("idle");
    setProgress(0);
    setError("");
    setUploadId("");
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
          <FileUpload
            file={file}
            onFileSelected={(nextFile) => {
              setFile(nextFile);
              setError("");
            }}
            disabled={loading}
            maxSizeBytes={MAX_FILE_SIZE_BYTES}
            onValidationError={setError}
          />

          <div className="wizard-actions">
            <button type="button" className="ghost-btn" onClick={() => setFile(null)} disabled={loading || !file}>
              Clear
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
            {loading ? (
              <button type="button" className="ghost-btn" onClick={handleCancel}>
                Cancel Upload
              </button>
            ) : null}
            <button type="button" className="primary-btn" onClick={handleUpload} disabled={!canSubmit}>
              {loading ? "Uploading..." : "Upload"}
            </button>
          </div>
        </>
      ) : null}

      {appendMismatchDetails ? (
        <div className="ingestion-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="append-mismatch-title">
          <div className="ingestion-modal-card">
            <button
              type="button"
              className="ingestion-modal-close"
              aria-label="Close"
              onClick={() => setAppendMismatchDetails(null)}
            >
              x
            </button>
            <h3 id="append-mismatch-title">Append Blocked: Column Mismatch</h3>
            <p>
              The uploaded file does not match the selected dataset schema, so append has been stopped.
            </p>

            <div className="append-mismatch-meta">
              <p><strong>Expected columns:</strong> {appendMismatchDetails.expectedCount}</p>
              <p><strong>Uploaded columns:</strong> {appendMismatchDetails.receivedCount}</p>
            </div>

            {appendMismatchDetails.missingColumns.length ? (
              <div className="append-mismatch-list">
                <strong>Missing columns</strong>
                <p>{appendMismatchDetails.missingColumns.join(", ")}</p>
              </div>
            ) : null}

            {appendMismatchDetails.unexpectedColumns.length ? (
              <div className="append-mismatch-list">
                <strong>Unexpected columns</strong>
                <p>{appendMismatchDetails.unexpectedColumns.join(", ")}</p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}

export default IngestionWizard;