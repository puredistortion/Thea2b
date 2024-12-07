const showToast = (message, type = 'info', duration = 3000) => {
    // Remove any existing toasts
    const existingToasts = document.querySelectorAll('.toast-notification');
    existingToasts.forEach(toast => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    });

    // Create new toast
    const toast = document.createElement('div');
    toast.className = `toast-notification ${type}`;
    toast.setAttribute('role', 'alert');
    toast.setAttribute('aria-live', 'polite');
    
    // Create message container
    const messageContent = document.createElement('div');
    messageContent.className = 'toast-message';
    messageContent.textContent = message;
    
    // Add icon based on type
    const icon = document.createElement('span');
    icon.className = 'toast-icon';
    switch (type) {
        case 'success':
            icon.textContent = '✓';
            break;
        case 'error':
            icon.textContent = '✕';
            break;
        case 'warning':
            icon.textContent = '⚠';
            break;
        default:
            icon.textContent = 'ℹ';
    }

    // Assemble toast
    toast.appendChild(icon);
    toast.appendChild(messageContent);
    document.body.appendChild(toast);

    // Handle animation and removal
    requestAnimationFrame(() => {
        toast.classList.add('show');
        
        const dismiss = () => {
            toast.classList.add('fade-out');
            setTimeout(() => {
                if (document.body.contains(toast)) {
                    document.body.removeChild(toast);
                }
            }, 300);
        };

        // Add click to dismiss
        toast.addEventListener('click', () => {
            dismiss();
        });

        // Auto dismiss after duration
        if (duration) {
            setTimeout(() => {
                dismiss();
            }, duration);
        }
    });

    // Log notification for debugging
    console.log(`Toast notification: ${type} - ${message}`);
};

// Queue system for multiple notifications
const notificationQueue = [];
let isProcessingQueue = false;

const processNotificationQueue = () => {
    if (isProcessingQueue || notificationQueue.length === 0) return;
    
    isProcessingQueue = true;
    const { message, type, duration } = notificationQueue.shift();
    
    showToast(message, type, duration);
    
    setTimeout(() => {
        isProcessingQueue = false;
        processNotificationQueue();
    }, 300);
};

const queueNotification = (message, type = 'info', duration = 3000) => {
    notificationQueue.push({ message, type, duration });
    processNotificationQueue();
};

// Helper functions for common notifications
const showSuccess = (message, duration) => queueNotification(message, 'success', duration);
const showError = (message, duration) => queueNotification(message, 'error', duration);
const showWarning = (message, duration) => queueNotification(message, 'warning', duration);
const showInfo = (message, duration) => queueNotification(message, 'info', duration);

// System notification support check
const hasNotificationSupport = () => {
    return 'Notification' in window;
};

// Request notification permission
const requestNotificationPermission = async () => {
    if (!hasNotificationSupport()) return false;
    
    try {
        const permission = await Notification.requestPermission();
        return permission === 'granted';
    } catch (error) {
        console.error('Error requesting notification permission:', error);
        return false;
    }
};

// Show system notification
const showSystemNotification = (title, options = {}) => {
    if (!hasNotificationSupport() || Notification.permission !== 'granted') return;
    
    try {
        new Notification(title, {
            icon: '/path/to/icon.png', // Replace with actual icon path
            ...options
        });
    } catch (error) {
        console.error('Error showing system notification:', error);
        // Fallback to toast notification
        showToast(title, options.type || 'info');
    }
};

module.exports = {
    showToast,
    queueNotification,
    showSuccess,
    showError,
    showWarning,
    showInfo,
    showSystemNotification,
    requestNotificationPermission,
    hasNotificationSupport
};