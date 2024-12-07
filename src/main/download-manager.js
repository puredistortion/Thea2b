const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const log = require('electron-log');
const configManager = require('./config-manager');
const readline = require('readline');

puppeteer.use(StealthPlugin());

class DownloadManager {
    constructor() {
        this.downloads = new Map();
        this.cookieCache = new Map();
        this.browser = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.isCleaningUp = false;
    }

    async init() {
        try {
            log.info('Initializing DownloadManager...');
            await configManager.init();
            await this.setupBrowser();
            await this.ensureDirectories();
            log.info('DownloadManager initialized successfully');
        } catch (error) {
            log.error('Failed to initialize DownloadManager:', error);
            throw error;
        }
    }

    async setupBrowser() {
        if (this.browser) return;
        
        this.browser = await puppeteer.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
    }

    async ensureDirectories() {
        const dataPath = await configManager.getConfig('userData') || configManager.getConfig('downloadLocation');
        if (!dataPath) {
            throw new Error('Data path not configured');
        }

        const dirs = ['downloads', 'temp', 'cookies'].map(dir => 
            path.join(dataPath, dir)
        );
        await Promise.all(dirs.map(dir => fs.ensureDir(dir)));
    }

    async startDownload(url, cookies = [], outputDir, progressCallback) {
        log.info('Starting download for URL:', url);
        
        const ytdlpPath = 'yt-dlp';
        
        try {
            const downloadId = crypto.randomUUID();

            const args = [
                url,
                '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
                '--merge-output-format', 'mp4',
                '-o', path.join(outputDir, '%(title)s.%(ext)s'),
                '--no-warnings',
                '--progress-template', '[download] %(progress._percent_str)s at %(progress._speed_str)s'
            ];

            if (cookies && cookies.length > 0) {
                const cookiePath = path.join(outputDir, 'cookies', `${downloadId}.txt`);
                await this.writeCookieFile(cookies, cookiePath);
                args.push('--cookies', cookiePath);
            }

            log.info('Spawning yt-dlp with args:', args);

            const downloadProcess = spawn(ytdlpPath, args);
            
            this.downloads.set(downloadId, {
                process: downloadProcess,
                url,
                status: 'downloading',
                progress: 0,
                cookies: cookies
            });

            downloadProcess.stdout.on('data', (data) => {
                const output = data.toString();
                const progressMatch = output.match(/(\d+\.?\d*)%/);
                if (progressMatch && progressCallback) {
                    const progress = parseFloat(progressMatch[1]);
                    progressCallback({
                        id: downloadId,
                        progress,
                        status: 'downloading'
                    });

                    // Clear current line and write the new progress
                    readline.clearLine(process.stdout, 0);
                    readline.cursorTo(process.stdout, 0);
                    process.stdout.write(output.trim());
                }
            });

            downloadProcess.stderr.on('data', (data) => {
                const errorOutput = data.toString();
                log.error(`Download error for ${downloadId}:`, errorOutput);
                process.stderr.write(errorOutput);
            });

            return new Promise((resolve, reject) => {
                downloadProcess.on('close', (code) => {
                    this.downloads.delete(downloadId);
                    if (code === 0) {
                        log.info(`Download ${downloadId} completed successfully`);
                        resolve({ success: true, downloadId });
                    } else {
                        const error = new Error(`Download process exited with code ${code}`);
                        log.error(`Download ${downloadId} failed:`, error);
                        reject(error);
                    }
                });
            });

        } catch (error) {
            log.error('Download failed:', error);
            throw error;
        }
    }

    async fetchCookies(url) {
        log.info('Fetching cookies for URL:', url);
        if (!this.browser) {
            await this.setupBrowser();
        }

        try {
            const page = await this.browser.newPage();
            await page.goto(url, { waitUntil: 'networkidle0' });
            const cookies = await page.cookies();
            await page.close();
            return cookies;
        } catch (error) {
            log.error('Failed to fetch cookies:', error);
            throw error;
        }
    }

    async writeCookieFile(cookies, filePath) {
        const cookieContent = cookies.map(cookie => {
            return `${cookie.domain}\tTRUE\t${cookie.path}\t${
                cookie.secure ? 'TRUE' : 'FALSE'
            }\t${cookie.expires || 0}\t${cookie.name}\t${cookie.value}`;
        }).join('\n');

        await fs.writeFile(filePath, cookieContent);
    }

    async cleanup() {
        if (this.isCleaningUp) return;
        this.isCleaningUp = true;

        try {
            for (const [id, download] of this.downloads) {
                if (download.process) {
                    download.process.kill();
                }
            }
            this.downloads.clear();

            if (this.browser) {
                await this.browser.close();
                this.browser = null;
            }

            await this.cleanupTempFiles();
        } catch (error) {
            log.error('Error during cleanup:', error);
            throw error;
        } finally {
            this.isCleaningUp = false;
        }
    }

    async cleanupTempFiles() {
        const dataPath = await configManager.getConfig('userData') || configManager.getConfig('downloadLocation');
        if (!dataPath) {
            log.warn('Data path not configured during cleanup');
            return;
        }

        const tempDir = path.join(dataPath, 'temp');
        try {
            await fs.emptyDir(tempDir);
        } catch (error) {
            log.error('Failed to cleanup temp files:', error);
        }
    }
}

const downloadManager = new DownloadManager();
module.exports = downloadManager;