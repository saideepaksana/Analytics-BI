const { parentPort } = require("worker_threads");
const { transformRow, resolveCleanerForColumn } = require("../dts/rowTransformer");

// Prepare schemaMap once per batch if schema is provided
const prepareSchemaMap = (schema) => {
    if (!schema || !Array.isArray(schema)) return null;
    const map = {};
    for (const col of schema) {
        const normalizedName = String(col.name || '').toLowerCase().trim();
        map[normalizedName] = {
            cleanerFn: resolveCleanerForColumn(col),
            nullable: col.nullable === true,
            type: col.type || col.dataType,
            role: col.role,
            constraints: col.constraints || {}
        };
    }
    return map;
};

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

  try {
    const { taskId, batchId, headers = [], rows = [], schema = null } = message;

    const validRows = [];
    const quarantineRows = [];
    const schemaMap = prepareSchemaMap(schema);

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

      const rowObject = toRowObject(headers, values);

      // If schema is provided, perform full transformation and validation in worker
      if (schemaMap) {
          const { isValid, errors, cleanedRow } = transformRow(rowObject, schemaMap);
          if (isValid) {
              validRows.push({
                  rowNumber: sourceRowNumber,
                  data: cleanedRow,
                  transformed: true // Hint for main thread to skip transformation
              });
          } else {
              quarantineRows.push({
                  rowNumber: sourceRowNumber,
                  rawData: rowObject,
                  errors: errors || ["Validation failed"]
              });
          }
      } else {
          // No schema yet: just return raw row object for inference in main thread
          validRows.push({
              rowNumber: sourceRowNumber,
              data: rowObject,
              transformed: false
          });
      }
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
  } catch (error) {
    parentPort.postMessage({
      taskId: message.taskId,
      batchId: message.batchId,
      error: error.message || "Unknown worker error"
    });
  }
});
