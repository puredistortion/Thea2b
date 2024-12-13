const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const crypto = require('crypto');
const puppeteer = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const electronLog = require('electron-log');
const configManager = require('./config-manager');
const readline = require('readline');
const { app } = require('electron');

// Configure stealth plugin
const stealth = StealthPlugin();
stealth.enabledEvasions.delete('sourceurl'); // Known to cause issues
puppeteer.use(stealth);

class DownloadManager {
    constructor() {
        this.downloads = new Map();
        this.cookieCache = new Map();
        this.browser = null;
        this.maxRetries = 3;
        this.retryDelay = 1000;
        this.isCleaningUp = false;
        
        // Set yt-dlp path based on environment
        const isDev = process.env.NODE_ENV === 'development';
        this.ytDlpPath = isDev 
            ? path.join(__dirname, '..', '..', 'resources', 'yt-dlp') 
            : path.join(process.resourcesPath, 'yt-dlp');
            
        // Ensure executable permissions
        if (process.platform === 'darwin' || process.platform === 'linux') {
            try {
                fs.chmodSync(this.ytDlpPath, '755');
            } catch (error) {
                electronLog.warn('Failed to set yt-dlp permissions:', error);
            }
        }
    }

    // ... [previous methods remain the same until startDownload] ...

    async startDownload(url, cookies = [], outputDir, progressCallback) {
        electronLog.info('Starting download for URL:', url);
        electronLog.info('Using yt-dlp from:', this.ytDlpPath);
        
        try {
            const downloadId = crypto.randomUUID();

            // Verify yt-dlp exists
            if (!fs.existsSync(this.ytDlpPath)) {
                throw new Error(`yt-dlp not found at ${this.ytDlpPath}`);
            }

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

            electronLog.info('Spawning yt-dlp with args:', args);

            const downloadProcess = spawn(this.ytDlpPath, args);
            
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
                electronLog.error(`Download error for ${downloadId}:`, errorOutput);
                process.stderr.write(errorOutput);
            });

            return new Promise((resolve, reject) => {
                downloadProcess.on('close', (code) => {
                    this.downloads.delete(downloadId);
                    if (code === 0) {
                        electronLog.info(`Download ${downloadId} completed successfully`);
                        resolve({ success: true, downloadId });
                    } else {
                        const error = new Error(`Download process exited with code ${code}`);
                        electronLog.error(`Download ${downloadId} failed:`, error);
                        reject(error);
                    }
                });

                downloadProcess.on('error', (error) => {
                    electronLog.error(`Process error for ${downloadId}:`, error);
                    reject(error);
                });
            });

        } catch (error) {
            electronLog.error('Download failed:', error);
            throw error;
        }
    }

    // ... [rest of the methods remain the same] ...

}

const downloadManager = new DownloadManager();
module.exports = downloadManager;