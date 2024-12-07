const { app } = require('electron');
const { join, dirname, normalize, isAbsolute } = require('path');
const { readFileSync, writeFileSync, mkdirSync, accessSync, existsSync, watch, copyFileSync, constants } = require('fs');
const electronLog = require('electron-log');

// Enhanced logger configuration
const logger = {
    info: (message, data = {}) => electronLog.info(`[ConfigManager] ${message}`, data),
    error: (context, error) => electronLog.error(`[ConfigManager] ${context}:`, error.message || error, error.stack),
    warn: (message, data = {}) => electronLog.warn(`[ConfigManager] ${message}`, data)
};

let Conf = null;

// Core configuration
const CONFIG = {
    maxConcurrency: 10,
    maxRetries: 3,
    downloadDir: 'downloads',
    cloudSyncPath: '/Users/ctb_ceo/Library/Mobile Documents/com~apple~CloudDocs/A2B/',
    ffmpegThreads: 8
};

// File paths
const CONFIG_FILE = join(app.getPath('userData'), 'config.json');
const DEFAULT_DOWNLOAD_DIR = join(app.getPath('downloads'), 'A2B Downloads');
const CONFIG_DIR = dirname(CONFIG_FILE);

// Schema definition without validate keyword
const schema = {
    downloadLocation: {
        type: 'string',
        default: DEFAULT_DOWNLOAD_DIR
    },
    maxConcurrentDownloads: {
        type: 'number',
        default: CONFIG.maxConcurrency,
        minimum: 1,
        maximum: 20
    },
    downloadRetryAttempts: {
        type: 'number',
        default: CONFIG.maxRetries,
        minimum: 0,
        maximum: 5
    },
    downloadDirectory: {
        type: 'string',
        default: CONFIG.downloadDir
    },
    cloudSyncPath: {
        type: 'string',
        default: CONFIG.cloudSyncPath
    },
    ffmpegThreads: {
        type: 'number',
        default: CONFIG.ffmpegThreads,
        minimum: 1,
        maximum: 32
    },
    autoCreateSubfolders: {
        type: 'boolean',
        default: true
    },
    overwriteExisting: {
        type: 'boolean',
        default: false
    },
    lastUsedDirectory: {
        type: 'string',
        default: ''
    }
};

// Custom validation functions
const validateConfig = {
    downloadLocation: (value) => {
        if (!value) throw new Error('Download location cannot be empty');
        if (!isAbsolute(value)) throw new Error('Download location must be an absolute path');
        return true;
    },
    maxConcurrentDownloads: (value) => {
        if (value < 1 || value > 20) throw new Error('Max concurrent downloads must be between 1 and 20');
        return true;
    },
    downloadRetryAttempts: (value) => {
        if (value < 0 || value > 5) throw new Error('Retry attempts must be between 0 and 5');
        return true;
    },
    cloudSyncPath: (value) => {
        if (value && !isAbsolute(value)) throw new Error('Cloud sync path must be an absolute path');
        return true;
    },
    ffmpegThreads: (value) => {
        if (value < 1 || value > 32) throw new Error('FFmpeg threads must be between 1 and 32');
        return true;
    }
};

class ConfigManager {
    constructor() {
        this.store = null;
        this.lastError = null;
        this.isInitialized = false;
        this._initPromise = null;
        this._defaultDownloadLocation = DEFAULT_DOWNLOAD_DIR;
    }

    async init() {
        // Prevent multiple simultaneous initializations
        if (this._initPromise) {
            return this._initPromise;
        }

        this._initPromise = this._initialize();
        return this._initPromise;
    }

    async _initialize() {
        try {
            if (this.isInitialized) {
                logger.warn('Config manager already initialized');
                return;
            }

            // Create config directory if it doesn't exist
            if (!existsSync(CONFIG_DIR)) {
                await mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
            }

            // Import conf dynamically
            if (!Conf) {
                Conf = (await import('conf')).default;
            }

            // Initialize the store with schema
            this.store = new Conf({
                projectName: 'a2b-downloader',
                projectVersion: app.getVersion(),
                schema,
                clearInvalidConfig: true,
                migrations: {
                    '1.0.0': (store) => {
                        if (!store.has('maxConcurrentDownloads')) {
                            store.set('maxConcurrentDownloads', CONFIG.maxConcurrency);
                        }
                    },
                    '1.1.0': (store) => {
                        const oldPath = store.get('downloadLocation');
                        if (oldPath) {
                            store.set('downloadLocation', normalize(oldPath));
                        }
                    }
                }
            });

            // Set initialization flag before operations that need it
            this.isInitialized = true;

            // Now perform operations that require initialization
            await this._ensureInitialConfig();
            await this.ensureDownloadLocation();
            this._setupConfigWatcher();

            logger.info('Config manager initialized successfully');
            return true;

        } catch (error) {
            this.lastError = error;
            this.isInitialized = false;
            logger.error('Failed to initialize config manager', error);
            throw error;
        } finally {
            this._initPromise = null;
        }
    }

    async _ensureInitialConfig() {
        try {
            if (!existsSync(CONFIG_FILE)) {
                const initialConfig = {
                    downloadLocation: this._defaultDownloadLocation,
                    version: app.getVersion(),
                    lastUpdated: new Date().toISOString(),
                    ...CONFIG
                };

                await this.validateConfig(initialConfig);
                await this._writeConfig(initialConfig);
            }
        } catch (error) {
            logger.error('Failed to ensure initial config', error);
            throw error;
        }
    }

