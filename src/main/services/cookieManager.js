const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Cluster } = require('puppeteer-cluster');
const fs = require('fs');
const path = require('path');

// Initialize stealth plugin
puppeteer.use(StealthPlugin());

class CookieManager {
    constructor(config = {}) {
        this.config = {
            maxConcurrency: config.maxConcurrency || 1,
            maxRetries: config.maxRetries || 3,
            timeout: config.timeout || 30000,
        };
        this.cluster = null;
    }

    async initializeCluster() {
        if (this.cluster) return this.cluster; // Return existing cluster if already initialized

        this.cluster = await Cluster.launch({
            puppeteer,
            concurrency: Cluster.CONCURRENCY_CONTEXT,
            maxConcurrency: this.config.maxConcurrency,
            timeout: this.config.timeout,
            puppeteerOptions: {
                headless: true,
                args: [
                    '--disable-gpu',
                    '--disable-software-rasterizer',
                    '--no-sandbox',
                    '--disable-setuid-sandbox',
                    '--disable-dev-shm-usage',
                ],
            },
            retryLimit: this.config.maxRetries,
        });

        // Define a task for fetching cookies
        this.cluster.task(async ({ page, data: { url } }) => {
            await page.goto(url, { waitUntil: 'networkidle2' });
            return await page.cookies();
        });

        return this.cluster;
    }

    async fetchCookies(url) {
        try {
            const cluster = await this.initializeCluster();
            const cookies = await cluster.execute({ url });
            return cookies;
        } catch (error) {
            console.error('Error fetching cookies:', error);
            throw error;
        }
    }

    saveCookiesToFile(cookies, outputDir = 'cookies') {
        if (!fs.existsSync(outputDir)) {
            fs.mkdirSync(outputDir, { recursive: true });
        }

        const filePath = path.join(outputDir, `cookies_${Date.now()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
        return filePath;
    }

    async cleanup() {
        if (this.cluster) {
            await this.cluster.idle();
            await this.cluster.close();
            this.cluster = null;
        }
    }
}

module.exports = new CookieManager();
