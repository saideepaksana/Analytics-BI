const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");
const logger = require("./logger");

let bucket;

const initStorage = () => {
  const db = mongoose.connection.db;

  if (!db) {
    throw new Error("MongoDB connection not ready");
  }

  bucket = new GridFSBucket(db, {
    bucketName: "uploads",
  });

  logger.success("GridFS Initialized", "Storage");
};

const getBucket = () => {
  if (!bucket) {
    throw new Error("GridFS not initialized");
  }
  return bucket;
};

module.exports = { initStorage, getBucket };