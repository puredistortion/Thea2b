const { app, BrowserWindow, ipcMain, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const electronLog = require('electron-log');
const configManager = require('./config-manager');
const downloadManager = require('./download-manager');
const cookieManager = require('./services/cookieManager');

// Configure electron-log with enhanced logging
electronLog.transports.file.level = 'info';
electronLog.transports.console.level = 'debug';
electronLog.transports.file.maxSize = 10 * 1024 * 1024; // 10MB
electronLog.catchErrors({
    showDialog: false,
    onError: (error) => {
        electronLog.error('Caught unhandled error:', error);
    }
});

let mainWindow = null;
let appInitialized = false;
let ipcInitialized = false;
const registeredHandlers = new Set();
let isQuitting = false;
let initRetryCount = 0;
const MAX_INIT_RETRIES = 3;

// Enhanced Validation Utilities
const validateUrl = (url) => {
    if (!url || typeof url !== 'string') {
        throw new Error('Invalid URL format: URL must be a non-empty string');
    }
    try {
        const urlObj = new URL(url);
        if (!['http:', 'https:'].includes(urlObj.protocol)) {
            throw new Error('Invalid URL protocol: Only HTTP and HTTPS are supported');
        }
        return true;
    } catch (e) {
        throw new Error(`Invalid URL format: ${e.message}`);
    }
};

const validateFilePath = (filePath) => {
    if (!filePath || typeof filePath !== 'string') {
        throw new Error('Invalid file path: Path must be a non-empty string');
    }
    const normalizedPath = path.normalize(filePath);
    if (normalizedPath.includes('..') || path.isAbsolute(normalizedPath)) {
        throw new Error('Invalid file path: Path traversal or absolute paths not allowed');
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
        electronLog.warn('Failed to parse cookies string:', e);
        return [];
    }
    if (!Array.isArray(cookies)) {
        electronLog.warn('Invalid cookies format: not an array');
        return [];
    }
    return cookies.filter(cookie => {
        const isValid = cookie &&
            typeof cookie === 'object' &&
            typeof cookie.name === 'string' &&
            typeof cookie.value === 'string';
        if (!isValid) {
            electronLog.warn('Invalid cookie format:', cookie);
        }
        return isValid;
    });
};

// Enhanced IPC Setup
const setupIPC = () => {
    if (ipcInitialized) {
        electronLog.warn('IPC handlers already set up. Skipping duplicate registration.');
        return;
    }

    electronLog.info('Setting up IPC handlers...');
    cleanupIPCHandlers();

    const registerHandler = (channel, handler) => {
        if (registeredHandlers.has(channel)) {
            electronLog.warn(`Handler for ${channel} already registered. Removing old handler.`);
            ipcMain.removeHandler(channel);
        }
        ipcMain.handle(channel, async (...args) => {
            try {
                electronLog.debug(`Handling ${channel} request:`, ...args.slice(1));
                const result = await handler(...args);
                electronLog.debug(`${channel} request completed successfully`);
                return result;
            } catch (error) {
                electronLog.error(`Error in ${channel} handler:`, error);
                throw error;
            }
        });
        registeredHandlers.add(channel);
        electronLog.debug(`Registered handler: ${channel}`);
    };

    // Enhanced IPC Handlers with retry logic
    registerHandler('cookies:fetch', async (event, url) => {
        try {
            validateUrl(url);
            let retryCount = 0;
            const MAX_RETRIES = 3;
            
            while (retryCount < MAX_RETRIES) {
                try {
                    const cookies = await cookieManager.fetchCookies(url);
                    electronLog.info(`Fetched ${cookies.length} cookies successfully for ${url}`);
                    return { success: true, cookies };
                } catch (error) {
                    retryCount++;
                    if (retryCount === MAX_RETRIES) throw error;
                    electronLog.warn(`Retry ${retryCount}/${MAX_RETRIES} for cookie fetch:`, error);
                    await new Promise(resolve => setTimeout(resolve, 1000 * retryCount));
                }
            }
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
                electronLog.info('No valid cookies provided, attempting to fetch cookies');
                validatedCookies = await cookieManager.fetchCookies(url);
            }

            const outputDir = configManager.getDownloadLocation();
            electronLog.info(`Starting download for ${url} to ${outputDir}`);
            
            const result = await downloadManager.startDownload(url, validatedCookies, outputDir, (progress) => {
                event.sender.send('download:progress', progress);
            });

            electronLog.info('Download completed successfully');
            return { success: true, message: 'Download completed successfully.' };
        } catch (error) {
            electronLog.error('Error during download:', error);
            return { success: false, error: error.message };
        }
    });

    registerHandler('get-download-location', async () => {
        try {
            const location = configManager.getDownloadLocation();
            electronLog.debug('Retrieved download location:', location);
            return { success: true, location };
        } catch (error) {
            electronLog.error('Error fetching download location:', error);
            return { success: false, error: error.message };
        }
    });

    electronLog.info('IPC handlers setup complete.');
    ipcInitialized = true;
};

