const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const { Cluster } = require('puppeteer-cluster');
const fs = require('fs');
const path = require('path');
const os = require('os');

// Initialize stealth plugin
puppeteer.use(StealthPlugin());

class CookieManager {
    constructor(config = {}) {
        this.config = {
            maxConcurrency: config.maxConcurrency || this.calculateConcurrency(),
            maxRetries: config.maxRetries || 3,
            timeout: config.timeout || 60000, // Increased to 60 seconds
            minMemoryThreshold: 0.25, // 25% free memory required
        };
        this.cluster = null;
        this.isClusterInitialized = false;
        this.initRetryCount = 0;
        this.MAX_INIT_RETRIES = 3;
    }

    calculateConcurrency() {
        const totalMemoryGB = os.totalmem() / 1024 / 1024 / 1024;
        const freeMemoryGB = os.freemem() / 1024 / 1024 / 1024;
        const memoryPerInstance = 0.5; // 500MB per instance
        
        // Calculate based on available memory, minimum 1, maximum 2
        return Math.max(1, Math.min(2, Math.floor(freeMemoryGB / memoryPerInstance)));
    }

    async checkMemory() {
        const freeMemoryPercent = os.freemem() / os.totalmem();
        if (freeMemoryPercent < this.config.minMemoryThreshold) {
            throw new Error(`Insufficient memory available (${(freeMemoryPercent * 100).toFixed(1)}% free). Requires at least ${(this.config.minMemoryThreshold * 100)}% free memory.`);
        }
        return true;
    }

    async cleanupExistingCluster() {
        if (this.cluster) {
            try {
                console.info('Cleaning up existing cluster...');
                await this.cluster.idle();
                await this.cluster.close();
                this.cluster = null;
                this.isClusterInitialized = false;
                console.info('Existing cluster cleaned up successfully');
            } catch (error) {
                console.error('Error cleaning up existing cluster:', error);
                // Continue with initialization even if cleanup fails
            }
        }
    }

    async initializeCluster() {
        try {
            await this.checkMemory();
            await this.cleanupExistingCluster();

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
                        '--disable-accelerated-2d-canvas',
                        '--disable-webgl',
                        '--single-process', // Force single process to reduce memory
                        '--no-zygote',
                        '--disable-extensions',
                        '--window-size=1920,1080',
                        '--disable-features=site-per-process', // Reduces memory usage
                        '--js-flags="--max-old-space-size=512"' // Limit JS memory
                    ],
                    defaultViewport: {
                        width: 1920,
                        height: 1080
                    },
                    dumpio: true // Enable verbose logging
                },
                retryLimit: this.config.maxRetries,
                retryDelay: 1000, // Wait 1 second between retries
            });

            // Add cluster event handlers
            this.cluster.on('taskerror', (err, data) => {
                console.error(`Task error for ${data?.url}:`, err);
            });

            this.cluster.on('queue', (data) => {
                console.log(`Task queued:`, data);
            });

            // Define task for cookie fetching
            this.cluster.task(async ({ page, data: { url, taskType } }) => {
                if (!page) {
                    throw new Error('Page object is undefined');
                }

                try {
                    await this.checkMemory();
                    console.info(`Navigating to URL for ${taskType}: ${url}`);
                    
                    // Set user agent and other page configurations
                    await page.setUserAgent(
                        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                    );

                    await page.setDefaultNavigationTimeout(this.config.timeout);

                    // Enhanced page navigation with proper error handling
                    const response = await page.goto(url, {
                        waitUntil: 'networkidle2',
                        timeout: this.config.timeout
                    });

                    if (!response) {
                        throw new Error('Navigation failed - no response received');
                    }

                    if (!response.ok()) {
                        throw new Error(`Failed to load page: ${response.status()} ${response.statusText()}`);
                    }

                    // Wait for potential JavaScript-based redirects
                    await page.waitForTimeout(2000);

                    if (taskType === 'cookies') {
                        const cookies = await page.cookies();
                        if (!cookies || !Array.isArray(cookies)) {
                            throw new Error('Invalid cookie response from page');
                        }
                        console.info(`Successfully fetched ${cookies.length} cookies for URL: ${url}`);
                        return cookies;
                    }

                    throw new Error(`Unknown task type: ${taskType}`);
                } catch (error) {
                    await this.checkMemory();
                    console.error(`Error in cluster task for ${url}:`, error);
                    throw error;
                }
            });

            console.info('Puppeteer Cluster initialized successfully.');
            this.isClusterInitialized = true;
            return this.cluster;
        } catch (error) {
            console.error('Error initializing Puppeteer Cluster:', error);
            
            if (this.initRetryCount < this.MAX_INIT_RETRIES) {
                this.initRetryCount++;
                console.info(`Retrying initialization (${this.initRetryCount}/${this.MAX_INIT_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, this.initRetryCount * 1000));
                return this.initializeCluster();
            }
            
            this.isClusterInitialized = false;
            this.cluster = null;
            throw error;
        }
    }

    async fetchCookies(url) {
        try {
            if (!url) {
                throw new Error('URL is required for fetching cookies');
            }

            await this.checkMemory();

            if (!this.isClusterInitialized || !this.cluster) {
                await this.initializeCluster();
            }

            console.info(`Fetching cookies for URL: ${url}`);
            
            let retryCount = 0;
            const MAX_RETRIES = this.config.maxRetries;
            let lastError = null;

            while (retryCount <= MAX_RETRIES) {
                try {
                    const cookies = await this.cluster.execute({ 
                        url,
                        taskType: 'cookies'
                    });

                    if (!cookies || !Array.isArray(cookies)) {
                        throw new Error('Invalid cookie response from cluster');
                    }

                    console.info(`Successfully fetched ${cookies.length} cookies for URL: ${url}`);
                    return cookies;
                } catch (error) {
                    lastError = error;
                    retryCount++;
                    
                    if (retryCount <= MAX_RETRIES) {
                        console.warn(`Retry ${retryCount}/${MAX_RETRIES} for URL ${url}:`, error);
                        await this.checkMemory();
                        await new Promise(resolve => setTimeout(resolve, retryCount * 1000));
                    }
                }
            }

            throw lastError || new Error(`Failed to fetch cookies after ${MAX_RETRIES} retries`);
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
            await Promise.race([
                this.cluster.idle(),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Cleanup timeout')), 5000)
                )
            ]);
            await this.cluster.close();
            this.cluster = null;
            this.isClusterInitialized = false;
            console.info('Puppeteer Cluster closed successfully.');
        } catch (error) {
            console.error('Error during Puppeteer Cluster cleanup:', error);
            // Force cleanup
            this.cluster = null;
            this.isClusterInitialized = false;
            throw error;
        }
    }
}

module.exports = new CookieManager();