import { useMemo, useState } from "react";

const DEFAULT_ROW_OPTIONS = [10, 20, 50, 100, 150, 200];

function DataGrid({
  data = [],
  rowsToShow,
  onRowsToShowChange,
  rowOptions = DEFAULT_ROW_OPTIONS,
  pagination = null
}) {
  const [localRowsToShow, setLocalRowsToShow] = useState(10);

  const effectiveRowsToShow = Number.isFinite(rowsToShow) ? rowsToShow : localRowsToShow;
  const pageOffset = Math.max(0, pagination?.offset || 0);
  const totalRows = Math.max(0, pagination?.totalRows || data.length);
  const displayedRows = data.slice(0, effectiveRowsToShow);
  const rangeStart = displayedRows.length ? pageOffset + 1 : 0;
  const rangeEnd = displayedRows.length ? pageOffset + displayedRows.length : 0;
  const canGoPrev = Boolean(pagination?.canGoPrev);
  const canGoNext = Boolean(pagination?.canGoNext);

  const handleRowsChange = (nextValue) => {
    if (typeof onRowsToShowChange === "function") {
      onRowsToShowChange(nextValue);
      return;
    }
    setLocalRowsToShow(nextValue);
  };

  const columns = useMemo(() => {
    if (!data.length) {
      return [];
    }
    return Object.keys(data[0]);
  }, [data]);

  if (!data.length && totalRows === 0) {
    return (
      <div className="panel-block">
        <h3>Data Preview</h3>
        <p>No preview data available.</p>
      </div>
    );
  }

  return (
    <div className="panel-block">
      <div className="panel-head">
        <h3>Data Preview</h3>
        <div className="data-grid-controls">
          <label>
            Rows
            <select
              value={effectiveRowsToShow}
              onChange={(event) => handleRowsChange(Number(event.target.value))}
            >
              {rowOptions.map((count) => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="table-wrap">
        <table className="basic-table">
          <thead>
            <tr>
              {columns.map((column) => (
                <th key={column}>{column}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {displayedRows.map((row, index) => (
              <tr key={`${index}-${JSON.stringify(row)}`}>
                {columns.map((column) => (
                  <td key={`${index}-${column}`}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagination ? (
        <div className="data-review-pagination">
          <button
            type="button"
            className="pagination-btn"
            onClick={pagination?.onPrev}
            disabled={!canGoPrev}
          >
            Prev
          </button>
          <span className="pagination-info">Rows {rangeStart}-{rangeEnd} / {totalRows}</span>
          <button
            type="button"
            className="pagination-btn"
            onClick={pagination?.onNext}
            disabled={!canGoNext}
          >
            Next
          </button>
        </div>
      ) : null}
    </div>
  );
}

export default DataGrid;
