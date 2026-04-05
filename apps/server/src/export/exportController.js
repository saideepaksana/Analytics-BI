const { ExportLog } = require("../models/exportLog");
const CleanRecord = require("../models/CleanRecord");
const Metadata = require("../models/Metadata");
const ExcelJS = require("exceljs");
const { Parser: CsvParser } = require("json2csv");
const PDFDocument = require("pdfkit");
const logger = require("../core/logger");

// ─── Flatten Helper ───────────────────────────────────────────────────────────
/**
 * Recursively flattens a nested object into dot-notation keys.
 * Arrays are converted to JSON strings to avoid column explosion.
 * e.g. { user: { id: 1, tags: ["a","b"] } } -> { "user.id": 1, "user.tags": '["a","b"]' }
 * @param {object} obj  - the object to flatten
 * @param {string} prefix - internal prefix accumulated during recursion
 * @returns {object} - single-depth flat object
 */
function flattenObject(obj, prefix = "") {
  return Object.keys(obj || {}).reduce((acc, k) => {
    const pre = prefix.length ? prefix + "." : "";
    const val = obj[k];
    if (Array.isArray(val)) {
      // Stringify arrays to avoid exploding into indexed keys
      acc[pre + k] = JSON.stringify(val);
    } else if (val !== null && typeof val === "object" && val.constructor === Object) {
      Object.assign(acc, flattenObject(val, pre + k));
    } else {
      acc[pre + k] = val;
    }
    return acc;
  }, {});
}

/**
 * Returns an ordered list of unique column keys that appears across ALL records.
 * Respects a Metadata schema when available (uses schema field names directly).
 * @param {object[]} flatRecords - already-flattened records
 * @param {object|null} meta - Metadata document (may be null)
 * @returns {string[]} ordered field names
 */
function getFields(flatRecords, meta) {
  if (meta?.schema?.length) {
    return meta.schema.map((c) => c.name);
  }
  // Aggregate all keys across every record so sparse fields aren't dropped
  const keySet = new Set();
  flatRecords.forEach((rec) => Object.keys(rec).forEach((k) => keySet.add(k)));
  return Array.from(keySet);
}

// ─── Raw Record Fetch & Flatten ───────────────────────────────────────────────
async function getRecords(datasetId) {
  const records = await CleanRecord.find({ datasetId }).lean();
  // Flatten each record's .data payload so nested fields become dot-notation columns
  return records.map((r) => flattenObject(r.data || {}));
}

