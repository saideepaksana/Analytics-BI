# Testing Guide: Scheduled Dashboard Exports & Emailing

This guide explains how to verify the end-to-end flow of automated dashboard snapshots and email deliveries.

## 1. Prerequisites

### Environment Setup
Ensure your `apps/server/.env` file is configured with SMTP credentials. 

#### How to get Test Credentials (Ethereal)
If you don't have an SMTP server, you can generate free temporary credentials using this command:

```bash
node -e 'const nodemailer = require("nodemailer"); nodemailer.createTestAccount().then(acc => console.log(acc))'
```

1. Run the command above.
2. Copy the `user` and `pass` from the output.
3. Update your `.env` file as shown below:

```env
# apps/server/.env
EMAIL_ENABLED=true
EMAIL_FROM="Analytics BI <noreply@analytics-bi.com>"
SMTP_HOST=smtp.ethereal.email
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_user_from_command
SMTP_PASS=your_pass_from_command
```

> **Important**: You must restart the server (`npm run dev`) after updating the `.env` file.

### Infrastructure
Ensure **Redis** is running, as it is required by BullMQ to handle the scheduling logic.

---

## 2. Testing Steps

### Step A: Create a Schedule
1.  Open the Analytics BI dashboard in your browser.
2.  Click **Export** -> **Schedule Delivery**.
3.  Fill out the form:
    *   **Frequency**: Select `Test (Every minute)` for immediate results.
    *   **Format**: Choose `PDF` or `PNG`.
    *   **Recipients**: Enter one or more email addresses (e.g., `test@example.com`). **This is required for emailing to trigger.**
4.  Click **Create Schedule**.

### Step B: Monitor Logs
Watch the server terminal for the following sequence:

1.  **Job Triggered**:  
    `[INFO] [ScheduledExportWorker] Starting scheduled export for dashboard...`
2.  **Snapshot Success**:  
    `[SUCCESS] [ScheduledExportWorker] Scheduled export completed: dashboard_...pdf`
3.  **Email Success**:  
    `[INFO] [EmailService] Email sent to test@example.com: <message-id>`

### Step C: Verify Results
1.  **Check Filesystem**:  
    Run `ls /tmp/analytics-bi/exports/visual` to see the generated PDF/PNG files.
2.  **Check Email**:  
    Login to [ethereal.email/messages](https://ethereal.email/messages) using your test credentials. You should see the email with the dashboard file attached.

---

## 3. Troubleshooting

| Issue | Potential Cause |
| :--- | :--- |
| **Export runs but no email is sent** | Check if `EMAIL_ENABLED=true` in `.env`. Ensure you added recipients in the UI modal. |
| **No logs appear at all** | Ensure Redis is running. Check if the job is listed in the `ScheduledExport` MongoDB collection. |
| **"Schedule not found" in logs** | You may have deleted the schedule in the UI while it was being processed. |
| **SMTP Authentication Error** | Double-check your `SMTP_USER` and `SMTP_PASS` in the `.env` file. |

---

## 4. Useful Commands

**Check schedules in Database:**
```bash
source .env && node -e 'const mongoose = require("mongoose"); require("./src/models/ScheduledExport"); mongoose.connect(process.env.MONGO_URI).then(async () => { console.log(await mongoose.model("ScheduledExport").find()); process.exit(); })'
```

**Clean up local test exports:**
```bash
rm -rf /tmp/analytics-bi/exports/visual/*
```
