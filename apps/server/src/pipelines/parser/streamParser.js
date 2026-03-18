const path = require("path");
const os = require("os");
const XLSX = require("xlsx");
const { parse } = require("fast-csv");
const { Worker } = require("worker_threads");
const { ObjectId } = require("mongodb");
const { getBucket } = require("../../core/storage");

const WORKER_FILE = path.join(__dirname, "structuralWorker.js");
const DEFAULT_BATCH_SIZE = Number(process.env.PARSER_BATCH_SIZE || 500);
const DEFAULT_WORKERS = Number(process.env.PARSER_WORKERS || Math.max(1, Math.min(os.cpus().length, 8)));

const toObjectId = (value) => {
  if (value instanceof ObjectId) {
    return value;
  }
  return new ObjectId(String(value));
};

const normalizeHeader = (value, index) => {
  const label = String(value ?? "").trim();
  return label || `column_${index + 1}`;
};

const validateHeaders = (headers = []) => {
  if (!headers.length) {
    throw new Error("No header row found in file");
  }

  const seen = new Set();
  headers.forEach((header) => {
    const lower = String(header).toLowerCase();
    if (seen.has(lower)) {
      throw new Error(`Duplicate header detected: ${header}`);
    }
    seen.add(lower);
  });
};

const createWorkerPool = (workerCount, headers) => {
  const workers = [];
  const queue = [];
  const callbacks = new Map();
  let taskSeq = 0;

  const assignTask = (workerState) => {
    if (workerState.busy || queue.length === 0) {
      return;
    }

    const task = queue.shift();
    workerState.busy = true;
    callbacks.set(task.taskId, { resolve: task.resolve, reject: task.reject, workerState });

    workerState.worker.postMessage({
      type: "process-batch",
      taskId: task.taskId,
      batchId: task.batchId,
      headers,
      rows: task.rows
    });
  };

  for (let i = 0; i < workerCount; i += 1) {
    const workerState = {
      busy: false,
      worker: new Worker(WORKER_FILE)
    };

    workerState.worker.on("message", (message) => {
      const callback = callbacks.get(message.taskId);
      if (!callback) {
        return;
      }

      callbacks.delete(message.taskId);
      callback.workerState.busy = false;
      callback.resolve(message);
      assignTask(callback.workerState);
    });

    workerState.worker.on("error", (error) => {
      callbacks.forEach((callback) => {
        if (callback.workerState === workerState) {
          callback.reject(error);
        }
      });
      callbacks.forEach((value, key) => {
        if (value.workerState === workerState) {
          callbacks.delete(key);
        }
      });
      workerState.busy = false;
    });

    workers.push(workerState);
  }

  const executeBatch = (batchId, rows) =>
    new Promise((resolve, reject) => {
      const taskId = ++taskSeq;
      queue.push({ taskId, batchId, rows, resolve, reject });
      workers.forEach(assignTask);
    });

  const close = async () => {
    await Promise.all(workers.map((workerState) => workerState.worker.terminate()));
  };

  return {
    executeBatch,
    close
  };
};

const processWithWorkers = async ({
  headers,
  rowIterator,
  batchSize,
  workerCount,
  onBatch,
  onProgress
}) => {
  const pool = createWorkerPool(workerCount, headers);

  let currentBatch = [];
  let batchSeq = 0;
  let nextBatchToEmit = 1;
  const pendingResults = new Map();
  const inFlight = new Set();

  const parseQuarantineRows = [];
  let rowsSeen = 0;
  let rowsValid = 0;

  const emitResultInOrder = async (result) => {
    pendingResults.set(result.batchId, result);

    while (pendingResults.has(nextBatchToEmit)) {
      const ordered = pendingResults.get(nextBatchToEmit);
      pendingResults.delete(nextBatchToEmit);
      nextBatchToEmit += 1;

      parseQuarantineRows.push(...ordered.quarantineRows);
      rowsValid += ordered.validRows.length;

      if (ordered.validRows.length > 0) {
        await onBatch(ordered.validRows);
      }

      onProgress({
        rowsSeen,
        rowsValid,
        rowsQuarantined: parseQuarantineRows.length,
        batchesProcessed: nextBatchToEmit - 1
      });
    }
  };

  const dispatchBatch = async () => {
    if (currentBatch.length === 0) {
      return;
    }

    const outgoing = currentBatch;
    currentBatch = [];
    batchSeq += 1;

    const promise = pool
      .executeBatch(batchSeq, outgoing)
      .then(emitResultInOrder);

    inFlight.add(promise);
    promise.finally(() => inFlight.delete(promise));

    if (inFlight.size >= workerCount * 2) {
      await Promise.race(inFlight);
    }
  };

  for await (const row of rowIterator) {
    rowsSeen += 1;
    currentBatch.push(row);

    if (currentBatch.length >= batchSize) {
      await dispatchBatch();
    }
  }

  await dispatchBatch();
  await Promise.all(inFlight);
  await pool.close();

  return {
    parseQuarantineRows,
    rowsSeen,
    rowsValid
  };
};

