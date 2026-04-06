const mongoose = require("mongoose");

const IdempotencySchema = new mongoose.Schema(
  {
    key: { type: String, required: true, unique: true, index: true },
    requestPath: { type: String },
    requestMethod: { type: String },
    responseStatus: { type: Number },
    responseBody: { type: mongoose.Schema.Types.Mixed },
    expiresAt: { type: Date, required: true, index: { expires: 0 } },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Idempotency", IdempotencySchema);
