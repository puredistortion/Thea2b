const { app, BrowserWindow, session, ipcMain, dialog } = require('electron');
const path = require('path');
const electronLog = require('electron-log');
const configManager = require('./config-manager');
const downloadManager = require('./download-manager');

// Configure electron-log
electronLog.transports.file.level = 'info';
electronLog.transports.console.level = 'debug';

let mainWindow;
const registeredHandlers = new Set();
let isQuitting = false; // Add flag to track quit state

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
    // Basic path validation - you might want to add more checks
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

    // Clean up any existing handlers
    cleanupIPCHandlers();

    // Register new handlers
    const registerHandler = (channel, handler) => {
        ipcMain.handle(channel, handler);
        registeredHandlers.add(channel);
        electronLog.debug(`Registered handler: ${channel}`);
    };

    // Download video handler
    registerHandler('download:video', async (event, data) => {
        electronLog.info('Download:video handler called with data:', data);
        try {
            const { url, cookies } = data;
            validateUrl(url);
            const validatedCookies = validateCookies(cookies);
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

    // File dialog handler
    registerHandler('dialog:openFile', async () => {
        electronLog.info('Dialog:openFile handler called');
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openFile'],
                filters: [{ name: 'Cookie Files', extensions: ['txt', 'json'] }]
            });
            electronLog.debug('Dialog result:', result);
            return result.canceled ? null : result.filePaths[0];
        } catch (error) {
            electronLog.error('Dialog error:', error);
            return { success: false, error: error.message };
        }
    });

    // File reading handler
    registerHandler('file:read', async (event, filePath) => {
        electronLog.info('File:read handler called for path:', filePath);
        try {
            validateFilePath(filePath);
            const content = await require('fs').promises.readFile(filePath, 'utf8');
            return { success: true, content };
        } catch (error) {
            electronLog.error('File read error:', error);
            return { success: false, error: error.message };
        }
    });

    // Cookie fetching handler
    registerHandler('cookies:fetch', async (event, url) => {
        electronLog.info('Cookies:fetch handler called for URL:', url);
        try {
            validateUrl(url);
            const cookies = await downloadManager.fetchCookies(url);
            electronLog.debug('Cookies fetched:', cookies?.length || 0);
            return { success: true, cookies: cookies || [] };
        } catch (error) {
            electronLog.error('Cookie fetch error:', error);
            return { success: false, error: error.message, cookies: [] };
        }
    });

    // Download location handlers
    registerHandler('select-download-location', async () => {
        electronLog.info('Select-download-location handler called');
        try {
            const result = await dialog.showOpenDialog(mainWindow, {
                properties: ['openDirectory'],
                title: 'Select Download Location',
                defaultPath: configManager.getDownloadLocation()
            });
            
            if (!result.canceled && result.filePaths[0]) {
                const location = result.filePaths[0];
                await configManager.setDownloadLocation(location);
                electronLog.info('New download location set:', location);
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
            electronLog.debug(`Removed handler: ${channel}`);
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
            nodeIntegration: false,
            preload: path.join(__dirname, '..', 'preload', 'index.js'),
            sandbox: false,
            webSecurity: true,
            allowRunningInsecureContent: false,
            enableRemoteModule: false,
        },
    });

    // Set up IPC handlers before loading the file
    setupIPC();

    mainWindow.loadFile(path.join(__dirname, '..', '..', 'public', 'index.html'));

    if (process.env.NODE_ENV === 'development') {
        mainWindow.webContents.openDevTools();
    }

    // Handle window close
    mainWindow.on('closed', () => {
        cleanupIPCHandlers();
        mainWindow = null;
    });
};

const initializeApp = async () => {
    try {
        electronLog.info('Starting app initialization...');
        
        // Initialize download manager first
        await downloadManager.init();
        electronLog.info('Download manager initialized');
        
        // Ensure download location exists
        await configManager.ensureDownloadLocation();
        electronLog.info('Download location ensured');
        
        // Create window (IPC setup happens inside createWindow now)
        createWindow();
        electronLog.info('Window created and IPC setup complete');
        
    } catch (error) {
        electronLog.error('Application initialization failed:', error);
        throw error;
    }
};

// Application event handlers
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

// Single cleanup point
app.on('before-quit', async (event) => {
    if (isQuitting) return; // Prevent multiple cleanup attempts
    
    event.preventDefault();
    isQuitting = true;
    
    try {
        electronLog.info('Starting application cleanup...');
        await downloadManager.cleanup();
        electronLog.info('Cleanup complete, quitting application');
        app.exit(0); // Force quit after cleanup
    } catch (error) {
        electronLog.error('Error during app cleanup:', error);
        app.exit(1); // Force quit with error
    }
});

// Export for testing
module.exports = { 
    createWindow,
    cleanupIPCHandlers,
    validateUrl,
    validateFilePath,
    validateCookies
};