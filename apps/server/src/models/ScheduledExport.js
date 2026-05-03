const mongoose = require("mongoose");
const { Schema } = mongoose;

const ScheduledExportSchema = new Schema(
    {
        dashboardId: { type: Schema.Types.ObjectId, ref: "Dashboard", required: true },
        userId: { type: String, required: true },
        name: { type: String, required: true, trim: true },
        frequency: { 
            type: String, 
            enum: ["daily", "weekly", "monthly", "test"], 
            required: true 
        },
        format: { type: String, enum: ["pdf", "png"], default: "pdf" },
        selectedTabs: { type: [String], default: [] },
        recipients: { type: [String], default: [] },
        timezone: { type: String, default: "UTC" },
        status: { type: String, enum: ["active", "paused"], default: "active" },
        lastRunAt: { type: Date, default: null },
        nextRunAt: { type: Date, default: null },
        // Store the repeatJobKey from BullMQ to manage/cancel the repeatable job
        repeatJobKey: { type: String, default: null },
    },
    { timestamps: true }
);

ScheduledExportSchema.index({ dashboardId: 1 });
ScheduledExportSchema.index({ userId: 1 });
ScheduledExportSchema.index({ status: 1 });

module.exports = mongoose.model("ScheduledExport", ScheduledExportSchema);
