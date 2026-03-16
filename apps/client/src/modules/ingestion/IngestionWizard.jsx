import { useState } from 'react';
import axios from 'axios';
import { CheckCircle, AlertCircle, Loader } from 'lucide-react';
import FileUpload from './FileUpload';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api';

const STEPS = ['Select File', 'Configure Upload', 'Review & Upload'];

const UPLOAD_MODES = [
  { value: 'new', label: 'New Dataset', description: 'Create a fresh dataset from this file.' },
  { value: 'append', label: 'Append to Existing', description: 'Add rows to an existing dataset.' },
  { value: 'replace', label: 'Replace Existing', description: 'Overwrite all rows in the dataset.' },
];

/**
 * IngestionWizard – Multi-step file upload wizard.
 *
 * Step 1 → File selection (via FileUpload)
 * Step 2 → Configure upload mode
 * Step 3 → Summary and submit
 *
 * Props:
 *   onComplete({ fileName, mode, response }) – called after successful upload
 */

// ── Step indicators (declared outside to avoid re-creation on every render) ──
const StepIndicator = ({ steps, step }) => (
  <div className="wizard-steps">
    {steps.map((label, i) => (
      <div key={label} className={`wizard-step${i === step ? ' active' : i < step ? ' done' : ''}`}>
        <div className="wizard-step-circle">{i < step ? '✓' : i + 1}</div>
        <span className="wizard-step-label">{label}</span>
        {i < steps.length - 1 && <div className="wizard-step-connector" />}
      </div>
    ))}
  </div>
);

const IngestionWizard = ({ onComplete }) => {
  const [step, setStep] = useState(0);
  const [file, setFile] = useState(null);
  const [mode, setMode] = useState('new');
  const [status, setStatus] = useState('idle'); // idle | uploading | success | error
  const [errorMsg, setErrorMsg] = useState('');
  const [uploadResult, setUploadResult] = useState(null);

  // ── Step navigation ────────────────────────────────────────────────────────
  const canGoNext = () => {
    if (step === 0) return file !== null;
    return true;
  };

  const next = () => setStep((s) => Math.min(s + 1, STEPS.length - 1));
  const back = () => setStep((s) => Math.max(s - 1, 0));

  // ── Upload ────────────────────────────────────────────────────────────────
  const handleUpload = async () => {
    if (!file) return;

    setStatus('uploading');
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', file);
    formData.append('mode', mode);

    try {
      const response = await axios.post(`${API_BASE_URL}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });

      setUploadResult(response.data);
      setStatus('success');

      if (onComplete) {
        onComplete({ fileName: file.name, mode, response: response.data });
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.response?.data?.message || err.message || 'Upload failed');
    }
  };

  const reset = () => {
    setStep(0);
    setFile(null);
    setMode('new');
    setStatus('idle');
    setErrorMsg('');
    setUploadResult(null);
  };

  // ── Render success state ──────────────────────────────────────────────────
  if (status === 'success') {
    return (
      <div className="wizard-card">
        <div className="wizard-success">
          <CheckCircle size={56} className="wizard-success-icon" />
          <h2>Upload Successful</h2>
          <p>
            <strong>{uploadResult?.fileName || file?.name}</strong> was uploaded successfully.
          </p>
          <p className="wizard-success-hint">Mode: {mode}</p>
          <button className="wizard-btn wizard-btn-primary" onClick={reset}>
            Upload Another File
          </button>
        </div>
      </div>
    );
  }

  // ── Main wizard ───────────────────────────────────────────────────────────
  return (
    <div className="wizard-card">
      <header className="wizard-header">
        <h2>Data Ingestion</h2>
        <p>Upload a CSV or Excel file to ingest data into the platform.</p>
      </header>

      <StepIndicator steps={STEPS} step={step} />

      <div className="wizard-content">
        {/* Step 0 – File selection */}
        {step === 0 && (
          <section>
            <h3 className="wizard-step-title">Select a File</h3>
            <FileUpload onFileSelected={setFile} disabled={status === 'uploading'} />
          </section>
        )}

        {/* Step 1 – Upload mode */}
        {step === 1 && (
          <section>
            <h3 className="wizard-step-title">Configure Upload Mode</h3>
            <div className="wizard-mode-list">
              {UPLOAD_MODES.map((m) => (
                <label key={m.value} className={`wizard-mode-item${mode === m.value ? ' selected' : ''}`}>
                  <input
                    type="radio"
                    name="uploadMode"
                    value={m.value}
                    checked={mode === m.value}
                    onChange={() => setMode(m.value)}
                  />
                  <div>
                    <div className="wizard-mode-label">{m.label}</div>
                    <div className="wizard-mode-desc">{m.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </section>
        )}

        {/* Step 2 – Summary & submit */}
        {step === 2 && (
          <section>
            <h3 className="wizard-step-title">Review &amp; Upload</h3>
            <dl className="wizard-summary">
              <dt>File</dt>
              <dd>{file?.name}</dd>
              <dt>Size</dt>
              <dd>{file ? `${(file.size / 1024).toFixed(1)} KB` : '—'}</dd>
              <dt>Mode</dt>
              <dd>{UPLOAD_MODES.find((m) => m.value === mode)?.label}</dd>
            </dl>

            {status === 'error' && (
              <div className="wizard-error">
                <AlertCircle size={18} />
                <span>{errorMsg}</span>
              </div>
            )}
          </section>
        )}
      </div>

      {/* Navigation */}
      <footer className="wizard-footer">
        <button
          className="wizard-btn wizard-btn-secondary"
          onClick={back}
          disabled={step === 0 || status === 'uploading'}
        >
          Back
        </button>

        {step < STEPS.length - 1 ? (
          <button
            className="wizard-btn wizard-btn-primary"
            onClick={next}
            disabled={!canGoNext()}
          >
            Next
          </button>
        ) : (
          <button
            className="wizard-btn wizard-btn-primary"
            onClick={handleUpload}
            disabled={status === 'uploading' || !file}
          >
            {status === 'uploading' ? (
              <>
                <Loader size={16} className="spinning" />
                Uploading…
              </>
            ) : (
              'Upload'
            )}
          </button>
        )}
      </footer>
    </div>
  );
};

export default IngestionWizard;
