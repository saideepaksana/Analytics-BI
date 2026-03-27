const { ExportLog } = require("../../models/exportLog");
const { CleanRecord } = require("../../models/CleanRecord");
const { Metadata } = require("../../models/Metadata");
const ExcelJS = require("exceljs");
const { Parser: CsvParser } = require("json2csv");
const PDFDocument = require("pdfkit");

// ─── Helper ───────────────────────────────────────────────────────────────────
async function getRecords(datasetId) {
  return CleanRecord.find({ datasetId }).lean();
}

// ─── CSV ──────────────────────────────────────────────────────────────────────
async function exportCSV(req, res) {
  try {
    const { datasetId } = req.params;
    const records = await getRecords(datasetId);
    if (!records.length) return res.status(404).json({ error: "No records found." });

    const fields = Object.keys(records[0]).filter((k) => k !== "_id" && k !== "__v");
    const csv = new CsvParser({ fields }).parse(records);

    await ExportLog.create({ datasetId, format: "csv", exportedBy: req.user?.id || "anonymous", recordCount: records.length });

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="export_${datasetId}_${Date.now()}.csv"`);
    return res.send(csv);
  } catch (err) {
    console.error("[exportCSV]", err);
    res.status(500).json({ error: "CSV export failed.", details: err.message });
  }
}

// ─── Excel ────────────────────────────────────────────────────────────────────
async function exportExcel(req, res) {
  try {
    const { datasetId } = req.params;
    const records = await getRecords(datasetId);
    const meta = await Metadata.findOne({ datasetId }).lean();
    if (!records.length) return res.status(404).json({ error: "No records found." });

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "Analytics BI";
    const sheet = workbook.addWorksheet("Data", { views: [{ state: "frozen", ySplit: 1 }] });

    const fields = Object.keys(records[0]).filter((k) => k !== "_id" && k !== "__v");
    sheet.columns = fields.map((f) => ({ header: f, key: f, width: Math.max(f.length + 4, 16) }));

    sheet.getRow(1).eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E3A5F" } };
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });
    sheet.getRow(1).height = 28;

    records.forEach((rec, i) => {
      const row = sheet.addRow(rec);
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: i % 2 === 0 ? "FFF5F7FA" : "FFFFFFFF" } };
        cell.border = { bottom: { style: "thin", color: { argb: "FFE2E8F0" } } };
      });
    });

    if (meta?.schema?.length) {
      const schemaSheet = workbook.addWorksheet("Schema");
      schemaSheet.columns = [
        { header: "Column", key: "name", width: 22 },
        { header: "Type", key: "type", width: 14 },
        { header: "Role", key: "role", width: 14 },
      ];
      schemaSheet.getRow(1).font = { bold: true };
      meta.schema.forEach((col) => schemaSheet.addRow(col));
    }

    await ExportLog.create({ datasetId, format: "xlsx", exportedBy: req.user?.id || "anonymous", recordCount: records.length });

    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="export_${datasetId}_${Date.now()}.xlsx"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error("[exportExcel]", err);
    res.status(500).json({ error: "Excel export failed.", details: err.message });
  }
}

// ─── PDF ──────────────────────────────────────────────────────────────────────
async function exportPDF(req, res) {
  try {
    const { datasetId } = req.params;
    const records = await getRecords(datasetId);
    if (!records.length) return res.status(404).json({ error: "No records found." });

    const doc = new PDFDocument({ margin: 40, size: "A4", layout: "landscape" });
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="export_${datasetId}_${Date.now()}.pdf"`);
    doc.pipe(res);

    doc.rect(0, 0, doc.page.width, 60).fill("#1E3A5F");
    doc.fillColor("#FFFFFF").fontSize(18).font("Helvetica-Bold").text("Analytics BI — Export", 40, 18);
    doc.fillColor("#94B8D8").fontSize(10).text(`Dataset: ${datasetId}  |  ${new Date().toLocaleString()}`, 40, 40);
    doc.moveDown(3);

    const fields = Object.keys(records[0]).filter((k) => k !== "_id" && k !== "__v");
    const colWidth = Math.min(120, (doc.page.width - 80) / fields.length);
    let y = 80;
    const rowH = 20;

    doc.rect(40, y, doc.page.width - 80, rowH).fill("#2C5282");
    doc.fillColor("#FFFFFF").fontSize(8).font("Helvetica-Bold");
    fields.forEach((f, i) => doc.text(f.substring(0, 14), 44 + i * colWidth, y + 6, { width: colWidth - 4, ellipsis: true }));
    y += rowH;

    records.slice(0, 200).forEach((rec, idx) => {
      if (y + rowH > doc.page.height - 40) { doc.addPage({ layout: "landscape" }); y = 40; }
      doc.rect(40, y, doc.page.width - 80, rowH).fill(idx % 2 === 0 ? "#F7FAFC" : "#FFFFFF");
      doc.fillColor("#2D3748").fontSize(7).font("Helvetica");
      fields.forEach((f, i) => doc.text(String(rec[f] ?? "").substring(0, 18), 44 + i * colWidth, y + 6, { width: colWidth - 4, ellipsis: true }));
      y += rowH;
    });

    if (records.length > 200) doc.moveDown(1).fillColor("#718096").fontSize(9).text(`…and ${records.length - 200} more rows.`, 40, y + 8);

    doc.end();
    await ExportLog.create({ datasetId, format: "pdf", exportedBy: req.user?.id || "anonymous", recordCount: Math.min(records.length, 200) });
  } catch (err) {
    console.error("[exportPDF]", err);
    res.status(500).json({ error: "PDF export failed.", details: err.message });
  }
}

// ─── Export Log ───────────────────────────────────────────────────────────────
async function getExportLog(req, res) {
  try {
    const logs = await ExportLog.find({ datasetId: req.params.datasetId }).sort({ exportedAt: -1 }).limit(50).lean();
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch export log." });
  }
}

// ─── Embed Token ──────────────────────────────────────────────────────────────
async function generateEmbedToken(req, res) {
  try {
    const { datasetId, dashboardId } = req.body;
    const token = Buffer.from(JSON.stringify({ datasetId, dashboardId, iat: Date.now(), exp: Date.now() + 86400000 })).toString("base64url");
    const embedUrl = `${process.env.CLIENT_URL || "http://localhost:5173"}/embed/${dashboardId}?token=${token}`;
    const iframeSnippet = `<iframe src="${embedUrl}" width="100%" height="600" frameborder="0" allowfullscreen></iframe>`;
    res.json({ token, embedUrl, iframeSnippet });
  } catch (err) {
    res.status(500).json({ error: "Failed to generate embed token." });
  }
}

module.exports = { exportCSV, exportExcel, exportPDF, getExportLog, generateEmbedToken };