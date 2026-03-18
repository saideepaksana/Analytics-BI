import { useMemo, useState } from "react";

const DEFAULT_ROW_OPTIONS = [10, 20, 50, 100, 150, 200];

function DataGrid({ data = [], rowsToShow, onRowsToShowChange, rowOptions = DEFAULT_ROW_OPTIONS }) {
  const [localRowsToShow, setLocalRowsToShow] = useState(10);

  const effectiveRowsToShow = Number.isFinite(rowsToShow) ? rowsToShow : localRowsToShow;

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

  if (!data.length) {
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
            {data.slice(0, effectiveRowsToShow).map((row, index) => (
              <tr key={`${index}-${JSON.stringify(row)}`}>
                {columns.map((column) => (
                  <td key={`${index}-${column}`}>{String(row[column] ?? "")}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default DataGrid;
