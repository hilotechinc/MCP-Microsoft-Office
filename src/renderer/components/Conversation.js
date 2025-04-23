/**
 * @fileoverview Conversation component for displaying messages.
 * Modular, testable, vanilla JS class.
 */
export class Conversation {
    /**
     * @param {HTMLElement} root - Container to render into
     */
    constructor(root) {
        this.root = root;
        this.container = document.createElement('div');
        this.container.id = 'conversation-container';
        this.container.className = 'conversation';
        this.root.appendChild(this.container);
    }

    /**
     * Render all messages.
     * @param {Array<{sender: string, text: string}>} messages
     */
    render(messages) {
        this.container.innerHTML = '';
        messages.forEach(msg => {
            this.addMessage(msg.sender, msg.text);
        });
        this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Add a single message to the conversation.
     * @param {string} sender
     * @param {string} text
     */
    addMessage(sender, text) {
        const msg = document.createElement('div');
        msg.className = 'message';
        msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
        this.container.appendChild(msg);
        this.container.scrollTop = this.container.scrollHeight;
    }

    /**
     * Clear all messages from the conversation.
     */
    clear() {
        this.container.innerHTML = '';
    }
}
