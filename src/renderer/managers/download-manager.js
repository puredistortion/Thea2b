const BaseManager = require('./base-manager');

class DownloadManager extends BaseManager {
    constructor() {
        super();
        this.lastProgressUpdate = Date.now();
        this.progressUpdateThreshold = 100;
        this.currentDownloadLocation = '';
        this.urlHandling = {
            currentURL: '',
            isProcessing: false
        };
    }

    async init() {
        try {
            this.elements = this.validateElements({
                urlInput: 'url',
                cookiesInput: 'cookies',
                downloadButton: 'downloadButton',
                progressBar: 'progressBar',
                progressText: 'progressText',
                locationDisplay: 'current-location'
            });

            await this.loadDownloadLocation();
            this.setupIpcListeners();
            this.initialized = true;
        } catch (error) {
            this.handleError(new Error('Failed to initialize DownloadManager: ' + error.message));
        }
    }

    setupIpcListeners() {
        window.api.receive('download:progress', (progress) => this.handleProgress(progress));
        window.api.receive('download:status', (status) => this.handleDownloadStatus(status));
        window.api.receive('download-location-updated', (location) => this.updateLocationDisplay(location));
    }

    async loadDownloadLocation() {
        try {
            const result = await window.api.invoke('get-download-location');
            if (result.location) {
                this.updateLocationDisplay(result.location);
            }
        } catch (error) {
            this.handleError(error);
        }
    }

    updateLocationDisplay(location) {
        this.currentDownloadLocation = location;
        if (this.elements.locationDisplay) {
            this.elements.locationDisplay.textContent = location;
        }
    }

    async startDownload() {
        const url = this.elements.urlInput.value.trim();
        const cookiesInput = this.elements.cookiesInput.value.trim();

        if (!this.validateDownload(url)) return;

        try {
            this.resetProgress();
            this.updateStatus('Starting download...');
            this.elements.downloadButton.disabled = true;

            await window.api.invoke('download:video', {
                url,
                cookies: cookiesInput,
                downloadLocation: this.currentDownloadLocation
            });
        } catch (error) {
            this.handleError(error);
            this.resetProgress();
        } finally {
            this.elements.downloadButton.disabled = false;
        }
    }

    validateDownload(url) {
        if (!url) {
            this.showToast('Please enter a video URL', 'error');
            return false;
        }

        if (!this.currentDownloadLocation) {
            this.showToast('Please select a download location', 'error');
            return false;
        }

        if (!this.isValidURL(url)) {
            this.showToast('Please enter a valid URL', 'error');
            return false;
        }

        return true;
    }

    isValidURL(url) {
        try {
            new URL(url);
            return true;
        } catch {
            return false;
        }
    }

    handleProgress(progress) {
        const now = Date.now();
        if (now - this.lastProgressUpdate >= this.progressUpdateThreshold) {
            this.updateProgress(progress);
            this.lastProgressUpdate = now;
        }
    }

    handleDownloadStatus(status) {
        this.updateStatus(status);
        if (status.includes('Complete')) {
            this.showToast('Download completed');
            this.elements.cookiesInput.value = '';
        }
    }

    updateProgress(progress) {
        progress = Math.max(0, Math.min(100, progress));
        if (this.elements.progressBar) {
            this.elements.progressBar.style.width = `${progress}%`;
            this.elements.progressBar.setAttribute('aria-valuenow', progress);
        }
        this.updateStatus(`Progress: ${progress.toFixed(1)}%`);
    }

    resetProgress() {
        this.updateProgress(0);
    }

    updateStatus(status) {
        if (this.elements.progressText) {
            this.elements.progressText.textContent = status;
        }
    }
}

module.exports = new DownloadManager();