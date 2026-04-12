const logger = require("../../core/logger");

/**
 * POST /api/ai/parse-text
 * Parses raw text to extract schema suggestions
 */
exports.parseText = async (req, res) => {
  try {
    const { text, fileUrl } = req.body;

    if (!text && !fileUrl) {
      return res.status(400).json({
        message: "Either 'text' or 'fileUrl' must be provided"
      });
    }

    // For now, return a basic schema suggestion
    // TODO: Integrate with LLM for enhanced parsing
    const suggestedSchema = extractBasicSchema(text || "");

    return res.json({
      message: "Text parsed successfully",
      suggestedSchema,
      confidence: 0.8,
      parsingMethod: "basic"
    });
  } catch (error) {
    logger.error(`parseText error: ${error.message}`, "AI");
    return res.status(500).json({ message: "Internal server error" });
  }
};

/**
 * Basic schema extraction from text
 * This is a placeholder - should be replaced with LLM integration
 */
const extractBasicSchema = (text) => {
  const lines = text.split('\n').filter(line => line.trim());
  const columns = [];

  if (lines.length === 0) return columns;

  // Assume first line is headers
  const headers = lines[0].split(',').map(h => h.trim());

  headers.forEach(header => {
    columns.push({
      name: header,
      type: 'string', // Basic assumption
      confidence: 0.5
    });
  });

  return columns;
};