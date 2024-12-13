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

let mainWindow = null;
let appInitialized = false; // Prevent duplicate initialization
const registeredHandlers = new Set();
let isQuitting = false;

// Validation Utilities
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

// Setup IPC handlers
const setupIPC = () => {
    if (registeredHandlers.size > 0) {
        electronLog.warn('IPC handlers already set up. Skipping duplicate registration.');
        return;
    }

    electronLog.info('Setting up IPC handlers...');
    cleanupIPCHandlers();

    const registerHandler = (channel, handler) => {
        ipcMain.handle(channel, handler);
        registeredHandlers.add(channel);
        electronLog.debug(`Registered handler: ${channel}`);
    };

    registerHandler('cookies:fetch', async (event, url) => {
        try {
            validateUrl(url);
            const cookies = await cookieManager.fetchCookies(url);
            electronLog.info('Fetched cookies successfully:', cookies);
            return { success: true, cookies };
        } catch (error) {
            electronLog.error('Error fetching cookies:', error);
            return { success: false, error: error.message, cookies: [] };
        }
    });

    registerHandler('download:video', async (event, data) => {
        try {
            const { url, cookies } = data;
            validateUrl(url);
            let validatedCookies = validateCookies(cookies);

            if (!validatedCookies.length) {
                validatedCookies = await cookieManager.fetchCookies(url);
            }

            const outputDir = configManager.getDownloadLocation();
            const result = await downloadManager.startDownload(url, validatedCookies, outputDir, (progress) => {
                event.sender.send('download:progress', progress);
            });

            return { success: true, message: 'Download completed successfully.' };
        } catch (error) {
            electronLog.error('Error during download:', error);
            return { success: false, error: error.message };
        }
    });

    electronLog.info('IPC handlers setup complete.');
};

const cleanupIPCHandlers = () => {
    registeredHandlers.forEach(channel => {
        try {
            ipcMain.removeHandler(channel);
        } catch (error) {
            electronLog.warn(`Failed to remove IPC handler for ${channel}:`, error);
        }
    });
    registeredHandlers.clear();
};

// Create Browser Window
const createWindow = () => {
    if (mainWindow) {
        electronLog.warn('Main window already exists. Skipping creation.');
        return;
    }

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

// Initialize Application
const initializeApp = async () => {
    if (appInitialized) {
        electronLog.warn('App is already initialized. Skipping duplicate initialization.');
        return;
    }

    appInitialized = true;

    try {
        electronLog.info('Initializing app...');
        await cookieManager.initializeCluster();
        await configManager.ensureDownloadLocation();
        createWindow();
    } catch (error) {
        electronLog.error('Error during app initialization:', error);
        app.quit();
    }
};

// Electron Lifecycle Events
app.whenReady().then(initializeApp).catch((error) => {
    electronLog.error('Failed to initialize app:', error);
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
        await cookieManager.cleanup();
        app.exit(0);
    } catch (error) {
        electronLog.error('Error during shutdown:', error);
        app.exit(1);
    }
});

module.exports = {
    createWindow,
    cleanupIPCHandlers,
    validateUrl,
    validateFilePath,
    validateCookies,
};