const createCsvIterator = async (gridFsFileId) => {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error("GridFS is not initialized yet");
  }

  const downloadStream = bucket.openDownloadStream(toObjectId(gridFsFileId));
  const csvStream = parse({ headers: false, ignoreEmpty: true, trim: true });
  downloadStream.pipe(csvStream);

  let headers = null;
  let sourceRowNumber = 0;

  async function* iterator() {
    for await (const row of csvStream) {
      sourceRowNumber += 1;
      const values = Array.isArray(row) ? row : Object.values(row || {});

      if (!headers) {
        headers = values.map(normalizeHeader);
        validateHeaders(headers);
        continue;
      }

      yield {
        sourceRowNumber,
        values
      };
    }
  }

  return {
    getHeaders: () => headers,
    rowIterator: iterator()
  };
};

const streamToBuffer = async (stream) =>
  new Promise((resolve, reject) => {
    const chunks = [];
    stream.on("data", (chunk) => chunks.push(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(Buffer.concat(chunks)));
  });

const createExcelIterator = async (gridFsFileId) => {
  const bucket = getBucket();
  if (!bucket) {
    throw new Error("GridFS is not initialized yet");
  }

  const downloadStream = bucket.openDownloadStream(toObjectId(gridFsFileId));
  const workbookBuffer = await streamToBuffer(downloadStream);
  const workbook = XLSX.read(workbookBuffer, { type: "buffer", raw: true });
  const firstSheetName = workbook.SheetNames[0];
  const firstSheet = firstSheetName ? workbook.Sheets[firstSheetName] : null;

  if (!firstSheet) {
    return {
      headers: [],
      rowIterator: (async function* empty() {})()
    };
  }

  const rows = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    raw: true,
    defval: null,
    blankrows: false
  });

  const headerValues = Array.isArray(rows[0]) ? rows[0] : [];
  const headers = headerValues.map(normalizeHeader);
  validateHeaders(headers);

  async function* iterator() {
    for (let rowNum = 2; rowNum <= rows.length; rowNum += 1) {
      const values = Array.isArray(rows[rowNum - 1]) ? rows[rowNum - 1] : [];
      if (values.every((value) => value === null || value === undefined || value === "")) {
        continue;
      }

      yield {
        sourceRowNumber: rowNum,
        values
      };
    }
  }

  return {
    headers,
    rowIterator: iterator()
  };
};

const processGridFsFile = async ({
  gridFsFileId,
  originalFileName,
  batchSize = DEFAULT_BATCH_SIZE,
  workerCount = DEFAULT_WORKERS,
  onBatch = async () => {},
  onProgress = () => {}
}) => {
  const lowerName = String(originalFileName || "").toLowerCase();

  if (lowerName.endsWith(".csv")) {
    const csv = await createCsvIterator(gridFsFileId);
    const headerReader = csv.getHeaders;

    // Prime the iterator once so headers become available before worker setup.
    const first = await csv.rowIterator.next();
    const headers = headerReader() || [];

    const replayIterator = async function* replay() {
      if (!first.done) {
        yield first.value;
      }
      for await (const item of csv.rowIterator) {
        yield item;
      }
    };

    const processed = await processWithWorkers({
      headers,
      rowIterator: replayIterator(),
      batchSize,
      workerCount,
      onBatch,
      onProgress
    });

    return {
      headers,
      parseQuarantineRows: processed.parseQuarantineRows,
      rowsSeen: processed.rowsSeen,
      rowsValid: processed.rowsValid
    };
  }

  if (lowerName.endsWith(".xlsx") || lowerName.endsWith(".xls")) {
    const excel = await createExcelIterator(gridFsFileId);

    const processed = await processWithWorkers({
      headers: excel.headers,
      rowIterator: excel.rowIterator,
      batchSize,
      workerCount,
      onBatch,
      onProgress
    });

    return {
      headers: excel.headers,
      parseQuarantineRows: processed.parseQuarantineRows,
      rowsSeen: processed.rowsSeen,
      rowsValid: processed.rowsValid
    };
  }

  throw new Error("Unsupported file format");
};

module.exports = {
  processGridFsFile
};
