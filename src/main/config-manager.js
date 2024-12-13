const { app } = require('electron');
const { join, normalize, isAbsolute } = require('path');
const { mkdirSync, existsSync, accessSync, constants } = require('fs');
const electronLog = require('electron-log');

// Enhanced logger configuration
const logger = {
    info: (message, data = {}) => electronLog.info(`[ConfigManager] ${message}`, data),
    error: (context, error) => electronLog.error(`[ConfigManager] ${context}:`, error.message || error, error.stack),
    warn: (message, data = {}) => electronLog.warn(`[ConfigManager] ${message}`, data),
    debug: (message, data = {}) => electronLog.debug(`[ConfigManager] ${message}`, data)
};

let Conf = null;

// Core configuration
const CONFIG = {
    maxConcurrency: 10,
    maxRetries: 3,
    downloadDir: 'downloads',
    cloudSyncPath: '/Users/ctb_ceo/Library/Mobile Documents/com~apple~CloudDocs/A2B/',
    ffmpegThreads: 8,
    cookieManagerConfig: {
        maxRetries: 3,
        timeout: 30000,
        maxConcurrency: 1
    }
};

// Default paths
const DEFAULT_DOWNLOAD_DIR = join(app.getPath('downloads'), 'A2B Downloads');

// Schema extended with cookie manager configuration
const schema = {
    downloadLocation: {
        type: 'string',
        default: DEFAULT_DOWNLOAD_DIR
    },
    cookieManagerConfig: {
        type: 'object',
        default: CONFIG.cookieManagerConfig,
        properties: {
            maxRetries: { type: 'number', default: 3, minimum: 1, maximum: 5 },
            timeout: { type: 'number', default: 30000, minimum: 5000, maximum: 60000 },
            maxConcurrency: { type: 'number', default: 1, minimum: 1, maximum: 3 },
        },
    },
};

// Validation logic for configurations
const validateConfig = {
    downloadLocation: (value) => {
        if (!value) throw new Error('Download location cannot be empty');
        if (!isAbsolute(value)) throw new Error('Download location must be an absolute path');
        return true;
    },
    cookieManagerConfig: (value) => {
        if (!value || typeof value !== 'object') throw new Error('Cookie manager config must be an object');
        if (value.maxRetries < 1 || value.maxRetries > 5) throw new Error('Cookie manager max retries must be between 1 and 5');
        if (value.timeout < 5000 || value.timeout > 60000) throw new Error('Cookie manager timeout must be between 5000 and 60000');
        if (value.maxConcurrency < 1 || value.maxConcurrency > 3) throw new Error('Cookie manager max concurrency must be between 1 and 3');
        return true;
    },
};

class ConfigManager {
    constructor() {
        this.isInitialized = false;
        this.store = null;
        this._defaultDownloadLocation = DEFAULT_DOWNLOAD_DIR;
    }

    async init() {
        if (this.isInitialized) {
            logger.warn('Config manager already initialized');
            return;
        }

        try {
            await this._initialize();
            await this.ensureDownloadLocation();
            logger.info('Config manager initialized successfully');
        } catch (error) {
            logger.error('Failed to initialize config manager', error);
            throw error;
        }
    }

    async _initialize() {
        const CONFIG_DIR = join(app.getPath('userData'), 'config');
        if (!existsSync(CONFIG_DIR)) mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });

        let retryCount = 0;
        while (!Conf && retryCount < 3) {
            try {
                Conf = (await import('conf')).default;
            } catch (error) {
                retryCount++;
                if (retryCount === 3) throw error;
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }

        this.store = new Conf({
            projectName: 'a2b-downloader',
            projectVersion: app.getVersion(),
            schema,
            clearInvalidConfig: true,
            migrations: {
                '1.2.0': (store) => {
                    if (!store.has('cookieManagerConfig')) {
                        store.set('cookieManagerConfig', CONFIG.cookieManagerConfig);
                    }
                },
            },
        });

        this.isInitialized = true;
    }

    getDownloadLocation() {
        return this.isInitialized && this.store ? 
            this.store.get('downloadLocation', this._defaultDownloadLocation) : 
            this._defaultDownloadLocation;
    }

    async ensureDownloadLocation() {
        try {
            const location = this.getDownloadLocation();
            
            if (!existsSync(location)) {
                await mkdirSync(location, { recursive: true, mode: 0o755 });
                logger.info('Created download directory', { location });
            }
                
            await accessSync(location, constants.W_OK);
            return location;
        } catch (error) {
            logger.error('Failed to ensure download location', error);
            try {
                await mkdirSync(this._defaultDownloadLocation, { recursive: true, mode: 0o755 });
                if (this.store) {
                    this.store.set('downloadLocation', this._defaultDownloadLocation);
                }
                return this._defaultDownloadLocation;
            } catch (innerError) {
                logger.error('Failed to create fallback location', innerError);
                throw error;
            }
        }
    }

    getCookieManagerConfig() {
        if (!this.isInitialized) return CONFIG.cookieManagerConfig;
        return this.store ? this.store.get('cookieManagerConfig', CONFIG.cookieManagerConfig) : CONFIG.cookieManagerConfig;
    }

    validateCookieManagerConfig(value) {
        return validateConfig.cookieManagerConfig(value);
    }

    getConfig(key) {
        if (!this.isInitialized) return null;
        return this.store ? this.store.get(key) : null;
    }
}

module.exports = new ConfigManager();