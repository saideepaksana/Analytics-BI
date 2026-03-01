const path = require("path");

function fileFilter(req, file, cb) {
  const allowedExtensions = [".csv", ".xls", ".xlsx"];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedExtensions.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error("Invalid file type. Only CSV and Excel allowed."));
  }
}

module.exports = fileFilter;
