import { useRef } from "react";

function FileUpload({ file, onFileSelected, disabled }) {
  const inputRef = useRef(null);

  const handleDrop = (event) => {
    event.preventDefault();
    if (disabled) {
      return;
    }
    const droppedFile = event.dataTransfer.files?.[0];
    if (droppedFile) {
      onFileSelected(droppedFile);
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
        accept=".csv,.xlsx,.xls"
        onChange={(event) => onFileSelected(event.target.files?.[0] || null)}
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
        <p className="dropzone-subtitle">Only .csv or .xlsx files are allowed.</p>
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
