import { useState } from 'react';
import { RefreshCw, Settings, Download, FileText } from 'lucide-react';
import DataGrid from './components/DataGrid';
import SchemaView from './components/SchemaView';
import QuarantineUI from './components/QuarantineUI';
import { useMetadata } from './hooks/useMetadata';

/**
 * DataReviewPage - Main page component for data review functionality
 * Combines DataGrid, SchemaView, and QuarantineUI components
 */
const DataReviewPage = ({ datasetId = 'demo' }) => {
  const [activeTab, setActiveTab] = useState('preview'); // 'preview' | 'schema'
  const [schemaEditable, setSchemaEditable] = useState(false);

  const {
    metadata,
    schema,
    quarantinedRows,
    previewData,
    columns,
    loading,
    error,
    refetch,
    updateSchema,
    deleteQuarantinedRow,
    restoreQuarantinedRow,
    exportQuarantinedRows,
  } = useMetadata(datasetId);

  // Handler for role changes in schema view
  const handleRoleChange = async (column, newRole, index) => {
    try {
      await updateSchema(column.name, { role: newRole });
    } catch (err) {
      console.error('Failed to update role:', err);
    }
  };

  // Handler for quarantine actions
  const handleQuarantineReview = (row, index) => {
    console.log('Reviewing row:', row);
    // Implement modal or detail view for reviewing
  };

  const handleQuarantineDelete = async (row, index) => {
    if (window.confirm('Are you sure you want to delete this row?')) {
      await deleteQuarantinedRow(index);
    }
  };

  const handleQuarantineRestore = async (row, index) => {
    await restoreQuarantinedRow(index);
  };

  const handleQuarantineExport = () => {
    exportQuarantinedRows('csv');
  };

  const handleDeleteSelected = async (selectedIndices) => {
    if (window.confirm(`Delete ${selectedIndices.length} selected rows?`)) {
      // Delete in reverse order to maintain indices
      for (const index of selectedIndices.sort((a, b) => b - a)) {
        await deleteQuarantinedRow(index);
      }
    }
  };

  // Render loading state
  if (loading) {
    return (
      <div className="data-review-page data-review-loading">
        <div className="data-review-spinner">
          <RefreshCw className="spinning" size={24} />
          <span>Loading data...</span>
        </div>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="data-review-page data-review-error">
        <div className="data-review-error-content">
          <h3>Error Loading Data</h3>
          <p>{error}</p>
          <button className="data-review-btn" onClick={refetch}>
            <RefreshCw size={16} />
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="data-review-page">
      {/* Header */}
      <header className="data-review-header">
        <div className="data-review-header-left">
          <h1 className="data-review-title">
            <FileText size={24} />
            Data Review
          </h1>
          {metadata && (
            <div className="data-review-metadata">
              <span className="data-review-dataset-name">{metadata.name}</span>
              <span className="data-review-row-count">{metadata.rowCount} rows</span>
              <span className="data-review-col-count">{metadata.columnCount} columns</span>
            </div>
          )}
        </div>
        <div className="data-review-header-right">
          <button
            className="data-review-btn data-review-btn-icon"
            onClick={refetch}
            title="Refresh data"
          >
            <RefreshCw size={16} />
          </button>
          <button
            className="data-review-btn data-review-btn-icon"
            title="Export data"
          >
            <Download size={16} />
          </button>
          <button
            className="data-review-btn data-review-btn-icon"
            onClick={() => setSchemaEditable(!schemaEditable)}
            title={schemaEditable ? 'Lock schema editing' : 'Edit schema'}
          >
            <Settings size={16} />
          </button>
        </div>
      </header>

      {/* Quarantine Alert Banner */}
      <QuarantineUI
        quarantinedRows={quarantinedRows}
        columns={columns}
        onReview={handleQuarantineReview}
        onDelete={handleQuarantineDelete}
        onRestore={handleQuarantineRestore}
        onExport={handleQuarantineExport}
        onDeleteAll={handleDeleteSelected}
        className="data-review-quarantine"
      />

      {/* Tab Navigation */}
      <nav className="data-review-tabs">
        <button
          className={`data-review-tab ${activeTab === 'preview' ? 'active' : ''}`}
          onClick={() => setActiveTab('preview')}
        >
          Data Preview
        </button>
        <button
          className={`data-review-tab ${activeTab === 'schema' ? 'active' : ''}`}
          onClick={() => setActiveTab('schema')}
        >
          Schema
        </button>
      </nav>

      {/* Tab Content */}
      <main className="data-review-content">
        {activeTab === 'preview' && (
          <DataGrid
            columns={columns}
            data={previewData}
            pageSize={20}
            loading={loading}
            className="data-review-grid"
          />
        )}

        {activeTab === 'schema' && (
          <SchemaView
            schema={schema}
            editable={schemaEditable}
            onRoleChange={handleRoleChange}
            className="data-review-schema"
          />
        )}
      </main>

      {/* Footer with metadata info */}
      {metadata && (
        <footer className="data-review-footer">
          <div className="data-review-footer-item">
            <span className="label">Last Updated:</span>
            <span className="value">{new Date(metadata.updatedAt).toLocaleString()}</span>
          </div>
          <div className="data-review-footer-item">
            <span className="label">Source:</span>
            <span className="value">{metadata.source || 'Unknown'}</span>
          </div>
          <div className="data-review-footer-item">
            <span className="label">File Size:</span>
            <span className="value">{metadata.fileSize || 'N/A'}</span>
          </div>
        </footer>
      )}
    </div>
  );
};

export default DataReviewPage;
