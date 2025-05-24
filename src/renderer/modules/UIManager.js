/**
 * @fileoverview UI Manager for MCP renderer process
 * Handles UI state management, rendering, and DOM operations
 */

// Import utilities
import { DOMSafe } from '../dom-safe.js';
import { UINotification } from '../ui-notification.js';
import IPCService from '../services/IPCService.js';

export class UIManager {
    constructor() {
        this.renderCallbacks = new Map();
        this.initialized = false;
    }

    /**
     * Initialize UI Manager
     */
    async init() {
        if (this.initialized) return;
        
        try {
            if (window.MonitoringService) {
                window.MonitoringService.info('Initializing UI Manager', { operation: 'ui-init' }, 'renderer');
            }
            this.setupEventListeners();
            this.initialized = true;
            if (window.MonitoringService) {
                window.MonitoringService.info('UI Manager initialized successfully', { operation: 'ui-init-complete' }, 'renderer');
            }
        } catch (error) {
            if (window.MonitoringService) {
                window.MonitoringService.error('Failed to initialize UI Manager', {
                    error: error.message,
                    stack: error.stack,
                    operation: 'ui-init'
                }, 'renderer');
            }
            throw error;
        }
    }

    /**
     * Setup global event listeners
     */
    setupEventListeners() {
        // Handle window resize
        window.addEventListener('resize', this.handleResize.bind(this));
        
        // Handle theme changes
        if (window.matchMedia) {
            const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
            mediaQuery.addEventListener('change', this.handleThemeChange.bind(this));
        }
    }

    /**
     * Handle window resize events
     */
    handleResize() {
        // Emit resize event for components that need to respond
        this.emitEvent('ui:resize', {
            width: window.innerWidth,
            height: window.innerHeight
        });
    }

    /**
     * Handle theme change events
     */
    handleThemeChange(event) {
        const isDark = event.matches;
        if (window.MonitoringService) {
            window.MonitoringService.info('Theme change detected', { isDark, operation: 'theme-change' }, 'renderer');
        }
        this.emitEvent('ui:theme-change', { isDark });
    }

    /**
     * Register a callback for specific events
     * @param {string} event - Event name
     * @param {Function} callback - Callback function
     */
    onEvent(event, callback) {
        if (!this.renderCallbacks.has(event)) {
            this.renderCallbacks.set(event, []);
        }
        this.renderCallbacks.get(event).push(callback);
    }

    /**
     * Emit an event to registered callbacks
     * @param {string} event - Event name
     * @param {any} data - Event data
     */
    emitEvent(event, data) {
        const callbacks = this.renderCallbacks.get(event) || [];
        callbacks.forEach(callback => {
            try {
                callback(data);
            } catch (error) {
                if (window.MonitoringService) {
                    window.MonitoringService.error('Error in UI event callback', {
                        event,
                        error: error.message,
                        operation: 'ui-event-callback'
                    }, 'renderer');
                }
            }
        });
    }

    /**
     * Create safe HTML element from template
     * @param {string} tag - HTML tag name
     * @param {Object} attributes - Element attributes
     * @param {string} content - Element content (will be sanitized)
     * @returns {HTMLElement} Created element
     */
    createElement(tag, attributes = {}, content = '') {
        try {
            const element = document.createElement(tag);
            
            // Set attributes safely
            Object.entries(attributes).forEach(([key, value]) => {
                if (key === 'className') {
                    element.className = DOMSafe?.sanitizeClassName(value) || '';
                } else if (key === 'href' && tag === 'a') {
                    element.href = DOMSafe?.sanitizeURL(value) || '#';
                } else if (typeof value === 'string') {
                    element.setAttribute(key, value);
                }
            });
            
            // Set content safely
            if (content) {
                if (DOMSafe) {
                    DOMSafe.setText(element, content);
                } else {
                    element.textContent = content;
                }
            }
            
            return element;
        } catch (error) {
            if (window.MonitoringService) {
                window.MonitoringService.error('Error creating element', {
                    tag,
                    attributes,
                    error: error.message,
                    operation: 'create-element'
                }, 'renderer');
            }
            throw error;
        }
    }

    /**
     * Show loading state on element
     * @param {HTMLElement} element - Element to show loading on
     * @param {string} message - Loading message
     */
    showLoading(element, message = 'Loading...') {
        if (!element) return;
        
        const loadingDiv = this.createElement('div', {
            className: 'loading-overlay'
        });
        
        const spinner = this.createElement('div', {
            className: 'loading-spinner'
        });
        
        const messageDiv = this.createElement('div', {
            className: 'loading-message'
        }, message);
        
        loadingDiv.appendChild(spinner);
        loadingDiv.appendChild(messageDiv);
        
        // Add loading styles if not present
        this.ensureLoadingStyles();
        
        element.style.position = 'relative';
        element.appendChild(loadingDiv);
    }

