const mongoose = require("mongoose");
const { Schema } = mongoose;

// Describes a single column inferred from an uploaded dataset
const ColumnSchema = new Schema({
    name: { type: String, required: true },
    type: {
        type: String,
        enum: ['string', 'integer', 'decimal', 'boolean', 'timestamp', 'unknown'],
        default: 'unknown'
    },
    role: {
        type: String,
        enum: ['dimension', 'measure', 'attribute'],
        default: 'attribute'
    },
    nullable: { type: Boolean, default: true },
    primaryKey: { type: Boolean, default: false },
    foreignKey: { type: Boolean, default: false },
    description: { type: String, default: '' }
}, { _id: false });

// Top-level metadata document for a dataset
const MetadataSchema = new Schema({
    datasetId: { type: String, required: true, unique: true, index: true },
    fileName: { type: String, required: true },
    rowCount: { type: Number, default: 0 },
    columnCount: { type: Number, default: 0 },
    uploadMode: {
        type: String,
        enum: ['new', 'append', 'replace'],
        default: 'new'
    },
    columns: [ColumnSchema],
    uploadedAt: { type: Date, default: Date.now },
    updatedAt: { type: Date, default: Date.now }
});

MetadataSchema.pre('save', function (next) {
    this.updatedAt = new Date();
    next();
});

const Metadata = mongoose.model('Metadata', MetadataSchema);
module.exports = Metadata;
