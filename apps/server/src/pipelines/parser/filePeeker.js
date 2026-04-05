const { parse } = require("fast-csv");
const XLSX = require("xlsx");
const { ObjectId } = require("mongodb");
const { getBucket } = require("../../core/storage");

const toObjectId = (value) => {
  if (value instanceof ObjectId) return value;
  return new ObjectId(String(value));
};

const normalizeHeader = (value, index) => {
  const label = String(value ?? "").trim();
  return label || `column_${index + 1}`;
};

const streamToBuffer = async (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });

/**
 * Peeks at the first N rows of a GridFS file for schema inference.
 */
exports.peekFirstRows = async (gridFsFileId, fileName, maxRows = 500) => {
  const bucket = getBucket();
  if (!bucket) throw new Error("GridFS is not initialized");

  const lowerName = String(fileName || "").toLowerCase();
  const rows = [];
  let headers = null;

  if (lowerName.endsWith(".csv")) {
    const downloadStream = bucket.openDownloadStream(toObjectId(gridFsFileId));
    const csvStream = parse({ headers: false, ignoreEmpty: true, trim: true });
    downloadStream.pipe(csvStream);

    let sourceRowNumber = 0;
    for await (const row of csvStream) {
      sourceRowNumber++;
      const values = Array.isArray(row) ? row : Object.values(row || {});
      
      if (!headers) {
        headers = values.map(normalizeHeader);
        continue;
      }

      const rowObj = {};
      headers.forEach((h, i) => { rowObj[h] = values[i] ?? null; });
      rows.push(rowObj);

      if (rows.length >= maxRows) {
        downloadStream.destroy(); // Stop reading
        break;
      }
    }
  } else if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const downloadStream = bucket.openDownloadStream(toObjectId(gridFsFileId));
    const buffer = await streamToBuffer(downloadStream);
    const workbook = XLSX.read(buffer, { type: "buffer", raw: true });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    
    if (sheet) {
      const allRows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: null, blankrows: false });
      if (allRows.length > 0) {
        headers = allRows[0].map(normalizeHeader);
        for (let i = 1; i < Math.min(allRows.length, maxRows + 1); i++) {
          const rowObj = {};
          headers.forEach((h, j) => { rowObj[h] = allRows[i][j] ?? null; });
          rows.push(rowObj);
        }
      }
    }
  } else {
    throw new Error("Unsupported file format for peeking");
  }

  return { headers, rows };
};
