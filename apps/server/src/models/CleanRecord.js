import mongoose from 'mongoose';
const {Schema} = mongoose;


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
export default CleanRecord;