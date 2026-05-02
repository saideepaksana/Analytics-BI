/**
 * PuppeteerService.js
 * 
 * Manages a singleton Puppeteer browser instance and controls concurrency.
 * This prevents server crashes from spawning too many Chrome processes.
 */

const puppeteer = require("puppeteer");
const logger = require("../../../core/logger");

class PuppeteerService {
    constructor() {
        this.browser = null;
        this.concurrencyLimit = 2;
        this.activeCount = 0;
        this.queue = [];
        this.jobsHandled = 0;
        this.MAX_JOBS_PER_BROWSER = 50;
    }

    async getBrowser() {
        if (!this.browser) {
            logger.info("Launching shared Puppeteer browser instance...", "PuppeteerService");
            this.browser = await puppeteer.launch({
                headless: "new",
                args: [
                    "--no-sandbox", 
                    "--disable-setuid-sandbox", 
                    "--disable-dev-shm-usage",
                    "--disable-gpu",
                    "--disable-software-rasterizer",
                    "--disable-features=AudioServiceOutOfProcess",
                    "--mute-audio",
                    "--no-zygote"
                ]
            });
            
            // Re-launch on disconnect
            this.browser.on("disconnected", () => {
                logger.warn("Puppeteer browser disconnected. Resetting instance.", "PuppeteerService");
                this.browser = null;
            });
        }
        return this.browser;
    }

    async acquirePage() {
        return new Promise(async (resolve, reject) => {
            const execute = async () => {
                this.activeCount++;
                try {
                    this.jobsHandled++;
                    if (this.jobsHandled > this.MAX_JOBS_PER_BROWSER) {
                        logger.info("Browser reached job limit. Recycling instance...", "PuppeteerService");
                        await this.close();
                        this.jobsHandled = 1;
                    }
                    
                    const browser = await this.getBrowser();
                    const page = await browser.newPage();
                    resolve(page);
                } catch (err) {
                    this.activeCount--;
                    reject(err);
                }
            };

            if (this.activeCount < this.concurrencyLimit) {
                await execute();
            } else {
                logger.info("Concurrency limit reached. Queueing export request.", "PuppeteerService");
                this.queue.push(execute);
            }
        });
    }

    releasePage(page) {
        if (page) {
            page.close().catch(() => {});
        }
        this.activeCount--;
        if (this.queue.length > 0) {
            const next = this.queue.shift();
            next();
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
            this.browser = null;
        }
    }
}

module.exports = new PuppeteerService();