    /**
     * Hide loading state from element
     * @param {HTMLElement} element - Element to hide loading from
     */
    hideLoading(element) {
        if (!element) return;
        
        const loadingOverlay = element.querySelector('.loading-overlay');
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
    }

    /**
     * Show error state on element
     * @param {HTMLElement} element - Element to show error on
     * @param {string} message - Error message
     * @param {Function} retryCallback - Optional retry callback
     */
    showError(element, message = 'An error occurred', retryCallback = null) {
        if (!element) return;
        
        const errorDiv = this.createElement('div', {
            className: 'error-state'
        });
        
        const messageDiv = this.createElement('div', {
            className: 'error-message'
        }, message);
        
        errorDiv.appendChild(messageDiv);
        
        if (retryCallback) {
            const retryButton = this.createElement('button', {
                className: 'btn btn-primary btn-sm'
            }, 'Retry');
            
            retryButton.addEventListener('click', (e) => {
                e.preventDefault();
                this.hideError(element);
                retryCallback();
            });
            
            errorDiv.appendChild(retryButton);
        }
        
        // Add error styles if not present
        this.ensureErrorStyles();
        
        element.innerHTML = '';
        element.appendChild(errorDiv);
    }

    /**
     * Hide error state from element
     * @param {HTMLElement} element - Element to hide error from
     */
    hideError(element) {
        if (!element) return;
        
        const errorState = element.querySelector('.error-state');
        if (errorState) {
            errorState.remove();
        }
    }

    /**
     * Toggle element visibility with animation
     * @param {HTMLElement} element - Element to toggle
     * @param {boolean} show - Whether to show or hide
     */
    toggleVisibility(element, show) {
        if (!element) return;
        
        if (show) {
            element.style.display = '';
            element.classList.remove('hidden');
            element.classList.add('fade-in');
        } else {
            element.classList.add('fade-out');
            setTimeout(() => {
                element.style.display = 'none';
                element.classList.add('hidden');
                element.classList.remove('fade-out');
            }, 300);
        }
    }

    /**
     * Ensure loading styles are present
     */
    ensureLoadingStyles() {
        if (document.getElementById('ui-loading-styles')) return;
        
        const styles = `
            .loading-overlay {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: rgba(255, 255, 255, 0.9);
                display: flex;
                flex-direction: column;
                align-items: center;
                justify-content: center;
                z-index: 1000;
            }
            
            .loading-spinner {
                width: 32px;
                height: 32px;
                border: 3px solid var(--neutral-80);
                border-top: 3px solid var(--primary);
                border-radius: 50%;
                animation: spin 1s linear infinite;
            }
            
            .loading-message {
                margin-top: 12px;
                color: var(--text-secondary);
                font-size: 14px;
            }
            
            @keyframes spin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            .fade-in {
                animation: fadeIn 0.3s ease-in;
            }
            
            .fade-out {
                animation: fadeOut 0.3s ease-out;
            }
            
            @keyframes fadeIn {
                from { opacity: 0; }
                to { opacity: 1; }
            }
            
            @keyframes fadeOut {
                from { opacity: 1; }
                to { opacity: 0; }
            }
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.id = 'ui-loading-styles';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    /**
     * Ensure error styles are present
     */
    ensureErrorStyles() {
        if (document.getElementById('ui-error-styles')) return;
        
        const styles = `
            .error-state {
                padding: 20px;
                text-align: center;
                color: var(--error-color);
                background: var(--error-bg);
                border: 1px solid var(--error-color);
                border-radius: 8px;
                margin: 16px 0;
            }
            
            .error-message {
                margin-bottom: 12px;
                font-weight: 500;
            }
            
            .error-state .btn {
                margin-top: 8px;
            }
        `;
        
        const styleSheet = document.createElement('style');
        styleSheet.id = 'ui-error-styles';
        styleSheet.textContent = styles;
        document.head.appendChild(styleSheet);
    }

    /**
     * Cleanup UI Manager resources
     */
    destroy() {
        this.renderCallbacks.clear();
        this.initialized = false;
        if (window.MonitoringService) {
            window.MonitoringService.info('UI Manager destroyed', { operation: 'ui-cleanup' }, 'renderer');
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.UIManager = UIManager;
}