require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const connectDB = require("./config/db");
const { initGridFS } = require("./utils/gridfs");

const app = express();
// Connect to MongoDB
connectDB();
mongoose.connection.once("open", () => {
  initGridFS();
});

app.use(cors());
app.use(express.json());

const uploadRoutes = require("./routes/upload.routes");
app.use("/api", uploadRoutes);

app.get("/", (req, res) => {
  res.send("Backend Running");
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
