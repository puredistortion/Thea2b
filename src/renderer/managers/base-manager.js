class BaseManager {
    constructor() {
        this.elements = {};
        this.initialized = false;
    }

    validateElement(elementId) {
        const element = document.getElementById(elementId);
        if (!element) {
            throw new Error(`Element not found: ${elementId}`);
        }
        return element;
    }

    validateElements(elements) {
        const validatedElements = {};
        for (const [key, id] of Object.entries(elements)) {
            validatedElements[key] = this.validateElement(id);
        }
        return validatedElements;
    }

    showToast(message, type = 'info') {
        // This will be overridden by ToastManager but provides a default
        console.log(`Toast (${type}): ${message}`);
    }

    handleError(error) {
        console.error('Manager error:', error);
        this.showToast(error.message || 'An error occurred', 'error');
    }
}