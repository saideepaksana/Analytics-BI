require("dotenv").config();
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const connectDB = require("./core/db");
const { initStorage } = require("./core/storage");
const uploadRoutes = require("./api/upload/upload.routes");
const datasetsRoutes = require("./api/query/datasets.routes");

const app = express();

connectDB();

//start GridFS AFTER DB connects
mongoose.connection.once("open", () => {
  initStorage();
});

//middleware
app.use(cors());
app.use(express.json());

//Routes
app.use("/api/upload", uploadRoutes);
app.use("/api/datasets", datasetsRoutes);

//check server status
app.get("/", (req, res) => {
  res.send("Analytics BI Server is Running!!");
});

//Start the server
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});