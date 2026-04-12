const express = require("express");
const router = express.Router();
const { parseText } = require("./ai.controller");

router.post("/parse-text", parseText);

module.exports = router;