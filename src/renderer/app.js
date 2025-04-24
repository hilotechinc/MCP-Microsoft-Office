/**
 * @fileoverview Main App class for MCP renderer process.
 * Handles UI composition, state, and IPC integration.
 */
// Minimal event emitter for dashboard events
class EventEmitter {
    constructor() { this.events = {}; }
    on(event, fn) { (this.events[event] = this.events[event] || []).push(fn); }
    emit(event, ...args) { (this.events[event] || []).forEach(fn => fn(...args)); }
}

export class App {
    /**
     * @param {Object} options
     * @param {HTMLElement} options.element - Root element to render into
     */
    constructor({ element }) {
        this.root = element;
        this.events = new EventEmitter();
        this.status = null;
        this.events.on('status:changed', () => this.renderDashboard());
    }

    async fetchStatus() {
        try {
            const res = await fetch('/api/status');
            if (res.ok) {
                this.status = await res.json();
                this.events.emit('status:changed');
            }
        } catch (e) {
            this.status = null;
            this.events.emit('status:changed');
        }
    }

    async render() {
        await this.fetchStatus();
    }

    async renderDashboard() {
        this.root.innerHTML = '';
        // Status dashboard
        if (!this.status) {
            const err = document.createElement('div');
            err.textContent = 'Could not connect to MCP API backend.';
            err.style.color = '#e53935';
            this.root.appendChild(err);
            return;
        }
        const statusBar = document.createElement('div');
        statusBar.id = 'status-bar';
        statusBar.style.display = 'flex';
        statusBar.style.alignItems = 'center';
        statusBar.style.gap = '24px';
        statusBar.style.marginBottom = '24px';
        this.root.appendChild(statusBar);
        // Fetch status from API
        let status = { msGraph: 'red', llm: 'red', details: {} };
        try {
            const res = await fetch('/api/status');
            if (res.ok) status = await res.json();
        } catch (e) { /* ignore, show as red */ }
        // Traffic lights
        const makeLight = (label, state) => {
            const wrap = document.createElement('div');
            wrap.style.display = 'flex';
            wrap.style.alignItems = 'center';
            const light = document.createElement('span');
            light.style.display = 'inline-block';
            light.style.width = '18px';
            light.style.height = '18px';
            light.style.borderRadius = '50%';
            light.style.marginRight = '8px';
            light.style.background = state === 'green' ? '#4caf50' : '#e53935';
            light.style.border = '2px solid #333';
            wrap.appendChild(light);
            const text = document.createElement('span');
            text.textContent = label + (state === 'green' ? ' connected' : ' not connected');
            wrap.appendChild(text);
            return wrap;
        };
        // Microsoft Graph traffic light and login
        statusBar.appendChild(makeLight('Microsoft Graph', status.msGraph));
        // Show login button if not authenticated
        if (status.msGraph === 'red' && status.details.msGraph && status.details.msGraph.loginUrl) {
            const loginBtn = document.createElement('button');
            loginBtn.textContent = 'Login with Microsoft';
            loginBtn.style.marginLeft = '8px';
            loginBtn.onclick = () => {
                // Redirect to Microsoft login (real OAuth)
                window.location.href = status.details.msGraph.loginUrl;
            };
            statusBar.appendChild(loginBtn);
        }
        // Show user info if signed in
        if (status.msGraph === 'green' && status.details.msGraph && status.details.msGraph.user) {
            const userInfo = document.createElement('span');
            userInfo.textContent = `Signed in as: ${status.details.msGraph.user}`;
            userInfo.style.marginLeft = '8px';
            statusBar.appendChild(userInfo);
        }
        // LLM traffic light (yellow if error)
        let llmLightColor = status.llm;
        if (status.details.llm && status.details.llm.status === 'error') llmLightColor = 'yellow';
        statusBar.appendChild(makeLight('LLM API', llmLightColor));
        // Server status
        const serverStatus = document.createElement('span');
        serverStatus.style.marginLeft = 'auto';
        if (status.msGraph === 'green' && status.llm === 'green') {
            serverStatus.textContent = 'MCP Server running and serving data';
            serverStatus.style.color = '#4caf50';
        } else {
            serverStatus.textContent = 'Waiting for connections...';
            serverStatus.style.color = '#e53935';
        }
        statusBar.appendChild(serverStatus);
        // Claude integration help
        if (status.msGraph === 'green' && status.llm === 'green') {
            const help = document.createElement('div');
            help.style.margin = '24px 0';
            help.innerHTML = `
                <h2>Connect MCP to Claude Desktop</h2>
                <p>Add this API as a plugin in Claude Desktop:</p>
                <pre style="background:#f5f5f5;padding:8px;border-radius:4px;">http://localhost:3001/api</pre>
                <p>Then you can ask Claude things like:<br><code>Can you help me respond to the last mail from Krister?</code></p>
            `;
            this.root.appendChild(help);
        }

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
