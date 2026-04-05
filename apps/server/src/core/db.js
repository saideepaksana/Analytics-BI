const mongoose = require("mongoose");
const logger = require("./logger");

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/analytics-bi";
    await mongoose.connect(mongoUri);
    logger.success("MongoDB Connected", "DB");
  } catch (err) {
    logger.error(`Database connection failed: ${err.message}`, "DB");
    logger.error(
      "Server will stay up, but data APIs will return 503 until MongoDB is available.",
      "DB"
    );
  }
};

module.exports = connectDB;
