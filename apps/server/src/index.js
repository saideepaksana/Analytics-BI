require("dotenv").config({ quiet: true });
const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const http = require("http");
const { Server } = require("socket.io");
const connectDB = require("./core/db");
const { initStorage } = require("./core/storage");
const uploadRoutes = require("./api/upload/upload.routes");
const datasetsRoutes = require("./api/query/datasets.routes");
const { setIO } = require("./core/socket");
const app = express();
const server = http.createServer(app);

connectDB();

//start GridFS AFTER DB connects
mongoose.connection.once("open", () => {
  initStorage();
});

//middleware
app.use(
  cors({
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  })
);
app.use(express.json());

const io = new Server(server, {
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    methods: ["GET", "POST"],
  },
});

setIO(io);

io.on("connection", (socket) => {
  socket.on("upload:subscribe", ({ uploadId } = {}) => {
    if (!uploadId || typeof uploadId !== "string") {
      return;
    }
    socket.join(`upload:${uploadId}`);
  });

  socket.on("upload:unsubscribe", ({ uploadId } = {}) => {
    if (!uploadId || typeof uploadId !== "string") {
      return;
    }
    socket.leave(`upload:${uploadId}`);
  });
});

//Routes
app.use("/api/upload", uploadRoutes);
app.use("/api/datasets", datasetsRoutes);

//check server status
app.get("/", (req, res) => {
  res.send("Analytics BI Server is Running!!");
});

//Start the server
const PORT = process.env.PORT || 5000;

server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
