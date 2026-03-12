import { useState } from 'react';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from 'lucide-react';

/**
 * DataGrid Component - Displays tabular data preview with pagination
 * @param {Object} props
 * @param {Array} props.columns - Array of column definitions { key, label, type }
 * @param {Array} props.data - Array of row objects
 * @param {number} props.pageSize - Number of rows per page (default: 10)
 * @param {boolean} props.loading - Loading state
 * @param {Function} props.onRowClick - Callback when row is clicked
 * @param {Function} props.onCellClick - Callback when cell is clicked
 */
const DataGrid = ({
  columns = [],
  data = [],
  pageSize = 10,
  loading = false,
  onRowClick,
  onCellClick,
  className = '',
}) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [sortConfig, setSortConfig] = useState({ key: null, direction: 'asc' });

  // Calculate pagination
  const totalPages = Math.ceil(data.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const endIndex = startIndex + pageSize;

  // Sort data
  const sortedData = [...data].sort((a, b) => {
    if (!sortConfig.key) return 0;
    const aVal = a[sortConfig.key];
    const bVal = b[sortConfig.key];
    
    if (aVal === null || aVal === undefined) return 1;
    if (bVal === null || bVal === undefined) return -1;
    
    if (typeof aVal === 'number' && typeof bVal === 'number') {
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    }
    
    const comparison = String(aVal).localeCompare(String(bVal));
    return sortConfig.direction === 'asc' ? comparison : -comparison;
  });

  const paginatedData = sortedData.slice(startIndex, endIndex);

  const handleSort = (key) => {
    setSortConfig((prev) => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc',
    }));
  };

  const handlePageChange = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  const handleRowClick = (row, rowIndex) => {
    onRowClick?.(row, rowIndex);
  };

  const handleCellClick = (row, column, rowIndex, colIndex) => {
    onCellClick?.(row, column, rowIndex, colIndex);
  };

  // Render cell value with type-aware formatting
  const renderCellValue = (value, column) => {
    if (value === null || value === undefined) {
      return <span className="data-grid-null">NULL</span>;
    }
    if (typeof value === 'boolean') {
      return <span className="data-grid-boolean">{value ? 'true' : 'false'}</span>;
    }
    if (typeof value === 'number') {
      return <span className="data-grid-number">{value.toLocaleString()}</span>;
    }
    if (value instanceof Date || column?.type === 'date') {
      const date = value instanceof Date ? value : new Date(value);
      return <span className="data-grid-date">{date.toLocaleDateString()}</span>;
    }
    return <span className="data-grid-text">{String(value)}</span>;
  };

  if (loading) {
    return (
      <div className={`data-grid data-grid-loading ${className}`}>
        <div className="data-grid-spinner">Loading...</div>
      </div>
    );
  }

  if (!columns.length || !data.length) {
    return (
      <div className={`data-grid data-grid-empty ${className}`}>
        <p>No data available</p>
      </div>
    );
  }

  return (
    <div className={`data-grid ${className}`}>
      <div className="data-grid-container">
        <table className="data-grid-table">
          <thead className="data-grid-header">
            <tr>
              {columns.map((column, index) => (
                <th
                  key={column.key || index}
                  className="data-grid-th"
                  onClick={() => handleSort(column.key)}
                >
                  <div className="data-grid-th-content">
                    <span>{column.label || column.key}</span>
                    {sortConfig.key === column.key && (
                      <span className="data-grid-sort-indicator">
                        {sortConfig.direction === 'asc' ? '↑' : '↓'}
                      </span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="data-grid-body">
            {paginatedData.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="data-grid-row"
                onClick={() => handleRowClick(row, startIndex + rowIndex)}
              >
                {columns.map((column, colIndex) => (
                  <td
                    key={column.key || colIndex}
                    className="data-grid-cell"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCellClick(row, column, startIndex + rowIndex, colIndex);
                    }}
                  >
                    {renderCellValue(row[column.key], column)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination Controls */}
      <div className="data-grid-pagination">
        <div className="data-grid-pagination-info">
          Showing {startIndex + 1} to {Math.min(endIndex, data.length)} of {data.length} rows
        </div>
        <div className="data-grid-pagination-controls">
          <button
            className="data-grid-pagination-btn"
            onClick={() => handlePageChange(1)}
            disabled={currentPage === 1}
            aria-label="First page"
          >
            <ChevronsLeft size={16} />
          </button>
          <button
            className="data-grid-pagination-btn"
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage === 1}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="data-grid-page-indicator">
            Page {currentPage} of {totalPages}
          </span>
          <button
            className="data-grid-pagination-btn"
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage === totalPages}
            aria-label="Next page"
          >
            <ChevronRight size={16} />
          </button>
          <button
            className="data-grid-pagination-btn"
            onClick={() => handlePageChange(totalPages)}
            disabled={currentPage === totalPages}
            aria-label="Last page"
          >
            <ChevronsRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DataGrid;
