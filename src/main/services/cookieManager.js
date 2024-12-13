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

        try {
            console.info('Initializing Puppeteer Cluster...');
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
                console.info(`Navigating to URL: ${url}`);
                await page.goto(url, { waitUntil: 'networkidle2' });
                const cookies = await page.cookies();
                console.info(`Cookies fetched for URL: ${url}`);
                return cookies;
            });

            console.info('Puppeteer Cluster initialized successfully.');
            return this.cluster;
        } catch (error) {
            console.error('Error initializing Puppeteer Cluster:', error);
            throw error;
        }
    }

    async fetchCookies(url) {
        try {
            const cluster = await this.initializeCluster();
            console.info(`Fetching cookies for URL: ${url}`);
            const cookies = await cluster.execute({ url });
            console.info(`Fetched ${cookies.length} cookies for URL: ${url}`);
            return cookies;
        } catch (error) {
            console.error(`Error fetching cookies for URL (${url}):`, error);
            throw error;
        }
    }

    saveCookiesToFile(cookies, outputDir = 'cookies') {
        try {
            if (!fs.existsSync(outputDir)) {
                fs.mkdirSync(outputDir, { recursive: true });
            }

            const filePath = path.join(outputDir, `cookies_${Date.now()}.json`);
            fs.writeFileSync(filePath, JSON.stringify(cookies, null, 2));
            console.info(`Cookies saved to file: ${filePath}`);
            return filePath;
        } catch (error) {
            console.error('Error saving cookies to file:', error);
            throw error;
        }
    }

    async cleanup() {
        if (this.cluster) {
            try {
                console.info('Closing Puppeteer Cluster...');
                await this.cluster.idle();
                await this.cluster.close();
                this.cluster = null;
                console.info('Puppeteer Cluster closed successfully.');
            } catch (error) {
                console.error('Error closing Puppeteer Cluster:', error);
                throw error;
            }
        }
    }
}

module.exports = new CookieManager();
