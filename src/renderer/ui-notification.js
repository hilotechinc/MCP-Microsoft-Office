/**
 * @fileoverview UI Notification system for user feedback
 * Provides standardized error/success notifications to users
 */

/**
 * UI Notification utility for user feedback
 */
export class UINotification {
    /**
     * Show error notification to user
     * @param {string} message - User-friendly error message
     * @param {Object} options - Notification options
     */
    static showError(message, options = {}) {
        const notification = this.createNotification('error', message, options);
        this.displayNotification(notification);
        
        // Log the user notification
        if (window.MonitoringService) {
            window.MonitoringService.info('Error notification shown to user', {
                message,
                type: 'error',
                operation: 'user-notification'
            }, 'renderer');
        }
    }
    
    /**
     * Show success notification to user
     * @param {string} message - Success message
     * @param {Object} options - Notification options
     */
    static showSuccess(message, options = {}) {
        const notification = this.createNotification('success', message, options);
        this.displayNotification(notification);
        
        // Log the user notification
        if (window.MonitoringService) {
            window.MonitoringService.info('Success notification shown to user', {
                message,
                type: 'success',
                operation: 'user-notification'
            }, 'renderer');
        }
    }
    
    /**
     * Show warning notification to user
     * @param {string} message - Warning message
     * @param {Object} options - Notification options
     */
    static showWarning(message, options = {}) {
        const notification = this.createNotification('warning', message, options);
        this.displayNotification(notification);
        
        // Log the user notification
        if (window.MonitoringService) {
            window.MonitoringService.info('Warning notification shown to user', {
                message,
                type: 'warning',
                operation: 'user-notification'
            }, 'renderer');
        }
    }
    
    /**
     * Show info notification to user
     * @param {string} message - Info message
     * @param {Object} options - Notification options
     */
    static showInfo(message, options = {}) {
        const notification = this.createNotification('info', message, options);
        this.displayNotification(notification);
        
        // Log the user notification
        if (window.MonitoringService) {
            window.MonitoringService.info('Info notification shown to user', {
                message,
                type: 'info',
                operation: 'user-notification'
            }, 'renderer');
        }
    }
    
    /**
     * Create notification element
     * @param {string} type - Notification type (error, success, warning, info)
     * @param {string} message - Message to display
     * @param {Object} options - Options for the notification
     * @returns {HTMLElement} Notification element
     */
    static createNotification(type, message, options = {}) {
        const {
            duration = type === 'error' ? 8000 : 4000,
            closable = true,
            id = `notification-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
        } = options;
        
        const notification = document.createElement('div');
        notification.id = id;
        notification.className = `notification notification-${type}`;
        
        // Use DOMSafe if available for secure text setting
        if (window.DOMSafe) {
            window.DOMSafe.setText(notification, message);
        } else {
            notification.textContent = message;
        }
        
        // Add close button if closable
        if (closable) {
            const closeButton = document.createElement('button');
            closeButton.className = 'notification-close';
            closeButton.innerHTML = '&times;';
            closeButton.setAttribute('aria-label', 'Close notification');
            
            closeButton.addEventListener('click', () => {
                this.removeNotification(notification);
            });
            
            notification.appendChild(closeButton);
        }
        
        // Auto-remove after duration
        if (duration > 0) {
            setTimeout(() => {
                this.removeNotification(notification);
            }, duration);
        }
        
        return notification;
    }
    
    /**
     * Display notification in the UI
     * @param {HTMLElement} notification - Notification element to display
     */
    static displayNotification(notification) {
        let container = document.getElementById('notification-container');
        
        // Create container if it doesn't exist
        if (!container) {
            container = document.createElement('div');
            container.id = 'notification-container';
            container.className = 'notification-container';
            document.body.appendChild(container);
        }
        
        container.appendChild(notification);
        
        // Trigger animation
        setTimeout(() => {
            notification.classList.add('notification-show');
        }, 10);
    }
    
    /**
     * Remove notification from UI
     * @param {HTMLElement} notification - Notification to remove
     */
    static removeNotification(notification) {
        if (!notification || !notification.parentNode) return;
        
        notification.classList.add('notification-hide');
        
        setTimeout(() => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        }, 300);
    }
    
    /**
     * Clear all notifications
     */
    static clearAll() {
        const container = document.getElementById('notification-container');
        if (container) {
            container.innerHTML = '';
        }
    }
    
    /**
     * Handle error with user notification and logging
     * @param {Error} error - Error object
     * @param {string} userMessage - User-friendly message
     * @param {Object} context - Additional context for logging
     */
    static handleError(error, userMessage = 'An error occurred. Please try again.', context = {}) {
        // Show user-friendly message
        this.showError(userMessage);
        
        // Log detailed error for debugging
        if (window.MonitoringService && window.ErrorService) {
            const mcpError = window.ErrorService.createError(
                'renderer',
                error.message || 'Unknown error',
                'error',
                {
                    ...context,
                    stack: error.stack,
                    operation: context.operation || 'unknown',
                    timestamp: new Date().toISOString()
                }
            );
            window.MonitoringService.logError(mcpError);
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.UINotification = UINotification;
}

// Add CSS styles for notifications
const notificationStyles = `
.notification-container {
    position: fixed;
    top: 20px;
    right: 20px;
    z-index: 10000;
    max-width: 400px;
    pointer-events: none;
}

.notification {
    background: var(--surface);
    border: 1px solid var(--border-color);
    border-radius: 8px;
    padding: 16px;
    margin-bottom: 12px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
    opacity: 0;
    transform: translateX(100%);
    transition: all 0.3s ease;
    pointer-events: auto;
    position: relative;
    word-wrap: break-word;
}

.notification-show {
    opacity: 1;
    transform: translateX(0);
}

.notification-hide {
    opacity: 0;
    transform: translateX(100%);
}

.notification-error {
    border-left: 4px solid var(--error-color, #e74c3c);
    background: var(--error-bg, #fdf2f2);
}

.notification-success {
    border-left: 4px solid var(--success-color, #27ae60);
    background: var(--success-bg, #f0fdf4);
}

.notification-warning {
    border-left: 4px solid var(--warning-color, #f39c12);
    background: var(--warning-bg, #fffbf0);
}

.notification-info {
    border-left: 4px solid var(--info-color, #3498db);
    background: var(--info-bg, #f0f9ff);
}

.notification-close {
    position: absolute;
    top: 8px;
    right: 8px;
    background: none;
    border: none;
    font-size: 18px;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 4px;
    line-height: 1;
}

.notification-close:hover {
    color: var(--text-primary);
}

@media (max-width: 480px) {
    .notification-container {
        left: 20px;
        right: 20px;
        max-width: none;
    }
    
    .notification {
        transform: translateY(-100%);
    }
    
    .notification-show {
        transform: translateY(0);
    }
    
    .notification-hide {
        transform: translateY(-100%);
    }
}
`;

// Inject styles if not already present
if (typeof document !== 'undefined' && !document.getElementById('notification-styles')) {
    const styleSheet = document.createElement('style');
    styleSheet.id = 'notification-styles';
    styleSheet.textContent = notificationStyles;
    document.head.appendChild(styleSheet);
}