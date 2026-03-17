import { useMemo, useState } from "react";

function DataGrid({ data = [] }) {
  const [rowsToShow, setRowsToShow] = useState(10);

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
          <select value={rowsToShow} onChange={(event) => setRowsToShow(Number(event.target.value))}>
            <option value={10}>10</option>
            <option value={20}>20</option>
            <option value={50}>50</option>
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
            {data.slice(0, rowsToShow).map((row, index) => (
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
