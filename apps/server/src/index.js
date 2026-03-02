require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./core/db");
const { initStorage } = require("./core/storage");
const uploadRoutes = require("./api/upload/upload.routes");
const app = express();
connectDB();
mongoose.connection.once("open", () => {
  initStorage();
});
app.use(cors());
app.use(express.json());
app.use("/api/upload", uploadRoutes);
app.get("/", (req, res) => {
  res.send("Analytics BI Server is Running!!");
});
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