// ─── CSV (#104) ───────────────────────────────────────────────────────────────
async function exportCSV(req, res) {
  try {
    const { datasetId } = req.params;
    const flatRecords = await getRecords(datasetId);
    if (!flatRecords.length) return res.status(404).json({ error: "No records found." });

    const meta = await Metadata.findOne({ datasetId }).lean();
    const fields = getFields(flatRecords, meta);

    // json2csv Parser: fields drives the column order and header names
    const parser = new CsvParser({ fields, defaultValue: "" });
    const csv = parser.parse(flatRecords);

    await ExportLog.create({
      datasetId,
      format: "csv",
      exportedBy: req.user?.id || "anonymous",
      recordCount: flatRecords.length,
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="export_${datasetId}_${Date.now()}.csv"`
    );
    return res.send(csv);
  } catch (err) {
    logger.error(`CSV export failed: ${err.message}`, "exportCSV");
    res.status(500).json({ error: "CSV export failed.", details: err.message });
  }
}

// ─── Excel / XLSX (#105 & #106) ───────────────────────────────────────────────
async function exportExcel(req, res) {
  try {
    const { datasetId } = req.params;
    const flatRecords = await getRecords(datasetId);
    if (!flatRecords.length) return res.status(404).json({ error: "No records found." });

    const meta = await Metadata.findOne({ datasetId }).lean();
    const fields = getFields(flatRecords, meta);

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Analytics BI";
    workbook.created = new Date();

    // ── Data Sheet ──
    const sheet = workbook.addWorksheet("Data", {
      views: [{ state: "frozen", ySplit: 1 }],
    });

    // Map schema type -> ExcelJS numFmt for correct cell formatting in Excel
    const typeMap = {};
    if (meta?.schema?.length) {
      meta.schema.forEach((c) => {
        typeMap[c.name] = c.type?.toLowerCase() || "string";
      });
    }

    // Compute column widths: max of header length or longest value (capped at 60)
    const colWidths = {};
    fields.forEach((f) => {
      let maxLen = f.length + 4;
      flatRecords.forEach((rec) => {
        const v = rec[f];
        if (v != null) maxLen = Math.max(maxLen, String(v).length + 2);
      });
      colWidths[f] = Math.min(Math.max(maxLen, 14), 60);
    });

    sheet.columns = fields.map((f) => ({
      header: f,
      key: f,
      width: colWidths[f],
    }));

    // Header row styling
    const headerRow = sheet.getRow(1);
    headerRow.height = 28;
    headerRow.eachCell((cell) => {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF1E3A5F" },
      };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11, name: "Calibri" };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: false };
      cell.border = {
        bottom: { style: "medium", color: { argb: "FF2C5282" } },
      };
    });

    // Data rows — pass flat record keyed by field name
    flatRecords.forEach((rec, i) => {
      // Build an ordered value array matching sheet.columns key order
      const rowData = {};
      fields.forEach((f) => {
        const raw = rec[f];
        const t = typeMap[f];
        // Coerce types for correct Excel cell types
        if (raw == null) {
          rowData[f] = "";
        } else if ((t === "number" || t === "integer" || t === "float") && !isNaN(Number(raw))) {
          rowData[f] = Number(raw);
        } else if (t === "date" || t === "datetime") {
          const d = new Date(raw);
          rowData[f] = isNaN(d.getTime()) ? String(raw) : d;
        } else if (t === "boolean") {
          rowData[f] = raw === true || raw === "true" || raw === 1 ? true : false;
        } else {
          rowData[f] = String(raw);
        }
      });

      const row = sheet.addRow(rowData);
      row.height = 18;
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: i % 2 === 0 ? "FFF5F7FA" : "FFFFFFFF" },
        };
        cell.border = {
          bottom: { style: "thin", color: { argb: "FFE2E8F0" } },
          right: { style: "thin", color: { argb: "FFE2E8F0" } },
        };
        cell.alignment = { vertical: "middle", horizontal: "left" };
        cell.font = { name: "Calibri", size: 10 };
      });
    });

    // Auto-filter on header row
    sheet.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: fields.length },
    };

    // ── Schema Sheet (when metadata available) ──
    if (meta?.schema?.length) {
      const schemaSheet = workbook.addWorksheet("Schema");
      schemaSheet.columns = [
        { header: "Column", key: "name", width: 26 },
        { header: "Type", key: "type", width: 16 },
        { header: "Role", key: "role", width: 16 },
        { header: "Nullable", key: "nullable", width: 12 },
      ];
      const schemaHeader = schemaSheet.getRow(1);
      schemaHeader.height = 22;
      schemaHeader.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF2C5282" } };
        cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 10 };
        cell.alignment = { vertical: "middle", horizontal: "center" };
      });
      meta.schema.forEach((col, i) => {
        const row = schemaSheet.addRow(col);
        row.eachCell({ includeEmpty: true }, (cell) => {
          cell.fill = {
            type: "pattern",
            pattern: "solid",
            fgColor: { argb: i % 2 === 0 ? "FFF0F4FF" : "FFFFFFFF" },
          };
          cell.font = { name: "Calibri", size: 10 };
          cell.alignment = { vertical: "middle" };
        });
      });
    }

    await ExportLog.create({
      datasetId,
      format: "xlsx",
      exportedBy: req.user?.id || "anonymous",
      recordCount: flatRecords.length,
    });

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="export_${datasetId}_${Date.now()}.xlsx"`
    );
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    logger.error(`Excel export failed: ${err.message}`, "exportExcel");
    res.status(500).json({ error: "Excel export failed.", details: err.message });
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function exportPDF(req, res) {
  try {
    const { datasetId } = req.params;
    const flatRecords = await getRecords(datasetId);
    if (!flatRecords.length) return res.status(404).json({ error: "No records found." });

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="export_${datasetId}_${Date.now()}.pdf"`
    );
    doc.pipe(res);

    const meta = await Metadata.findOne({ datasetId }).lean();
    const fields = getFields(flatRecords, meta);

    // Header banner
    doc.rect(0, 0, doc.page.width, 60).fill("#1E3A5F");
    doc.fillColor("#FFFFFF").fontSize(18).font("Helvetica-Bold").text("Analytics BI — Export", 40, 18);
    doc.fillColor("#94B8D8").fontSize(10).text(
      `Dataset: ${datasetId}  |  ${new Date().toLocaleString()}`,
      40,
      40
    );

    const colWidth = Math.min(120, (doc.page.width - 80) / (fields.length || 1));
    let y = 80;
    const rowH = 20;

    // Column headers
    doc.rect(40, y, doc.page.width - 80, rowH).fill("#2C5282");
    doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
    fields.forEach((f, i) =>
      doc.text(f.substring(0, 14), 44 + i * colWidth, y + 6, {
        width: colWidth - 4,
        ellipsis: true,
        lineBreak: false,
      })
    );
    y += rowH;

    // Data rows (max 200 for PDF)
    flatRecords.slice(0, 200).forEach((rec, idx) => {
      if (y + rowH > doc.page.height - 40) {
        doc.addPage({ layout: "landscape" });
        y = 40;
      }
      doc.rect(40, y, doc.page.width - 80, rowH).fill(idx % 2 === 0 ? "#F7FAFC" : "#FFFFFF");
      doc.fillColor("#2D3748").fontSize(7).font("Helvetica");
      fields.forEach((f, i) =>
        doc.text(
          String(rec[f] ?? "").substring(0, 18),
          44 + i * colWidth,
          y + 6,
          { width: colWidth - 4, ellipsis: true, lineBreak: false }
        )
      );
      y += rowH;
    });

    if (flatRecords.length > 200) {
      doc
        .moveDown(1)
        .fillColor("#718096")
        .fontSize(9)
        .text(`…and ${flatRecords.length - 200} more rows (PDF capped at 200).`, 40, y + 8);
    }

    doc.end();
    await ExportLog.create({
      datasetId,
      format: "pdf",
      exportedBy: req.user?.id || "anonymous",
      recordCount: Math.min(flatRecords.length, 200),
    });
  } catch (err) {
    logger.error(`PDF export failed: ${err.message}`, "exportPDF");
    res.status(500).json({ error: "PDF export failed.", details: err.message });
  }
}

// ─── Export Log ───────────────────────────────────────────────────────────────
async function getExportLog(req, res) {
  try {
    const logs = await ExportLog.find({ datasetId: req.params.datasetId })
      .sort({ exportedAt: -1 })
      .limit(50)
      .lean();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch export log." });
  }
}

// ─── Embed Token ──────────────────────────────────────────────────────────────
async function generateEmbedToken(req, res) {
  try {
    const { datasetId, dashboardId } = req.body;
    const token = Buffer.from(
      JSON.stringify({ datasetId, dashboardId, iat: Date.now(), exp: Date.now() + 86400000 })
    ).toString("base64url");
    const embedUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/embed/${dashboardId}?token=${token}`;
    const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
    res.json({ token, embedUrl, iframeSnippet });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate embed token." });
  }
}

module.exports = { exportCSV, exportExcel, exportPDF, getExportLog, generateEmbedToken };