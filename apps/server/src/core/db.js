const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/analytics-bi";
    await mongoose.connect(mongoUri);
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("Database connection failed:", err.message);
    console.error("Server will stay up, but data APIs will return 503 until MongoDB is available.");
  }
};

module.exports = connectDB;
