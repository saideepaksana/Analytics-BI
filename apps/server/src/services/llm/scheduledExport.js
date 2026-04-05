const cron = require("node-cron");
const { ExportLog } = require("../../models/exportLog");
const { CleanRecord } = require("../../models/CleanRecord");
const { Parser: CsvParser } = require("json2csv");
const ExcelJS = require("exceljs");
const fs = require("fs");
const path = require("path");
const logger = require("../../core/logger");

const EXPORT_DIR = path.join(__dirname, "../../../../../exports");
if (!fs.existsSync(EXPORT_DIR)) fs.mkdirSync(EXPORT_DIR, { recursive: true });

const scheduleRegistry = new Map();

const cronMap = {
  daily:   "0 6 * * *",
  weekly:  "0 6 * * 1",
  monthly: "0 6 1 * *",
};

function registerSchedule({ scheduleId, datasetId, format, frequency, notifyFn }) {
  const task = cron.schedule(cronMap[frequency] || cronMap.daily, async () => {
    try {
      const records = await CleanRecord.find({ datasetId }).lean();
      if (!records.length) return;

      const fields = Object.keys(records[0]).filter((k) => k !== "_id" && k !== "__v");
      let filePath;

      if (format === "csv") {
        const csv = new CsvParser({ fields }).parse(records);
        filePath = path.join(EXPORT_DIR, `scheduled_${datasetId}_${Date.now()}.csv`);
        fs.writeFileSync(filePath, csv);
      } else if (format === "xlsx") {
        const workbook = new ExcelJS.Workbook();
        const sheet = workbook.addWorksheet("Data");
        sheet.columns = fields.map((f) => ({ header: f, key: f, width: 18 }));
        records.forEach((r) => sheet.addRow(r));
        filePath = path.join(EXPORT_DIR, `scheduled_${datasetId}_${Date.now()}.xlsx`);
        await workbook.xlsx.writeFile(filePath);
      }

      await ExportLog.create({ datasetId, format, exportedBy: `scheduler:${frequency}`, recordCount: records.length });
      if (notifyFn) notifyFn({ scheduleId, datasetId, format, filePath });
    } catch (err) {
      logger.error(`${scheduleId} failed: ${err.message}`, "Scheduler");
    }
  });

  scheduleRegistry.set(scheduleId, { task, config: { datasetId, format, frequency } });
}

function cancelSchedule(scheduleId) {
  const entry = scheduleRegistry.get(scheduleId);
  if (!entry) return false;
  entry.task.destroy();
  scheduleRegistry.delete(scheduleId);
  return true;
}

function listSchedules() {
  return [...scheduleRegistry.entries()].map(([id, { config }]) => ({ id, ...config }));
}

// Route handlers — pass io from your index.js
function scheduleRouteHandlers(io) {
  return {
    create(req, res) {
      const { scheduleId, datasetId, format, frequency } = req.body;
      if (!scheduleId || !datasetId || !format || !frequency)
        return res.status(400).json({ error: "scheduleId, datasetId, format, frequency required." });
      if (scheduleRegistry.has(scheduleId))
        return res.status(409).json({ error: "Schedule ID already exists." });

      registerSchedule({ scheduleId, datasetId, format, frequency, notifyFn: (info) => io?.emit("export:scheduledDone", info) });
      res.json({ message: "Schedule registered.", scheduleId });
    },
    cancel(req, res) {
      cancelSchedule(req.params.scheduleId)
        ? res.json({ message: "Cancelled." })
        : res.status(404).json({ error: "Not found." });
    },
    list(_req, res) { res.json({ schedules: listSchedules() }); },
  };
}

module.exports = { registerSchedule, cancelSchedule, listSchedules, scheduleRouteHandlers };