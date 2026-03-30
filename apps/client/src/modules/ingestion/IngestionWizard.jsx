import { useEffect, useMemo, useRef, useState } from "react";
import axios from "axios";
import { io } from "socket.io-client";
import FileUpload from "./FileUpload";
import DatasetPickerModal from "./components/DatasetPickerModal";
import { SOCKET_URL } from "../../core/config/env";
import { getRequestErrorMessage } from "../../core/http/apiClient";
import { formatDateTime } from "../../core/utils/formatters";
import { listDatasets } from "../../services/datasets.service";
import { uploadDatasetFile } from "../../services/upload.service";
import { createUploadId, MAX_FILE_SIZE_BYTES, MODE_OPTIONS, prettyMode } from "./constants";

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
  const [hasUploadStarted, setHasUploadStarted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [appendMismatchDetails, setAppendMismatchDetails] = useState(null);
  const [isDatasetPickerOpen, setIsDatasetPickerOpen] = useState(false);
  const [datasetsLoading, setDatasetsLoading] = useState(false);
  const [datasetsError, setDatasetsError] = useState("");
  const [availableDatasets, setAvailableDatasets] = useState([]);
  const [relatedDatasets, setRelatedDatasets] = useState([]);
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
  const shouldShowProgress = currentStep === 4 && hasUploadStarted && stage !== "idle";

  const resetProgressState = () => {
    setHasUploadStarted(false);
    setProgress(0);
    setStage("idle");
    setUploadId("");
  };

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
    resetProgressState();
    setAppendMismatchDetails(null);
    cancelSourceRef.current?.cancel?.("Upload superseded");
    cancelSourceRef.current = null;
    socketRef.current?.disconnect?.();
    socketRef.current = null;
  }, [file]);

  useEffect(() => () => cancelSourceRef.current?.cancel?.("Component unmounted"), []);

  useEffect(() => {
    if (currentStep === 3 && availableDatasets.length === 0 && !datasetsLoading) {
      setDatasetsLoading(true);
      setDatasetsError("");
      listDatasets()
        .then((data) => {
          if (needsDatasetId && datasetId) {
            setAvailableDatasets(data.filter(d => d.datasetId !== datasetId));
          } else {
            setAvailableDatasets(data);
          }
        })
        .catch((err) => setDatasetsError(getRequestErrorMessage(err, "Failed to load datasets for linking")))
        .finally(() => setDatasetsLoading(false));
    }
  }, [currentStep, availableDatasets.length, needsDatasetId, datasetId, datasetsLoading]);

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
      setHasUploadStarted(true);
      setProgress(0);
      setStage("uploading");

      const generatedUploadId = createUploadId();
      setUploadId(generatedUploadId);

      const cancelSource = axios.CancelToken?.source?.();
      cancelSourceRef.current = cancelSource;

      const response = await uploadDatasetFile({
        file,
        mode,
        uploadId: generatedUploadId,
        datasetId,
        relatedDatasets,
        cancelToken: cancelSource?.token,
        onUploadProgress: (event) => {
          if (!event.total) return;
          const percent = Math.min(99, Math.round((event.loaded / event.total) * 100));
          setProgress(percent);
        },
      });

      setProgress(100);
      setStage("done");
      setCurrentStep(4);
      onCompleted?.(response);
    } catch (uploadError) {
      console.error("Upload error details:", uploadError.response?.data || uploadError);
      const errorPayload = uploadError.response?.data;
      if (errorPayload?.code === "APPEND_SCHEMA_MISMATCH") {
        setAppendMismatchDetails(getAppendMismatchDetails(errorPayload));
      }
      setError(getRequestErrorMessage(uploadError, "Upload failed"));
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
    resetProgressState();
    setError("");
  };

  const openDatasetPicker = async () => {
    setIsDatasetPickerOpen(true);
    setDatasetsLoading(true);
    setDatasetsError("");

    try {
      const datasets = await listDatasets();
      setAvailableDatasets(datasets);
    } catch (fetchError) {
      setDatasetsError(getRequestErrorMessage(fetchError, "Failed to load datasets"));
    } finally {
      setDatasetsLoading(false);
    }
  };

  const handleSelectDataset = (selectedDatasetId) => {
    setDatasetId(selectedDatasetId);
    setIsDatasetPickerOpen(false);
  };

  return (
    <section className="card wizard-card">
      <div className="wizard-head">
        <h2>Upload Data File</h2>
        <p>Step {currentStep} of 4</p>
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
          3. Dataset Linking
        </button>
        <button
          type="button"
          className={`step-pill ${currentStep === 4 ? "active" : ""}`}
          onClick={() => canGoStep3 && setCurrentStep(4)}
          disabled={!canGoStep3 || loading}
        >
          4. Confirm & Upload
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
              <label>Target Dataset</label>
              <div className="dataset-picker-row">
                <button
                  type="button"
                  className="ghost-btn"
                  onClick={openDatasetPicker}
                  disabled={loading}
                >
                  Choose Existing Dataset
                </button>
                <span className={datasetId ? "mono dataset-picker-value" : "muted dataset-picker-value"}>
                  {datasetId || "No dataset selected"}
                </span>
              </div>
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
              Next: Dataset Linking
            </button>
          </div>
        </>
      ) : null}

      {currentStep === 3 ? (
        <>
          <div className="mode-grid" style={{ display: 'block' }}>
            <h3>Link Relationships (Optional)</h3>
            <p className="muted" style={{ marginBottom: "1rem" }}>
              Select existing datasets to auto-detect joins with this upload. 
              Skipping this will improve import speed for large files.
            </p>
            {datasetsLoading ? <p>Loading available datasets...</p> : null}
            {datasetsError ? <p className="error-text">{datasetsError}</p> : null}
            {!datasetsLoading && !datasetsError && availableDatasets.length === 0 ? (
               <p>No other datasets available to link.</p>
            ) : null}
            {!datasetsLoading && availableDatasets.length > 0 ? (
               <div className="dataset-picker-list" style={{ maxHeight: "300px", overflowY: "auto" }}>
                   {availableDatasets.map((dataset) => {
                       const isSelected = relatedDatasets.includes(dataset.datasetId);
                       return (
                           <button
                             key={dataset.datasetId}
                             type="button"
                             className={`dataset-picker-item ${isSelected ? "active" : ""}`}
                             onClick={() => {
                                 if (isSelected) {
                                     setRelatedDatasets(relatedDatasets.filter(id => id !== dataset.datasetId));
                                 } else {
                                     setRelatedDatasets([...relatedDatasets, dataset.datasetId]);
                                 }
                             }}
                             disabled={loading}
                             style={{ textAlign: "left" }}
                           >
                             <div className="dataset-picker-item-head">
                               <strong className="mono">{dataset.datasetId}</strong>
                               <span className="dataset-picker-item-mode">
                                  {isSelected ? "Selected" : "Select"}
                               </span>
                             </div>
                             <p>{dataset.fileName || "-"}</p>
                           </button>
                       );
                   })}
               </div>
            ) : null}
          </div>
          <div className="wizard-actions">
            <button type="button" className="ghost-btn" onClick={() => setCurrentStep(2)} disabled={loading}>
              Back
            </button>
            <button
              type="button"
              className="primary-btn"
              onClick={() => {
                resetProgressState();
                setCurrentStep(4);
              }}
              disabled={loading}
            >
              Next: Confirm Upload
            </button>
          </div>
        </>
      ) : null}

      {currentStep === 4 ? (
        <>
          <div className="confirm-card">
            <h3>Review Upload Details</h3>
            <p><strong>File:</strong> {file?.name || "Not selected"}</p>
            <p><strong>Mode:</strong> {prettyMode(mode)}</p>
            {needsDatasetId ? <p><strong>Dataset ID:</strong> {datasetId || "Not set"}</p> : null}
          </div>

          {shouldShowProgress ? (
            <>
              <div className="progress-wrap" aria-live="polite">
                <div className="progress-bar" style={{ width: `${progress}%` }} />
              </div>
              <p className="progress-text">Progress: {progress}% ({stage})</p>
            </>
          ) : null}

          {error ? <p className="error-text">{error}</p> : null}

          <div className="wizard-actions">
            <button
              type="button"
              className="ghost-btn"
              onClick={() => {
                resetProgressState();
                setCurrentStep(3);
              }}
              disabled={loading}
            >
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

      <DatasetPickerModal
        isOpen={isDatasetPickerOpen}
        modeLabel={prettyMode(mode)}
        loading={datasetsLoading}
        error={datasetsError}
        datasets={availableDatasets}
        selectedDatasetId={datasetId}
        onSelect={handleSelectDataset}
        onClose={() => setIsDatasetPickerOpen(false)}
        formatDate={formatDateTime}
      />
    </section>
  );
}

export default IngestionWizard;