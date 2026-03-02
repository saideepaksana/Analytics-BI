const mongoose = require("mongoose");
const { GridFSBucket } = require("mongodb");
let bucket;
const initStorage = () => {
  const db = mongoose.connection.db;
  bucket = new GridFSBucket(db, {
    bucketName: "uploads"
  });
  console.log("GridFS Initialized");
};
const getBucket = () => bucket;
module.exports = { initStorage, getBucket };
