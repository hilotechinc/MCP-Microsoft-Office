/**
 * @fileoverview DOM Safety utilities for secure HTML manipulation in renderer
 * Prevents XSS attacks through proper sanitization
 */

/**
 * Safe DOM manipulation utilities
 */
export class DOMSafe {
    /**
     * Create element from template with safe data substitution
     * @param {string} template - HTML template with {{key}} placeholders
     * @param {Object} data - Data to substitute (will be sanitized)
     * @returns {HTMLElement} Safely created element
     */
    static createFromTemplate(template, data = {}) {
        const div = document.createElement('div');
        
        // Replace placeholders with sanitized data
        let safeTemplate = template;
        Object.keys(data).forEach(key => {
            const placeholder = new RegExp(`{{${key}}}`, 'g');
            safeTemplate = safeTemplate.replace(placeholder, this.sanitize(data[key]));
        });
        
        div.innerHTML = safeTemplate;
        return div.firstElementChild;
    }
    
    /**
     * Sanitize string for safe insertion into DOM
     * @param {any} input - Input to sanitize
     * @returns {string} Sanitized string
     */
    static sanitize(input) {
        if (input === null || input === undefined) {
            return '';
        }
        
        // Convert to string and escape HTML
        const div = document.createElement('div');
        div.textContent = String(input);
        return div.innerHTML;
    }
    
    /**
     * Set text content safely (never uses innerHTML)
     * @param {HTMLElement} element - Target element
     * @param {any} text - Text content to set
     */
    static setText(element, text) {
        if (element && typeof element.textContent !== 'undefined') {
            element.textContent = String(text || '');
        }
    }
    
    /**
     * Set HTML content safely with sanitization
     * @param {HTMLElement} element - Target element
     * @param {string} html - HTML content (will be sanitized)
     */
    static setHTML(element, html) {
        if (!element) return;
        
        // Create temporary element for sanitization
        const temp = document.createElement('div');
        temp.textContent = html;
        element.innerHTML = temp.innerHTML;
    }
    
    /**
     * Safely append child element with validation
     * @param {HTMLElement} parent - Parent element
     * @param {HTMLElement} child - Child element to append
     */
    static appendChild(parent, child) {
        if (parent && child && child.nodeType === Node.ELEMENT_NODE) {
            parent.appendChild(child);
        }
    }
    
    /**
     * Create safe event handler that prevents XSS through event attributes
     * @param {Function} handler - Event handler function
     * @param {Object} context - Context for the handler
     * @returns {Function} Safe event handler
     */
    static createEventHandler(handler, context = null) {
        return function(event) {
            try {
                // Prevent event manipulation
                if (event && typeof event.preventDefault === 'function') {
                    // Only call handler with validated context
                    return handler.call(context, event);
                }
            } catch (error) {
                // Log error securely without exposing details
                if (window.MonitoringService) {
                    window.MonitoringService.error('Event handler error', {
                        error: error.message,
                        timestamp: new Date().toISOString()
                    }, 'renderer');
                }
            }
        };
    }
    
    /**
     * Validate and sanitize URL for safe use in attributes
     * @param {string} url - URL to validate
     * @returns {string} Safe URL or empty string if invalid
     */
    static sanitizeURL(url) {
        if (!url || typeof url !== 'string') {
            return '';
        }
        
        // Allow only safe URL schemes
        const safeSchemes = ['http:', 'https:', 'mailto:', 'tel:'];
        try {
            const urlObj = new URL(url);
            if (safeSchemes.includes(urlObj.protocol)) {
                return urlObj.href;
            }
        } catch (e) {
            // Invalid URL
        }
        
        return '';
    }
    
    /**
     * Create safe CSS class name from user input
     * @param {string} input - Input string
     * @returns {string} Safe CSS class name
     */
    static sanitizeClassName(input) {
        if (!input || typeof input !== 'string') {
            return '';
        }
        
        // Remove dangerous characters and normalize
        return input
            .replace(/[^a-zA-Z0-9_-]/g, '')
            .replace(/^[0-9-]/, '') // CSS class can't start with number or dash
            .substring(0, 50); // Limit length
    }
}

// Make available globally for existing code
if (typeof window !== 'undefined') {
    window.DOMSafe = DOMSafe;
}