const mongoose = require('mongoose');
const { Schema } = mongoose;

const CleanRecordSchema = new Schema({
    price: {
        type: Number,
        required: true
    },
    productName: {
        type: String,
        required: true
    }
});

const CleanRecord = mongoose.model('CleanRecord', CleanRecordSchema);
module.exports = CleanRecord;