const mongoose = require("mongoose");
const logger = require("./logger");

const connectDB = async () => {
  let mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/analytics-bi";
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 2000 });
    logger.success("MongoDB Connected", "DB");
  } catch (err) {
    logger.warn(`Database connection failed: ${err.message}. Falling back to in-memory MongoDB...`, "DB");
    try {
      // Lazy load only on failure
      const { MongoMemoryServer } = require("mongodb-memory-server");
      const mongoServer = await MongoMemoryServer.create();
      mongoUri = mongoServer.getUri();
      mongoose.disconnect(); // clean up failed detached state
      await mongoose.connect(mongoUri);
      logger.success("In-Memory MongoDB Connected at " + mongoUri, "DB");
    } catch (memErr) {
      logger.error(`Fallback In-Memory DB failed: ${memErr.message}`, "DB");
      logger.error(
        "Server will stay up, but data APIs will return 503 until MongoDB is available.",
        "DB"
      );
    }
  }
};

module.exports = connectDB;
