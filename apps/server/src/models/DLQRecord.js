import mongoose from "mongoose";
const { Schema } = mongoose;

const DLQRecordSchema = new Schema({
    datasetId: {
        type: String,
        required: true
    },
    rawData: {
        type: Schema.Types.Mixed,
        required: true
    }, 
    error: {
        type: String,
        required: true
    },
    status: {
        type: String,
        default: 'UNFIXABLE'
    }
});

const DLQRecord = mongoose.model('DLQRecord', DLQRecordSchema);
export default DLQRecord;