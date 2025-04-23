/**
 * @fileoverview Main App class for MCP renderer process.
 * Handles UI composition, state, and IPC integration.
 */
export class App {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.element - Root element to render into
     * @param {Object} options.api - Secure API bridge (window.api)
     */
    constructor({ element, api }) {
        this.root = element;
        this.api = api;
        this.conversation = null;
        this.input = null;
        this.messages = [];
    }

    /**
     * Render the application UI.
     */
    render() {
        this.root.innerHTML = '';
        // Conversation area
        this.conversation = document.createElement('div');
        this.conversation.id = 'conversation-container';
        this.root.appendChild(this.conversation);
        // Input area
        this.input = document.createElement('input');
        this.input.id = 'query-input';
        this.input.type = 'text';
        this.input.placeholder = 'Type your query...';
        this.root.appendChild(this.input);
        // Send button
        const sendBtn = document.createElement('button');
        sendBtn.id = 'send-btn';
        sendBtn.textContent = 'Send';
        this.root.appendChild(sendBtn);
        sendBtn.addEventListener('click', () => this.handleSend());
        this.input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.handleSend();
        });
    }

    /**
     * Handle sending a query from the input box.
     */
    async handleSend() {
        const query = this.input.value.trim();
        if (!query) return;
        this.input.value = '';
        // Display in conversation
        this.addMessage('You', query);
        // IPC call to main process
        try {
            const res = await this.api.sendQuery(query);
            this.addMessage('Main', res.echo || JSON.stringify(res));
        } catch (err) {
            this.addMessage('Error', err.message || String(err));
        }
    }

    /**
     * Add a message to the conversation display.
     * @param {string} sender
     * @param {string} text
     */
    addMessage(sender, text) {
        const msg = document.createElement('div');
        msg.className = 'message';
        msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
        this.conversation.appendChild(msg);
        this.conversation.scrollTop = this.conversation.scrollHeight;
    }
}
