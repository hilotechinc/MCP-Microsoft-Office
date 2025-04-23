/**
 * @fileoverview LoadingIndicator component for async UI states.
 * Modular, testable vanilla JS class.
 */

/**
 * LoadingIndicator UI component.
 * @class
 */
export class LoadingIndicator {
    /**
     * @param {HTMLElement} root - Container to render into
     * @param {Object} [options] - Optional settings
     */
    constructor(root, options = {}) {
        this.root = root;
        this.options = options;
        this.container = document.createElement('div');
        this.container.className = 'loading-indicator';
        this.container.style.display = 'none';
        this.container.innerHTML = options.text || 'Loading...';
        this.root.appendChild(this.container);
    }

    /**
     * Show the loading indicator.
     * @param {string} [text] - Optional loading text
     */
    show(text) {
        if (text) this.container.innerHTML = text;
        this.container.style.display = 'block';
    }

    /**
     * Hide the loading indicator.
     */
    hide() {
        this.container.style.display = 'none';
    }

    /**
     * Set loading text.
     * @param {string} text
     */
    setText(text) {
        this.container.innerHTML = text;
    }
}
