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
        if (this.isClusterInitialized && this.cluster) {
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
                monitor: true,
                puppeteerOptions: {
                    headless: true,
                    args: [
                        '--disable-gpu',
                        '--no-sandbox',
                        '--disable-setuid-sandbox',
                        '--disable-dev-shm-usage',
                        '--no-zygote',
                        '--single-process',
                        '--disable-extensions',
                        '--window-size=1920,1080',
                    ],
                    defaultViewport: {
                        width: 1920,
                        height: 1080
                    }
                },
                retryLimit: this.config.maxRetries,
            });

            // Add cluster event handlers for better error tracking
            this.cluster.on('taskerror', (err, data) => {
                console.error(`Task error:`, err, 'Data:', data);
            });

            this.cluster.on('queue', (data) => {
                console.log(`Task queued:`, data);
            });

            // Define a task for fetching cookies with enhanced error handling
            this.cluster.task(async ({ page, data: { url } }) => {
                if (!page) {
                    throw new Error('Page object is undefined');
                }

                try {
                    await page.setDefaultNavigationTimeout(30000);
                    console.info(`Navigating to URL: ${url}`);
                    
                    // Set a more recent user agent
                    await page.setUserAgent(
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    );

                    // Enhanced page navigation with proper error handling
                    const response = await page.goto(url, {
                        waitUntil: 'networkidle2',
                        timeout: 30000
                    });

                    if (!response) {
                        throw new Error('Navigation failed - no response received');
                    }

                    if (!response.ok()) {
                        throw new Error(`Failed to load page: ${response.status()} ${response.statusText()}`);
                    }

                    // Wait for any potential JavaScript redirects
                    await page.waitForTimeout(2000);

                    const cookies = await page.cookies();
                    
                    if (!cookies || !Array.isArray(cookies)) {
                        throw new Error('Invalid cookie response from page');
                    }

                    console.info(`Successfully fetched ${cookies.length} cookies for URL: ${url}`);
                    return cookies;
                } catch (error) {
                    console.error(`Detailed error in task execution for ${url}:`, error);
                    throw error;
                }
            });

            console.info('Puppeteer Cluster initialized successfully.');
            this.isClusterInitialized = true;
            return this.cluster;
        } catch (error) {
            console.error('Error initializing Puppeteer Cluster:', error);
            this.isClusterInitialized = false;
            this.cluster = null;
            throw error;
        }
    }

    async fetchCookies(url) {
        try {
            if (!this.isClusterInitialized || !this.cluster) {
                await this.initializeCluster();
            }

            if (!url) {
                throw new Error('URL is required for fetching cookies');
            }

            console.info(`Fetching cookies for URL: ${url}`);
            const cookies = await this.cluster.execute({ url });

            if (!cookies || !Array.isArray(cookies)) {
                throw new Error('Invalid cookie response from cluster');
            }

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

    loadCookiesFromFile(filePath) {
        try {
            if (fs.existsSync(filePath)) {
                const cookies = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                console.info(`Loaded cookies from file: ${filePath}`);
                return cookies;
            } else {
                console.warn(`Cookie file not found: ${filePath}`);
                return [];
            }
        } catch (error) {
            console.error('Error loading cookies from file:', error);
            throw error;
        }
    }

    async cleanup() {
        if (!this.isClusterInitialized || !this.cluster) {
            console.info('Puppeteer Cluster is not initialized, skipping cleanup.');
            return;
        }

        try {
            console.info('Closing Puppeteer Cluster...');
            await this.cluster.idle();
            await this.cluster.close();
            this.cluster = null;
            this.isClusterInitialized = false;
            console.info('Puppeteer Cluster closed successfully.');
        } catch (error) {
            console.error('Error during Puppeteer Cluster cleanup:', error);
            throw error;
        }
    }
}

module.exports = new CookieManager();