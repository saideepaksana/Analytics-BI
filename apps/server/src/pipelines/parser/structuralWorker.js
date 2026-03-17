const { parentPort } = require("worker_threads");

const toRowObject = (headers, values) => {
  const row = {};
  headers.forEach((header, index) => {
    row[header] = values[index] ?? null;
  });
  return row;
};

parentPort.on("message", (message) => {
  if (!message || message.type !== "process-batch") {
    return;
  }

  const { taskId, batchId, headers = [], rows = [] } = message;

  const validRows = [];
  const quarantineRows = [];

  rows.forEach((entry) => {
    const values = Array.isArray(entry.values) ? entry.values : [];
    const sourceRowNumber = entry.sourceRowNumber;

    if (values.length !== headers.length) {
      quarantineRows.push({
        rowNumber: sourceRowNumber,
        rawData: values,
        errors: ["Column count mismatch"]
      });
      return;
    }

    validRows.push({
      rowNumber: sourceRowNumber,
      data: toRowObject(headers, values)
    });
  });

  parentPort.postMessage({
    taskId,
    batchId,
    validRows,
    quarantineRows,
    batchStats: {
      totalRows: rows.length,
      validCount: validRows.length,
      quarantinedCount: quarantineRows.length
    }
  });
});
