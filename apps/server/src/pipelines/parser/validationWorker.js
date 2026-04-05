const { parentPort } = require("worker_threads");
const { transformRow } = require("../dts/rowTransformer");

parentPort.on("message", (message) => {
  if (!message || message.type !== "process-batch") {
    return;
  }

  try {
    const { taskId, batchId, rows = [], schemaMap = {} } = message;

    const validRows = [];
    const failedRows = [];

    rows.forEach((row) => {
      const sourceData = row.rawData && typeof row.rawData === "object" && !Array.isArray(row.rawData)
        ? row.rawData
        : {};
      
      const { isValid, errors, cleanedRow } = transformRow(sourceData, schemaMap);
      
      if (isValid) {
          validRows.push({
            rowNumber: row.rowNumber,
            data: cleanedRow,
            _id: row._id
          });
      } else {
          failedRows.push({
            rowNumber: row.rowNumber,
            errors: errors || ["Validation failed"],
            _id: row._id
          });
      }
    });

    parentPort.postMessage({
      taskId,
      batchId,
      validRows,
      failedRows,
      batchStats: {
        totalRows: rows.length,
        validCount: validRows.length,
        failedCount: failedRows.length
      }
    });
  } catch (error) {
    parentPort.postMessage({
      taskId: message.taskId,
      batchId: message.batchId,
      error: error.message || "Unknown validation worker error"
    });
  }
});
