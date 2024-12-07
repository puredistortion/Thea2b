const BaseManager = require('./base-manager');

class ToastManager extends BaseManager {
    constructor() {
        super();
        this.toasts = new Set();
    }

    async init() {
        this.initialized = true;
    }

    showToast(message, type = 'info', duration = 3000) {
        const toast = this.createToastElement(message, type);
        document.body.appendChild(toast);
        this.toasts.add(toast);

        // Trigger reflow to ensure animation plays
        toast.offsetHeight;
        toast.classList.add('show');

        setTimeout(() => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                toast.remove();
                this.toasts.delete(toast);
            }, 300);
        }, duration);
    }

    createToastElement(message, type) {
        const toast = document.createElement('div');
        toast.className = `toast-notification ${type}`;
        toast.textContent = message;
        toast.setAttribute('role', 'alert');
        return toast;
    }

    clearAllToasts() {
        this.toasts.forEach(toast => {
            toast.remove();
        });
        this.toasts.clear();
    }
}

module.exports = new ToastManager();