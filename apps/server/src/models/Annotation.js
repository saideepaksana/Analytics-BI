const mongoose = require('mongoose');
const { Schema } = mongoose;

const AnnotationSchema = new Schema({
  chartId: { type: Schema.Types.ObjectId, ref: 'Chart', required: false },
  dashboardId: { type: Schema.Types.ObjectId, ref: 'Dashboard', required: false },
  text: { type: String, required: true, trim: true },
  position: {
    // stored as percentages relative to the container (0-100)
    x: { type: Number, min: 0, max: 100, required: true },
    y: { type: Number, min: 0, max: 100, required: true },
  },
  authorId: { type: String, default: 'anonymous' },
  style: { type: Schema.Types.Mixed, default: {} },
}, { timestamps: true });

// At least one of chartId or dashboardId must be present
AnnotationSchema.pre('validate', function () {
  if (!this.chartId && !this.dashboardId) {
    this.invalidate('chartId', 'Annotation must reference a chartId or dashboardId');
  }
});

AnnotationSchema.index({ chartId: 1 });
AnnotationSchema.index({ dashboardId: 1 });

module.exports = mongoose.model('Annotation', AnnotationSchema);