const cleanupIPCHandlers = () => {
    registeredHandlers.forEach(channel => {
        try {
            electronLog.debug(`Removing handler for ${channel}`);
            ipcMain.removeHandler(channel);
        } catch (error) {
            electronLog.warn(`Failed to remove IPC handler for ${channel}:`, error);
        }
    });
    registeredHandlers.clear();
    electronLog.info('IPC handlers cleanup complete');
};

// Enhanced Window Creation
const createWindow = () => {
    if (mainWindow) {
        electronLog.warn('Main window already exists. Skipping creation.');
        return;
    }

    try {
        mainWindow = new BrowserWindow({
            width: 800,
            height: 600,
            minWidth: 600,
            minHeight: 400,
            webPreferences: {
                contextIsolation: true,
                preload: path.join(__dirname, '..', 'preload', 'index.js'),
                nodeIntegration: false,
                enableRemoteModule: false,
                sandbox: true
            },
            show: false // Don't show window until it's ready
        });

        setupIPC();

        mainWindow.loadFile(path.join(__dirname, '..', '..', 'public', 'index.html'))
            .catch(error => {
                electronLog.error('Failed to load main window:', error);
                throw error;
            });

        mainWindow.once('ready-to-show', () => {
            mainWindow.show();
            electronLog.info('Main window displayed');
        });

        if (process.env.NODE_ENV === 'development') {
            mainWindow.webContents.openDevTools();
        }

        mainWindow.on('closed', () => {
            cleanupIPCHandlers();
            mainWindow = null;
        });

        electronLog.info('Main window created successfully');
    } catch (error) {
        electronLog.error('Error creating main window:', error);
        throw error;
    }
};

// Enhanced App Initialization with Retry Logic
const initializeApp = async () => {
    if (appInitialized) {
        electronLog.warn('App is already initialized. Skipping duplicate initialization.');
        return;
    }

    try {
        electronLog.info('Initializing app...');
        
        // Ensure sequential initialization
        await cookieManager.initializeCluster().catch(async (error) => {
            electronLog.error('Failed to initialize cookie manager:', error);
            if (initRetryCount < MAX_INIT_RETRIES) {
                initRetryCount++;
                electronLog.info(`Retrying initialization (${initRetryCount}/${MAX_INIT_RETRIES})`);
                await new Promise(resolve => setTimeout(resolve, 1000));
                return initializeApp();
            }
            throw error;
        });
        
        electronLog.info('Cookie Manager cluster initialized successfully.');
        
        await configManager.ensureDownloadLocation();
        electronLog.info('Download location setup complete.');
        
        createWindow();
        appInitialized = true;
        electronLog.info('App initialization completed successfully');
    } catch (error) {
        electronLog.error('Fatal error during app initialization:', error);
        app.quit();
    }
};

// Enhanced Electron Lifecycle Events
app.whenReady().then(initializeApp).catch((error) => {
    electronLog.error('Failed to initialize app:', error);
    app.quit();
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        electronLog.info('All windows closed, quitting app');
        app.quit();
    }
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        electronLog.info('Activating app, creating new window');
        createWindow();
    }
});

app.on('before-quit', async (event) => {
    if (isQuitting) return;
    
    event.preventDefault();
    isQuitting = true;

    try {
        electronLog.info('Starting app shutdown sequence...');
        await Promise.race([
            cookieManager.cleanup(),
            new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Shutdown timeout')), 5000)
            )
        ]);
        electronLog.info('App shutdown completed successfully');
        app.exit(0);
    } catch (error) {
        electronLog.error('Error during shutdown:', error);
        app.exit(1);
    }
});

// Error handling for uncaught exceptions
process.on('uncaughtException', (error) => {
    electronLog.error('Uncaught exception:', error);
    if (app && !isQuitting) {
        isQuitting = true;
        app.quit();
    }
});

process.on('unhandledRejection', (reason, promise) => {
    electronLog.error('Unhandled rejection at:', promise, 'reason:', reason);
});

module.exports = {
    createWindow,
    cleanupIPCHandlers,
    validateUrl,
    validateFilePath,
    validateCookies,
};