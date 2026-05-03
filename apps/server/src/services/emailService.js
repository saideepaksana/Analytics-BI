const nodemailer = require("nodemailer");
const logger = require("../core/logger");

/**
 * Service for sending emails, supporting attachments.
 * Uses SMTP configuration from environment variables.
 */
class EmailService {
    constructor() {
        this.enabled = process.env.EMAIL_ENABLED === "true";
        
        if (this.enabled) {
            this.transporter = nodemailer.createTransport({
                host: process.env.SMTP_HOST,
                port: parseInt(process.env.SMTP_PORT || "587"),
                secure: process.env.SMTP_SECURE === "true",
                auth: {
                    user: process.env.SMTP_USER,
                    pass: process.env.SMTP_PASS,
                },
            });
        }
    }

    /**
     * Send an email.
     * @param {Object} options
     * @param {string|string[]} options.to
     * @param {string} options.subject
     * @param {string} options.text
     * @param {string} [options.html]
     * @param {Array} [options.attachments]
     */
    async sendMail({ to, subject, text, html, attachments }) {
        if (!this.enabled) {
            logger.warn(`Email service is disabled. Would have sent email to ${to} with subject "${subject}"`, "EmailService");
            return { sent: false, reason: "disabled" };
        }

        try {
            const info = await this.transporter.sendMail({
                from: process.env.EMAIL_FROM || '"Analytics BI" <noreply@analytics-bi.com>',
                to,
                subject,
                text,
                html,
                attachments,
            });

            logger.info(`Email sent to ${to}: ${info.messageId}`, "EmailService");
            return { sent: true, messageId: info.messageId };
        } catch (err) {
            logger.error(`Failed to send email to ${to}: ${err.message}`, "EmailService");
            throw err;
        }
    }
}

module.exports = new EmailService();
