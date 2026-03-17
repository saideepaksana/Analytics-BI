import { useMemo, useRef } from "react";

const ALLOWED_EXTENSIONS = [".csv", ".xls", ".xlsx"];

function FileUpload({ file, onFileSelected, disabled, maxSizeBytes, onValidationError }) {
  const inputRef = useRef(null);

  const accept = useMemo(() => ALLOWED_EXTENSIONS.join(","), []);

  const validateAndSet = (candidate) => {
    if (!candidate) {
      onFileSelected(null);
      return;
    }

    const lowerName = candidate.name.toLowerCase();
    const ext = lowerName.includes(".") ? `.${lowerName.split(".").pop()}` : "";

    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      onValidationError?.("Invalid file type. Please upload a CSV or Excel file (.csv, .xls, .xlsx).");
      onFileSelected(null);
      return;
    }

    if (maxSizeBytes && candidate.size > maxSizeBytes) {
      const maxMB = Math.round((maxSizeBytes / (1024 * 1024)) * 10) / 10;
      onValidationError?.(`File too large. Max size is ${maxMB}MB.`);
      onFileSelected(null);
      return;
    }

    onValidationError?.("");
    onFileSelected(candidate);
  };

  const handleDrop = (event) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      validateAndSet(droppedFile);
    }
  };

  const handleDragOver = (event) => {
    event.preventDefault();
  };

  return (
    <div className="upload-block">
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={(event) => validateAndSet(event.target.files?.[0] || null)}
        style={{ display: "none" }}
        disabled={disabled}
      />
      <div
        className={`dropzone ${disabled ? "dropzone-disabled" : ""}`}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onClick={() => !disabled && inputRef.current?.click()}
      >
        <div className="upload-icon" aria-hidden="true">↑</div>
        <p className="dropzone-title">Drag and drop your CSV or Excel file here</p>
        <p className="dropzone-subtitle">Accepted: .csv, .xls, .xlsx</p>
        <button
          type="button"
          className="browse-btn"
          onClick={(event) => {
            event.stopPropagation();
            if (!disabled) {
              inputRef.current?.click();
            }
          }}
          disabled={disabled}
        >
          Browse Files
        </button>
      </div>

      {file ? (
        <p className="file-name">
          Selected: <strong>{file.name}</strong>
        </p>
      ) : null}
    </div>
  );
}

export default FileUpload;
