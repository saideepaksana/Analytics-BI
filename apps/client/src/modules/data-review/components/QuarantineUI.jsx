import { useState } from 'react';
import { 
  AlertTriangle, 
  XCircle, 
  ChevronDown, 
  ChevronUp, 
  Download,
  Trash2,
  RefreshCw,
  Eye,
  EyeOff
} from 'lucide-react';

/**
 * QuarantineUI Component - Displays corrupt/invalid rows alert and management
 * @param {Object} props
 * @param {Array} props.quarantinedRows - Array of quarantined row objects { rowIndex, data, errors }
 * @param {Array} props.columns - Column definitions for displaying row data
 * @param {Function} props.onReview - Callback when user wants to review a row
 * @param {Function} props.onDelete - Callback when user wants to delete a row
 * @param {Function} props.onRestore - Callback when user wants to restore a row
 * @param {Function} props.onExport - Callback to export quarantined rows
 * @param {Function} props.onDeleteAll - Callback to delete all quarantined rows
 */
const QuarantineUI = ({
  quarantinedRows = [],
  columns = [],
  onReview,
  onDelete,
  onRestore,
  onExport,
  onDeleteAll,
  className = '',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [viewMode, setViewMode] = useState('summary'); // 'summary' | 'detailed'

  const totalErrors = quarantinedRows.reduce(
    (acc, row) => acc + (row.errors?.length || 0),
    0
  );

  const toggleRowSelection = (rowIndex) => {
    setSelectedRows((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(rowIndex)) {
        newSet.delete(rowIndex);
      } else {
        newSet.add(rowIndex);
      }
      return newSet;
    });
  };

  const toggleSelectAll = () => {
    if (selectedRows.size === quarantinedRows.length) {
      setSelectedRows(new Set());
    } else {
      setSelectedRows(new Set(quarantinedRows.map((_, i) => i)));
    }
  };

  const getErrorSeverity = (errors) => {
    if (!errors?.length) return 'warning';
    const hasError = errors.some((e) => e.severity === 'error');
    return hasError ? 'error' : 'warning';
  };

  const getSeverityIcon = (severity) => {
    return severity === 'error' ? XCircle : AlertTriangle;
  };

  // Group errors by type for summary
  const errorSummary = quarantinedRows.reduce((acc, row) => {
    row.errors?.forEach((error) => {
      const type = error.type || 'unknown';
      if (!acc[type]) {
        acc[type] = { count: 0, message: error.message };
      }
      acc[type].count++;
    });
    return acc;
  }, {});

  if (!quarantinedRows.length) {
    return null; // Don't render if no quarantined rows
  }

  return (
    <div className={`quarantine-ui ${className}`}>
      {/* Alert Banner */}
      <div
        className={`quarantine-banner quarantine-banner-${
          totalErrors > 10 ? 'error' : 'warning'
        }`}
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="quarantine-banner-icon">
          <AlertTriangle size={20} />
        </div>
        <div className="quarantine-banner-content">
          <div className="quarantine-banner-title">
            {quarantinedRows.length} row{quarantinedRows.length !== 1 ? 's' : ''} quarantined
          </div>
          <div className="quarantine-banner-subtitle">
            {totalErrors} validation error{totalErrors !== 1 ? 's' : ''} detected
          </div>
        </div>
        <div className="quarantine-banner-actions">
          <button
            className="quarantine-btn quarantine-btn-icon"
            onClick={(e) => {
              e.stopPropagation();
              setViewMode(viewMode === 'summary' ? 'detailed' : 'summary');
            }}
            title={viewMode === 'summary' ? 'Show detailed view' : 'Show summary'}
          >
            {viewMode === 'summary' ? <Eye size={16} /> : <EyeOff size={16} />}
          </button>
          <button className="quarantine-btn quarantine-btn-icon">
            {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>
        </div>
      </div>

      {/* Expanded Content */}
      {isExpanded && (
        <div className="quarantine-content">
          {/* Action Bar */}
          <div className="quarantine-actions">
            <div className="quarantine-actions-left">
              <label className="quarantine-checkbox-label">
                <input
                  type="checkbox"
                  checked={selectedRows.size === quarantinedRows.length}
                  onChange={toggleSelectAll}
                  className="quarantine-checkbox"
                />
                Select All
              </label>
              {selectedRows.size > 0 && (
                <span className="quarantine-selected-count">
                  {selectedRows.size} selected
                </span>
              )}
            </div>
            <div className="quarantine-actions-right">
              {onExport && (
                <button
                  className="quarantine-btn quarantine-btn-secondary"
                  onClick={() => onExport(quarantinedRows)}
                  title="Export quarantined rows"
                >
                  <Download size={14} />
                  Export
                </button>
              )}
              {onDeleteAll && selectedRows.size > 0 && (
                <button
                  className="quarantine-btn quarantine-btn-danger"
                  onClick={() => onDeleteAll([...selectedRows])}
                  title="Delete selected rows"
                >
                  <Trash2 size={14} />
                  Delete Selected
                </button>
              )}
            </div>
          </div>

          {/* Summary View */}
          {viewMode === 'summary' && (
            <div className="quarantine-summary">
              <h4 className="quarantine-summary-title">Error Summary</h4>
              <div className="quarantine-summary-list">
                {Object.entries(errorSummary).map(([type, { count, message }]) => (
                  <div key={type} className="quarantine-summary-item">
                    <span className="quarantine-error-type">{type}</span>
                    <span className="quarantine-error-count">{count} occurrence{count !== 1 ? 's' : ''}</span>
                    <span className="quarantine-error-message">{message}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Detailed View - Row List */}
          {viewMode === 'detailed' && (
            <div className="quarantine-rows">
              <div className="quarantine-rows-header">
                <span className="quarantine-col-select"></span>
                <span className="quarantine-col-row">Row</span>
                <span className="quarantine-col-errors">Errors</span>
                <span className="quarantine-col-preview">Data Preview</span>
                <span className="quarantine-col-actions">Actions</span>
              </div>
              {quarantinedRows.map((row, index) => {
                const severity = getErrorSeverity(row.errors);
                const SeverityIcon = getSeverityIcon(severity);
                
                return (
                  <div
                    key={row.rowIndex ?? index}
                    className={`quarantine-row quarantine-row-${severity}`}
                  >
                    <span className="quarantine-col-select">
                      <input
                        type="checkbox"
                        checked={selectedRows.has(index)}
                        onChange={() => toggleRowSelection(index)}
                        className="quarantine-checkbox"
                      />
                    </span>
                    <span className="quarantine-col-row">
                      <SeverityIcon size={14} />
                      #{row.rowIndex ?? index + 1}
                    </span>
                    <span className="quarantine-col-errors">
                      <ul className="quarantine-error-list">
                        {row.errors?.map((error, errIndex) => (
                          <li key={errIndex} className="quarantine-error-item">
                            <strong>{error.column}:</strong> {error.message}
                          </li>
                        ))}
                      </ul>
                    </span>
                    <span className="quarantine-col-preview">
                      {columns.slice(0, 3).map((col) => (
                        <span key={col.key} className="quarantine-preview-cell">
                          <span className="quarantine-preview-label">{col.label}:</span>
                          <span className="quarantine-preview-value">
                            {row.data?.[col.key] ?? 'N/A'}
                          </span>
                        </span>
                      ))}
                      {columns.length > 3 && (
                        <span className="quarantine-preview-more">
                          +{columns.length - 3} more
                        </span>
                      )}
                    </span>
                    <span className="quarantine-col-actions">
                      {onReview && (
                        <button
                          className="quarantine-btn quarantine-btn-sm"
                          onClick={() => onReview(row, index)}
                          title="Review row"
                        >
                          <Eye size={12} />
                        </button>
                      )}
                      {onRestore && (
                        <button
                          className="quarantine-btn quarantine-btn-sm quarantine-btn-success"
                          onClick={() => onRestore(row, index)}
                          title="Restore row"
                        >
                          <RefreshCw size={12} />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          className="quarantine-btn quarantine-btn-sm quarantine-btn-danger"
                          onClick={() => onDelete(row, index)}
                          title="Delete row"
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default QuarantineUI;
