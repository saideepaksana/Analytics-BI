const mongoose = require("mongoose");
const CleanRecord = require("./apps/server/src/models/CleanRecord");
require("dotenv").config({ path: "./apps/server/.env" });

async function run() {
  await mongoose.connect(process.env.MONGO_URI || "mongodb://localhost:27017/analytics-bi");
  const datasetId = "test-dataset-bulk";
  await CleanRecord.deleteMany({ datasetId });
  
  const docs = [
    { datasetId, rowNumber: 1, data: { a: 1 }, sourceFileName: "a", status: "VALID" },
    { datasetId, rowNumber: 2, data: { a: 2 }, sourceFileName: "a", status: "VALID" }
  ];
  
  // First insert
  await CleanRecord.insertMany(docs, { ordered: false });
  console.log("First insert success");
  
  // Second insert (idempotency test)
  const docs2 = [
    { datasetId, rowNumber: 2, data: { a: 2 }, sourceFileName: "a", status: "VALID" },
    { datasetId, rowNumber: 3, data: { a: 3 }, sourceFileName: "a", status: "VALID" }
  ];
  
  try {
    await CleanRecord.insertMany(docs2, { ordered: false });
  } catch (err) {
    console.log("Error code:", err.code);
    console.log("Is MongoBulkWriteError:", err.name === 'MongoBulkWriteError');
    if (err.writeErrors) {
      console.log("Write errors code:", err.writeErrors[0].code);
    }
  }
  
  const count = await CleanRecord.countDocuments({ datasetId });
  console.log("Total docs:", count); // should be 3
  
  await mongoose.disconnect();
}
run().catch(console.error);