    async validateConfig(config) {
        const errors = [];
        for (const [key, value] of Object.entries(config)) {
            const validator = validateConfig[key];
            if (validator) {
                try {
                    await validator(value);
                } catch (error) {
                    errors.push(`${key}: ${error.message}`);
                }
            }
        }
        
        if (errors.length > 0) {
            throw new Error(`Config validation failed:\n${errors.join('\n')}`);
        }
        
        return true;
    }

    _setupConfigWatcher() {
        try {
            if (this.watcher) {
                this.watcher.close();
            }
            
            this.watcher = watch(CONFIG_FILE, (eventType) => {
                if (eventType === 'change') {
                    this._syncConfigFromFile().catch(error => {
                        logger.error('Error in config file watcher', error);
                    });
                }
            });
        } catch (error) {
            logger.error('Failed to set up config file watcher', error);
        }
    }

    async _syncConfigFromFile() {
        try {
            const config = await this._readConfig();
            await this.validateConfig(config);
            
            Object.keys(schema).forEach(key => {
                if (config[key] !== undefined && this.store.get(key) !== config[key]) {
                    this.store.set(key, config[key]);
                }
            });
        } catch (error) {
            logger.error('Error syncing config from file', error);
            throw error;
        }
    }

    async _readConfig() {
        try {
            const configData = readFileSync(CONFIG_FILE, 'utf8');
            return JSON.parse(configData);
        } catch (error) {
            logger.error('Error reading config file', error);
            return {};
        }
    }

    async _writeConfig(config) {
        try {
            if (existsSync(CONFIG_FILE)) {
                copyFileSync(CONFIG_FILE, `${CONFIG_FILE}.backup`);
            }

            const updatedConfig = {
                ...config,
                lastUpdated: new Date().toISOString()
            };

            await this.validateConfig(updatedConfig);
            writeFileSync(CONFIG_FILE, JSON.stringify(updatedConfig, null, 2), { mode: 0o600 });
            
            logger.info('Config written successfully');
            return true;
        } catch (error) {
            logger.error('Error writing config file', error);

            if (existsSync(`${CONFIG_FILE}.backup`)) {
                copyFileSync(`${CONFIG_FILE}.backup`, CONFIG_FILE);
                logger.info('Restored config from backup');
            }

            throw error;
        }
    }

    getDownloadLocation() {
        return this.isInitialized && this.store ? 
            this.store.get('downloadLocation', this._defaultDownloadLocation) : 
            this._defaultDownloadLocation;
    }

    async setDownloadLocation(location) {
        if (!this.isInitialized) throw new Error('Config manager not initialized');
        if (!location) throw new Error('Download location cannot be empty');

        try {
            const normalizedPath = normalize(location);
            
            if (!isAbsolute(normalizedPath)) {
                throw new Error('Download location must be an absolute path');
            }

            if (!existsSync(normalizedPath)) {
                await mkdirSync(normalizedPath, { recursive: true, mode: 0o700 });
            }

            await accessSync(normalizedPath, constants.W_OK);

            this.store.set('downloadLocation', normalizedPath);
            await this._writeConfig({ 
                ...await this._readConfig(), 
                downloadLocation: normalizedPath 
            });

            logger.info('Download location updated successfully', { location: normalizedPath });
            return normalizedPath;
        } catch (error) {
            logger.error('Failed to set download location', error);
            throw error;
        }
    }

    async ensureDownloadLocation() {
        try {
            const location = this.getDownloadLocation();
            if (!existsSync(location)) {
                await mkdirSync(location, { recursive: true, mode: 0o700 });
                logger.info('Created download directory', { location });
            }
            return location;
        } catch (error) {
            logger.error('Failed to ensure download location', error);
            throw error;
        }
    }

    getConfig(key) {
        if (!this.isInitialized) return null;
        return this.store ? this.store.get(key) : null;
    }

    getAllSettings() {
        if (!this.isInitialized) return null;
        return this.store ? {
            ...this.store.store,
            fileConfig: this._readConfig()
        } : null;
    }

    async updateSettings(settings) {
        if (!this.isInitialized) throw new Error('Config manager not initialized');
        
        try {
            await this.validateConfig(settings);

            Object.entries(settings).forEach(([key, value]) => {
                if (schema[key]) {
                    this.store.set(key, value);
                }
            });

            await this._writeConfig({ 
                ...await this._readConfig(), 
                ...settings 
            });

            logger.info('Settings updated successfully');
        } catch (error) {
            logger.error('Failed to update settings', error);
            throw error;
        }
    }

    async clearAll() {
        if (!this.isInitialized) throw new Error('Config manager not initialized');
        
        try {
            this.store.clear();
            await this._writeConfig({
                downloadLocation: this._defaultDownloadLocation,
                version: app.getVersion(),
                lastUpdated: new Date().toISOString()
            });
            await this.ensureDownloadLocation();
            logger.info('Config cleared successfully');
        } catch (error) {
            logger.error('Failed to clear config', error);
            throw error;
        }
    }

    getLastError() {
        return this.lastError;
    }

    getLogger() {
        return logger;
    }

    getDefaultConfig() {
        return CONFIG;
    }

    dispose() {
        if (this.watcher) {
            this.watcher.close();
        }
        this.isInitialized = false;
        this._initPromise = null;
    }
}

// Create and export a singleton instance
const configManagerInstance = new ConfigManager();
module.exports = configManagerInstance;