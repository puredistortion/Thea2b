const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const electronLog = require('electron-log');
const configManager = require('./config-manager');
const downloadManager = require('./download-manager');
const cookieManager = require('./services/cookieManager');

// Configure electron-log
electronLog.transports.file.level = 'info';
electronLog.transports.console.level = 'debug';

let mainWindow;
const registeredHandlers = new Set();
let isQuitting = false;

// Type validation functions
const validateUrl = (url) => {
    if (!url || typeof url !== 'string') {
        throw new Error('Invalid URL format');
    }
    try {
        new URL(url);
        return true;
    } catch (e) {
        throw new Error('Invalid URL format');
    }
};

const validateFilePath = (filePath) => {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path');
    }
    if (filePath.includes('..')) {
        throw new Error('Invalid file path: path traversal not allowed');
    }
    return true;
};

const validateCookies = (cookies) => {
    if (!cookies) return [];
    try {
        if (typeof cookies === 'string') {
            cookies = JSON.parse(cookies);
        }
    } catch (e) {
        return [];
    }
    if (!Array.isArray(cookies)) return [];
    return cookies.filter(cookie => 
        cookie && 
        typeof cookie === 'object' && 
        typeof cookie.name === 'string' && 
        typeof cookie.value === 'string'
    );
};

// Set up IPC handlers
const setupIPC = () => {
    electronLog.info('Starting IPC setup...');
    
    cleanupIPCHandlers();

    const registerHandler = (channel, handler) => {
        ipcMain.handle(channel, handler);
        registeredHandlers.add(channel);
        electronLog.debug(`Registered handler: ${channel}`);
    };

    registerHandler('cookies:fetch', async (event, url) => {
        try {
            validateUrl(url);
            electronLog.info('Fetching cookies for URL:', url);
            const cookies = await cookieManager.fetchCookies(url);
            electronLog.info('Fetched cookies:', cookies);
            return { success: true, cookies };
        } catch (error) {
            electronLog.error('Cookie fetch error:', error);
            return { success: false, error: error.message, cookies: [] };
        }
    });

    registerHandler('download:video', async (event, data) => {
        const { url, cookies } = data;
        electronLog.info('Download:video handler called with data:', { url, cookies });

        try {
            validateUrl(url);

            let validatedCookies = validateCookies(cookies);
            if (!validatedCookies.length) {
                electronLog.info('No cookies provided, attempting to fetch cookies automatically...');
                validatedCookies = await cookieManager.fetchCookies(url);
                electronLog.info('Cookies fetched automatically:', validatedCookies);
            }

            const outputDir = configManager.getDownloadLocation();
            electronLog.info('Starting download with:', { 
                url, 
                cookiesLength: validatedCookies.length, 
                outputDir 
            });

            const result = await downloadManager.startDownload(
                url,
                validatedCookies,
                outputDir,
                (progress) => {
                    try {
                        event.sender.send('download:progress', progress);
                    } catch (err) {
                        electronLog.error('Progress update error:', err);
                    }
                }
            );

            electronLog.info('Download completed:', result);
            return { success: true, message: 'Download completed successfully' };
        } catch (error) {
            electronLog.error('Download error:', error);
            return { success: false, error: error.message };
        }
    });

    registerHandler('dialog:openFile', async () => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openFile'],
                filters: [{ name: 'Cookie Files', extensions: ['txt', 'json'] }]
            });
            return result.canceled ? null : result.filePaths[0];
        } catch (error) {
            electronLog.error('Dialog error:', error);
            return { success: false, error: error.message };
        }
    });

    registerHandler('file:read', async (event, filePath) => {
        try {
            validateFilePath(filePath);
            const content = await fs.promises.readFile(filePath, 'utf8');
            return { success: true, content };
        } catch (error) {
            electronLog.error('File read error:', error);
            return { success: false, error: error.message };
        }
    });

    registerHandler('select-download-location', async () => {
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory'],
                title: 'Select Download Location',
                defaultPath: configManager.getDownloadLocation()
            });
            
            if (!result.canceled && result.filePaths[0]) {
                const location = result.filePaths[0];
                await configManager.setDownloadLocation(location);
                return { success: true, location };
            }
            return { success: true, location: null };
        } catch (error) {
            electronLog.error('Location selection error:', error);
            return { success: false, error: error.message };
        }
    });

    registerHandler('get-download-location', async () => {
        try {
            const location = configManager.getDownloadLocation();
            return { success: true, location };
        } catch (error) {
            electronLog.error('Get download location error:', error);
            return { success: false, error: error.message };
        }
    });

    electronLog.info('Registered IPC handlers:', Array.from(registeredHandlers));
};

const cleanupIPCHandlers = () => {
    registeredHandlers.forEach(channel => {
        try {
            ipcMain.removeHandler(channel);
        } catch (error) {
            electronLog.warn(`Failed to remove handler ${channel}:`, error);
        }
    });
    registeredHandlers.clear();
};

const createWindow = () => {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        minWidth: 600,
        minHeight: 400,
        webPreferences: {
            contextIsolation: true,
            preload: path.join(__dirname, '..', 'preload', 'index.js'),
        },
    });

    setupIPC();
    mainWindow.loadFile(path.join(__dirname, '..', '..', 'public', 'index.html'));

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    mainWindow.on('closed', () => {
        cleanupIPCHandlers();
        mainWindow = null;
    });
};

const initializeApp = async () => {
    try {
        electronLog.info('Starting app initialization...');
        await cookieManager.initializeCluster();
        electronLog.info('Cookie Manager cluster initialized');
        await configManager.ensureDownloadLocation();
        electronLog.info('Download location ensured');
        createWindow();
        electronLog.info('Window created and IPC setup complete');
    } catch (error) {
        electronLog.error('Application initialization failed:', error);
        throw error;
    }
};

app.whenReady().then(initializeApp).catch(error => {
    electronLog.error('Failed to initialize application:', error);
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

app.on('before-quit', async (event) => {
    if (isQuitting) return;
    event.preventDefault();
    isQuitting = true;

    try {
        console.info('Shutting down application...');
        await cookieManager.cleanup(); // Ensure Puppeteer Cluster is cleaned up
        console.info('Cleanup complete, exiting application.');
        app.exit(0);
    } catch (error) {
        console.error('Error during shutdown:', error);
        app.exit(1);
    }
});

module.exports = { 
    createWindow,
    cleanupIPCHandlers,
    validateUrl,
    validateFilePath,
    validateCookies
};
