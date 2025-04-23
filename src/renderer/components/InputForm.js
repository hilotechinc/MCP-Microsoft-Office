/**
 * @fileoverview InputForm component for user text input and send action.
 * Modular, testable vanilla JS class.
 */

/**
 * InputForm UI component.
 * @class
 */
export class InputForm {
    /**
     * @param {HTMLElement} root - Container to render into
     * @param {function(string):void} onSend - Callback when user sends input
     */
    constructor(root, onSend) {
        this.root = root;
        this.onSend = onSend;
        this.container = document.createElement('div');
        this.container.className = 'input-form';
        // Input
        this.input = document.createElement('input');
        this.input.type = 'text';
        this.input.id = 'query-input';
        this.input.placeholder = 'Type your query...';
        this.container.appendChild(this.input);
        // Send button
        this.sendBtn = document.createElement('button');
        this.sendBtn.id = 'send-btn';
        this.sendBtn.textContent = 'Send';
        this.container.appendChild(this.sendBtn);
        // Event listeners
        this.sendBtn.addEventListener('click', () => this.handleSend());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });
        this.root.appendChild(this.container);
    }

    /**
     * Handle sending the current input value.
     */
    handleSend() {
        const value = this.input.value.trim();
        if (!value) return;
        this.input.value = '';
        if (typeof this.onSend === 'function') {
            this.onSend(value);
        }
    }

    /**
     * Focus the input field.
     */
    focus() {
        this.input.focus();
    }

    /**
     * Clear the input field.
     */
    clear() {
        this.input.value = '';
    }
}
