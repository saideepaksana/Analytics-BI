function DatasetPickerModal({
  isOpen,
  modeLabel,
  loading,
  error,
  datasets,
  selectedDatasetId,
  onSelect,
  onClose,
  formatDate,
}) {
  if (!isOpen) return null;

  return (
    <div className="ingestion-modal-overlay" role="dialog" aria-modal="true" aria-labelledby="dataset-picker-title">
      <div className="ingestion-modal-card dataset-picker-card">
        <button
          type="button"
          className="ingestion-modal-close"
          aria-label="Close"
          onClick={onClose}
        >
          x
        </button>
        <h3 id="dataset-picker-title">Choose Existing Dataset</h3>
        <p>Select a dataset for {modeLabel.toLowerCase()} mode.</p>

        {loading ? <p>Loading datasets...</p> : null}
        {error ? <p className="error-text">{error}</p> : null}

        {!loading && !error && !datasets.length ? (
          <p>No datasets found. Upload a new file first.</p>
        ) : null}

        {!loading && datasets.length ? (
          <div className="dataset-picker-list">
            {datasets.map((dataset) => (
              <button
                key={dataset.datasetId}
                type="button"
                className={`dataset-picker-item ${dataset.datasetId === selectedDatasetId ? "active" : ""}`}
                onClick={() => onSelect(dataset.datasetId)}
              >
                <div className="dataset-picker-item-head">
                  <strong className="mono">{dataset.datasetId}</strong>
                  <span className="dataset-picker-item-mode">{dataset.mode || "-"}</span>
                </div>
                <p>{dataset.fileName || "-"}</p>
                <small>
                  Rows: {dataset.rowCount ?? 0} | Quarantine: {dataset.quarantinedCount ?? 0} | Created: {formatDate(dataset.createdAt)}
                </small>
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export default DatasetPickerModal;
