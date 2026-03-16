import { useState, useRef } from 'react';
import { UploadCloud, FileText, X } from 'lucide-react';

const ACCEPTED_TYPES = ['.csv', '.xlsx', '.xls'];
const MAX_SIZE_MB = 50;

/**
 * FileUpload – Drag-and-drop (and click-to-browse) file selection component.
 *
 * Props:
 *   onFileSelected(file)  – called when a valid file is chosen
 *   disabled              – disables interactions while uploading
 */
const FileUpload = ({ onFileSelected, disabled = false }) => {
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const validate = (file) => {
    if (!file) return 'No file selected.';
    const ext = '.' + file.name.split('.').pop().toLowerCase();
    if (!ACCEPTED_TYPES.includes(ext)) {
      return `Unsupported file type "${ext}". Accepted: ${ACCEPTED_TYPES.join(', ')}.`;
    }
    if (file.size > MAX_SIZE_MB * 1024 * 1024) {
      return `File exceeds ${MAX_SIZE_MB} MB limit.`;
    }
    return null;
  };

  const handleFile = (file) => {
    const err = validate(file);
    if (err) {
      setError(err);
      setSelectedFile(null);
      return;
    }
    setError('');
    setSelectedFile(file);
    onFileSelected(file);
  };

  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (disabled) return;
    const file = e.dataTransfer.files[0];
    handleFile(file);
  };

  const onInputChange = (e) => {
    const file = e.target.files[0];
    if (file) handleFile(file);
  };

  const clearFile = (e) => {
    e.stopPropagation();
    setSelectedFile(null);
    setError('');
    onFileSelected(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div
      className={`file-upload-zone${dragOver ? ' drag-over' : ''}${disabled ? ' disabled' : ''}`}
      onDragOver={(e) => { e.preventDefault(); if (!disabled) setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
      onClick={() => { if (!disabled) inputRef.current?.click(); }}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' && !disabled) inputRef.current?.click(); }}
      aria-label="Upload file"
    >
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_TYPES.join(',')}
        style={{ display: 'none' }}
        onChange={onInputChange}
        disabled={disabled}
      />

      {selectedFile ? (
        <div className="file-upload-selected">
          <FileText size={32} className="file-upload-icon selected" />
          <div className="file-upload-name">{selectedFile.name}</div>
          <div className="file-upload-size">
            {(selectedFile.size / 1024).toFixed(1)} KB
          </div>
          {!disabled && (
            <button
              type="button"
              className="file-upload-clear"
              onClick={clearFile}
              aria-label="Remove file"
            >
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="file-upload-prompt">
          <UploadCloud size={48} className="file-upload-icon" />
          <p className="file-upload-text">
            Drag &amp; drop your file here, or <span className="file-upload-browse">browse</span>
          </p>
          <p className="file-upload-hint">
            Supports {ACCEPTED_TYPES.join(', ')} · Max {MAX_SIZE_MB} MB
          </p>
        </div>
      )}

      {error && <p className="file-upload-error">{error}</p>}
    </div>
  );
};

export default FileUpload;
