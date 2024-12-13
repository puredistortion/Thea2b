const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs-extra');
const electronLog = require('electron-log');
const configManager = require('./config-manager');
const { fetchCookies } = require('./services/cookieManager');
const readline = require('readline');

class DownloadManager {
    constructor() {
        this.downloads = new Map();
    }

    async init() {
        try {
            electronLog.info('Initializing DownloadManager...');
            await configManager.init();
            electronLog.info('DownloadManager initialized successfully');
        } catch (error) {
            electronLog.error('Failed to initialize DownloadManager:', error);
            throw error;
        }
    }

    async fetchCookies(url) {
        try {
            electronLog.info('Fetching cookies for URL:', url);
            const cookies = await fetchCookies(url);
            electronLog.info(`Fetched ${cookies.length} cookies for URL: ${url}`);
            return cookies;
        } catch (error) {
            electronLog.error(`Error fetching cookies for URL (${url}):`, error);
            throw error;
        }
    }

    async startDownload(url, cookies = [], outputDir, progressCallback) {
        electronLog.info('Starting download for URL:', url);

        try {
            // Ensure output directory exists
            await fs.ensureDir(outputDir);

            // Prepare yt-dlp arguments
            const args = [
                url,
                '--format', 'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]',
                '--merge-output-format', 'mp4',
                '-o', path.join(outputDir, '%(title)s.%(ext)s'),
                '--no-warnings',
                '--progress', '--newline',
                '--no-playlist',
                '--console-title'
            ];

            // Handle cookies
            if (cookies.length > 0) {
                const cookieFile = path.join(outputDir, 'cookies.txt');
                const cookieContent = cookies.map(cookie =>
                    `${cookie.domain}\tTRUE\t${cookie.path}\t${
                        cookie.secure ? 'TRUE' : 'FALSE'
                    }\t${cookie.expires || 0}\t${cookie.name}\t${cookie.value}`
                ).join('\n');

                await fs.writeFile(cookieFile, cookieContent);
                args.push('--cookies', cookieFile);
                electronLog.info(`Cookies saved to ${cookieFile}`);
            } else {
                electronLog.warn('No cookies provided for this download.');
            }

            // Spawn yt-dlp process
            electronLog.info('Spawning yt-dlp with args:', args);
            const downloadProcess = spawn('yt-dlp', args);

            downloadProcess.stdout.on('data', (data) => {
                const output = data.toString();
                readline.clearLine(process.stdout, 0);
                readline.cursorTo(process.stdout, 0);
                process.stdout.write(output.replace(/\n/g, ''));

                // Parse progress percentage
                const progressMatch = output.match(/(\d+\.?\d*)%/);
                if (progressMatch && progressCallback) {
                    const progress = parseFloat(progressMatch[1]);
                    progressCallback({ progress, status: 'downloading' });
                }
            });

            downloadProcess.stderr.on('data', (data) => {
                electronLog.error('Download process error:', data.toString());
            });

            // Wait for the process to complete
            return new Promise((resolve, reject) => {
                downloadProcess.on('close', (code) => {
                    readline.clearLine(process.stdout, 0);
                    readline.cursorTo(process.stdout, 0);

                    if (code === 0) {
                        resolve('Video Downloaded and Processed');
                    } else {
                        reject(new Error(`Download failed with code ${code}`));
                    }
                });
            });
        } catch (error) {
            electronLog.error('Download failed:', error);
            throw error;
        }
    }

    async cleanup() {
        // No persistent resources to clean in this approach
    }
}

const downloadManager = new DownloadManager();
module.exports = downloadManager;
