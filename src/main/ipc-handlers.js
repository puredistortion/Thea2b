const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const downloadManager = require('./download-manager');
const configManager = require('./config-manager');
const cookieManager = require('./services/cookieManager'); // Added import for cookieManager

const logger = configManager.getLogger();

async function setupIPC() {
    try {
        logger.info('Setting up IPC handlers...');

        // Cookie management IPC handlers
        ipcMain.handle('cookies:fetch', async (event, url) => {
            try {
                logger.info('Fetching cookies for URL:', url);
                const cookies = await cookieManager.fetchCookies(url); // Updated to use cookieManager
                return cookies || [];
            } catch (error) {
                logger.error('Cookie fetch failed:', error);
                throw error;
            }
        });

        ipcMain.handle('cookies:save', async (event, cookieData) => {
            try {
                return await downloadManager.saveCookies(cookieData);
            } catch (error) {
                logger.error('Cookie save failed:', error);
                throw error;
            }
        });

        ipcMain.handle('cookies:load', async (event, cookieId) => {
            try {
                return await downloadManager.loadCookies(cookieId);
            } catch (error) {
                logger.error('Cookie load failed:', error);
                throw error;
            }
        });

        // File dialog handlers
        ipcMain.handle('dialog:openFile', async () => {
            try {
                const result = await dialog.showOpenDialog({
                    properties: ['openFile'],
                    filters: [{ name: 'Cookie Files', extensions: ['txt', 'json'] }]
                });
                return result.canceled ? null : result.filePaths[0];
            } catch (error) {
                logger.error('File dialog error:', error);
                throw error;
            }
        });

        ipcMain.handle('dialog:saveFile', async (event, defaultPath) => {
            try {
                const result = await dialog.showSaveDialog({
                    defaultPath,
                    filters: [{ name: 'Cookie Files', extensions: ['txt', 'json'] }]
                });
                return result.canceled ? null : result.filePath;
            } catch (error) {
                logger.error('Save dialog error:', error);
                throw error;
            }
        });

        // File operations
        ipcMain.handle('file:read', async (event, filePath) => {
            try {
                return await fs.readFile(filePath, 'utf8');
            } catch (error) {
                logger.error('File read error:', error);
                throw error;
            }
        });

        ipcMain.handle('file:write', async (event, { filePath, content }) => {
            try {
                await fs.writeFile(filePath, content, 'utf8');
                return true;
            } catch (error) {
                logger.error('File write error:', error);
                throw error;
            }
        });

        // Download control handlers
        ipcMain.handle('download:start', async (event, { url, options }) => {
            try {
                logger.info('Starting download:', { url, options });
                const downloadId = await downloadManager.startDownload(url, options);
                return downloadId;
            } catch (error) {
                logger.error('Download start failed:', error);
                throw error;
            }
        });

        ipcMain.handle('download:pause', async (event, downloadId) => {
            try {
                return await downloadManager.pauseDownload(downloadId);
            } catch (error) {
                logger.error('Download pause failed:', error);
                throw error;
            }
        });

        ipcMain.handle('download:resume', async (event, downloadId) => {
            try {
                return await downloadManager.resumeDownload(downloadId);
            } catch (error) {
                logger.error('Download resume failed:', error);
                throw error;
            }
        });

        ipcMain.handle('download:cancel', async (event, downloadId) => {
            try {
                return await downloadManager.cancelDownload(downloadId);
            } catch (error) {
                logger.error('Download cancel failed:', error);
                throw error;
            }
        });

        ipcMain.handle('download:status', async (event, downloadId) => {
            try {
                return await downloadManager.getDownloadStatus(downloadId);
            } catch (error) {
                logger.error('Status fetch failed:', error);
                throw error;
            }
        });

        // Settings handlers
        ipcMain.handle('settings:get', (event, key) => {
            return configManager.getConfig(key);
        });

        ipcMain.handle('settings:set', async (event, { key, value }) => {
            try {
                await configManager.updateSettings({ [key]: value });
                return true;
            } catch (error) {
                logger.error('Settings update failed:', error);
                throw error;
            }
        });

        logger.info('IPC handlers setup complete');
    } catch (error) {
        logger.error('Failed to setup IPC handlers:', error);
        throw error;
    }
}

module.exports = { setupIPC };
