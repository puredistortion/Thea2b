const { ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs-extra');
const downloadManager = require('./download-manager');
const configManager = require('./config-manager');
const cookieManager = require('./services/cookieManager');

const logger = configManager.getLogger();

async function setupIPC() {
    try {
        logger.info('Setting up IPC handlers...');

        // Cookie management IPC handlers with enhanced error handling
        ipcMain.handle('cookies:fetch', async (event, url) => {
            try {
                if (!url) {
                    throw new Error('URL is required for cookie fetching');
                }
                
                logger.info(`Initiating cookie fetch for URL: ${url}`);
                
                // Ensure cluster is initialized
                if (!cookieManager.isClusterInitialized) {
                    logger.info('Initializing cookie manager cluster...');
                    await cookieManager.initializeCluster();
                }
                
                const cookies = await cookieManager.fetchCookies(url);
                
                if (!cookies || !Array.isArray(cookies)) {
                    throw new Error('Invalid cookie response received');
                }
                
                logger.info(`Successfully fetched ${cookies.length} cookies for ${url}`);
                return cookies;
            } catch (error) {
                logger.error('Cookie fetch failed:', {
                    url,
                    error: error.message,
                    stack: error.stack
                });
                throw error; // Re-throw for renderer process handling
            }
        });

        ipcMain.handle('cookies:save', async (event, cookieData) => {
            try {
                if (!cookieData) {
                    throw new Error('Cookie data is required for saving');
                }
                logger.info('Saving cookies to file');
                const result = await downloadManager.saveCookies(cookieData);
                logger.info('Cookies saved successfully');
                return result;
            } catch (error) {
                logger.error('Cookie save failed:', {
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        ipcMain.handle('cookies:load', async (event, cookieId) => {
            try {
                if (!cookieId) {
                    throw new Error('Cookie ID is required for loading');
                }
                logger.info(`Loading cookies for ID: ${cookieId}`);
                const cookies = await downloadManager.loadCookies(cookieId);
                logger.info('Cookies loaded successfully');
                return cookies;
            } catch (error) {
                logger.error('Cookie load failed:', {
                    cookieId,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        // Enhanced file dialog handlers
        ipcMain.handle('dialog:openFile', async () => {
            try {
                logger.info('Opening file dialog for cookie file selection');
                const result = await dialog.showOpenDialog({
                    properties: ['openFile'],
                    filters: [{ name: 'Cookie Files', extensions: ['txt', 'json'] }]
                });
                
                if (result.canceled) {
                    logger.info('File dialog cancelled by user');
                    return null;
                }
                
                logger.info(`File selected: ${result.filePaths[0]}`);
                return result.filePaths[0];
            } catch (error) {
                logger.error('File dialog error:', {
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        ipcMain.handle('dialog:saveFile', async (event, defaultPath) => {
            try {
                logger.info('Opening save dialog', { defaultPath });
                const result = await dialog.showSaveDialog({
                    defaultPath,
                    filters: [{ name: 'Cookie Files', extensions: ['txt', 'json'] }]
                });
                
                if (result.canceled) {
                    logger.info('Save dialog cancelled by user');
                    return null;
                }
                
                logger.info(`Save location selected: ${result.filePath}`);
                return result.filePath;
            } catch (error) {
                logger.error('Save dialog error:', {
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        // Enhanced file operations
        ipcMain.handle('file:read', async (event, filePath) => {
            try {
                if (!filePath) {
                    throw new Error('File path is required for reading');
                }
                
                logger.info(`Reading file: ${filePath}`);
                const content = await fs.readFile(filePath, 'utf8');
                logger.info('File read successfully');
                return content;
            } catch (error) {
                logger.error('File read error:', {
                    filePath,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        ipcMain.handle('file:write', async (event, { filePath, content }) => {
            try {
                if (!filePath || content === undefined) {
                    throw new Error('File path and content are required for writing');
                }
                
                logger.info(`Writing to file: ${filePath}`);
                await fs.writeFile(filePath, content, 'utf8');
                logger.info('File written successfully');
                return true;
            } catch (error) {
                logger.error('File write error:', {
                    filePath,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        // Enhanced download control handlers
        ipcMain.handle('download:start', async (event, { url, options }) => {
            try {
                if (!url) {
                    throw new Error('URL is required to start download');
                }
                
                logger.info('Starting download:', { url, options });
                const downloadId = await downloadManager.startDownload(url, options);
                logger.info(`Download started with ID: ${downloadId}`);
                return downloadId;
            } catch (error) {
                logger.error('Download start failed:', {
                    url,
                    options,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        ipcMain.handle('download:pause', async (event, downloadId) => {
            try {
                if (!downloadId) {
                    throw new Error('Download ID is required to pause download');
                }
                
                logger.info(`Pausing download: ${downloadId}`);
                const result = await downloadManager.pauseDownload(downloadId);
                logger.info(`Download ${downloadId} paused successfully`);
                return result;
            } catch (error) {
                logger.error('Download pause failed:', {
                    downloadId,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        ipcMain.handle('download:resume', async (event, downloadId) => {
            try {
                if (!downloadId) {
                    throw new Error('Download ID is required to resume download');
                }
                
                logger.info(`Resuming download: ${downloadId}`);
                const result = await downloadManager.resumeDownload(downloadId);
                logger.info(`Download ${downloadId} resumed successfully`);
                return result;
            } catch (error) {
                logger.error('Download resume failed:', {
                    downloadId,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        ipcMain.handle('download:cancel', async (event, downloadId) => {
            try {
                if (!downloadId) {
                    throw new Error('Download ID is required to cancel download');
                }
                
                logger.info(`Cancelling download: ${downloadId}`);
                const result = await downloadManager.cancelDownload(downloadId);
                logger.info(`Download ${downloadId} cancelled successfully`);
                return result;
            } catch (error) {
                logger.error('Download cancel failed:', {
                    downloadId,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        ipcMain.handle('download:status', async (event, downloadId) => {
            try {
                if (!downloadId) {
                    throw new Error('Download ID is required to get status');
                }
                
                const status = await downloadManager.getDownloadStatus(downloadId);
                logger.debug(`Download status for ${downloadId}:`, status);
                return status;
            } catch (error) {
                logger.error('Status fetch failed:', {
                    downloadId,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        // Enhanced settings handlers
        ipcMain.handle('settings:get', (event, key) => {
            try {
                if (!key) {
                    throw new Error('Key is required to get settings');
                }
                
                logger.debug(`Fetching setting: ${key}`);
                return configManager.getConfig(key);
            } catch (error) {
                logger.error('Settings fetch failed:', {
                    key,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        ipcMain.handle('settings:set', async (event, { key, value }) => {
            try {
                if (!key) {
                    throw new Error('Key is required to set settings');
                }
                
                logger.info(`Updating setting: ${key}`);
                await configManager.updateSettings({ [key]: value });
                logger.info(`Setting ${key} updated successfully`);
                return true;
            } catch (error) {
                logger.error('Settings update failed:', {
                    key,
                    error: error.message,
                    stack: error.stack
                });
                throw error;
            }
        });

        logger.info('IPC handlers setup complete');
    } catch (error) {
        logger.error('Failed to setup IPC handlers:', {
            error: error.message,
            stack: error.stack
        });
        throw error;
    }
}

module.exports = { setupIPC };