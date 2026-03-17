const mongoose = require("mongoose");

const connectDB = async () => {
  try {
<<<<<<< HEAD
    const mongoUri = process.env.MONGO_URI || "mongodb://127.0.0.1:27017/analytics-bi";
    await mongoose.connect(mongoUri);
=======
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI not defined in environment");
    }

    await mongoose.connect(process.env.MONGO_URI);

>>>>>>> 482fe8d (validate environment configuration and improve connection handling)
    console.log("MongoDB Connected");
  } catch (err) {
    console.error("Database connection failed:", err.message);
    console.error("Server will stay up, but data APIs will return 503 until MongoDB is available.");
  }
};

<<<<<<< HEAD
module.exports = connectDB;
=======
module.exports = connectDB;
>>>>>>> 482fe8d (validate environment configuration and improve connection handling)
