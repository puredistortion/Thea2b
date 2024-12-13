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
        this.cluster = null; // Puppeteer Cluster instance
        this.isClusterInitialized = false; // Guard for initialization
    }

    async initializeCluster() {
        if (this.isClusterInitialized) {
            console.info('Puppeteer Cluster is already initialized.');
            return this.cluster;
        }

        try {
            console.info('Initializing Puppeteer Cluster...');
            this.cluster = await Cluster.launch({
                puppeteer,
                concurrency: Cluster.CONCURRENCY_CONTEXT,
                maxConcurrency: this.config.maxConcurrency,
                timeout: this.config.timeout,
                puppeteerOptions: {
                    headless: true, // Retain headless mode for efficiency
                    args: [
                        '--disable-gpu',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--no-zygote',
                        '--single-process',
                        '--disable-extensions',
                    ],
                },
                retryLimit: this.config.maxRetries,
            });

            // Define a task for fetching cookies
            this.cluster.task(async ({ page, data: { url } }) => {
                try {
                    console.info(`Navigating to URL: ${url}`);
                    await page.setUserAgent(
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
                    );
                    await page.goto(url, { waitUntil: 'networkidle2' });
                    const cookies = await page.cookies();
                    console.info(`Cookies fetched successfully for URL: ${url}`);
                    return cookies;
                } catch (error) {
                    console.error(`Error during cookie fetch for URL (${url}):`, error);
                    throw new Error(`Failed to fetch cookies for ${url}: ${error.message}`);
                }
            });

            console.info('Puppeteer Cluster initialized successfully.');
            this.isClusterInitialized = true; // Mark initialization as complete
            return this.cluster;
        } catch (error) {
            console.error('Error initializing Puppeteer Cluster:', error);
            throw error;
        }
    }

    async fetchCookies(url) {
        try {
            if (!this.isClusterInitialized) {
                throw new Error('Cluster is not initialized. Please initialize the cluster before fetching cookies.');
            }

            console.info(`Fetching cookies for URL: ${url}`);
            const cookies = await this.cluster.execute({ url });
            console.info(`Fetched ${cookies.length} cookies for URL: ${url}`);
            return cookies;
        } catch (error) {
            console.error(`Error fetching cookies for URL (${url}):`, error);
            return []; // Return an empty array to avoid breaking the flow
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
        if (!this.isClusterInitialized) {
            console.info('Puppeteer Cluster is not initialized, skipping cleanup.');
            return;
        }

        try {
            console.info('Closing Puppeteer Cluster...');
            await this.cluster.idle(); // Wait for all tasks to finish
            await this.cluster.close(); // Close the cluster
            this.cluster = null;
            this.isClusterInitialized = false; // Reset initialization flag
            console.info('Puppeteer Cluster closed successfully.');
        } catch (error) {
            console.error('Error during Puppeteer Cluster cleanup:', error);
        }
    }
}

module.exports = new CookieManager();
