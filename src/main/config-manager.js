const { app } = require('electron');
const { join, dirname, normalize, isAbsolute } = require('path');
const { readFileSync, writeFileSync, mkdirSync, accessSync, existsSync, watch, copyFileSync, constants } = require('fs');
const electronLog = require('electron-log');

// Start of content from previous parts...
[Previous content remains exactly the same until the end of _writeConfig method]

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
                await mkdirSync(normalizedPath, { recursive: true, mode: 0o755 });
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
            
            if (location.startsWith('/Volumes/')) {
                const driveName = location.split('/')[2];
                const driveRoot = `/Volumes/${driveName}`;
                
                if (!existsSync(driveRoot)) {
                    logger.error(`External drive "${driveName}" is not mounted`);
                    const fallbackLocation = DEFAULT_DOWNLOAD_DIR;
                    await this.setDownloadLocation(fallbackLocation);
                    return fallbackLocation;
                }

                try {
                    await accessSync(driveRoot, constants.W_OK);
                } catch (error) {
                    logger.error(`No write permission for external drive "${driveName}"`);
                    const fallbackLocation = DEFAULT_DOWNLOAD_DIR;
                    await this.setDownloadLocation(fallbackLocation);
                    return fallbackLocation;
                }
            }

            try {
                if (!existsSync(location)) {
                    await mkdirSync(location, { recursive: true, mode: 0o755 });
                    logger.info('Created download directory', { location });
                }
                
                await accessSync(location, constants.W_OK);
                
            } catch (error) {
                logger.error(`Failed to create or access download location: ${location}`, error);
                const fallbackLocation = DEFAULT_DOWNLOAD_DIR;
                await this.setDownloadLocation(fallbackLocation);
                return fallbackLocation;
            }
            
            return location;
        } catch (error) {
            logger.error('Failed to ensure download location', error);
            const fallbackLocation = DEFAULT_DOWNLOAD_DIR;
            try {
                await mkdirSync(fallbackLocation, { recursive: true, mode: 0o755 });
                await this.setDownloadLocation(fallbackLocation);
                return fallbackLocation;
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

    verifyInitialization() {
        if (!this.isInitialized) {
            throw new Error('Config manager not initialized. Call init() first.');
        }
        return true;
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

// Add initialization promise to export
configManagerInstance.initPromise = configManagerInstance.init();

module.exports = configManagerInstance;