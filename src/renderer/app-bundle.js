/**
 * @fileoverview Bundled JavaScript for MCP renderer process.
 * This combines all the modules into a single file to avoid module loading issues.
 */

// Polyfill for potential ESM/CommonJS compatibility issues
window.process = window.process || { env: {} };

// Minimal event emitter for dashboard events
class EventEmitter {
    constructor() { this.events = {}; }
    on(event, fn) { (this.events[event] = this.events[event] || []).push(fn); }
    emit(event, ...args) { (this.events[event] || []).forEach(fn => fn(...args)); }
}

// UI logic for MCP connection checks: mail, calendar, etc.
function addConnectionChecks(root, apiBase = '/api') {
    // Attach debug button listeners if present in DOM
    const debugMailBtn = document.getElementById('debug-mail-btn');
    const debugCalBtn = document.getElementById('debug-calendar-btn');
    if (debugMailBtn) {
        debugMailBtn.onclick = async () => {
            debugMailBtn.disabled = true;
            debugMailBtn.textContent = 'Debugging...';
            try {
                const res = await fetch(`${apiBase}/v1/mail?limit=1&debug=true`);
                const data = await res.json();
                showDebugModal('Mail Debug', data);
            } catch (e) {
                showDebugModal('Mail Debug', { error: e.message });
            } finally {
                debugMailBtn.disabled = false;
                debugMailBtn.textContent = 'Debug Mail';
            }
        };
    }
    if (debugCalBtn) {
        debugCalBtn.onclick = async () => {
            debugCalBtn.disabled = true;
            debugCalBtn.textContent = 'Debugging...';
            try {
                const res = await fetch(`${apiBase}/v1/calendar?limit=1&debug=true`);
                const data = await res.json();
                showDebugModal('Calendar Debug', data);
            } catch (e) {
                showDebugModal('Calendar Debug', { error: e.message });
            } finally {
                debugCalBtn.disabled = false;
                debugCalBtn.textContent = 'Debug Calendar';
            }
        };
    }
    
    // Debug modal helper
    function showDebugModal(title, data) {
        const modal = document.createElement('div');
        modal.style.position = 'fixed';
        modal.style.top = '50%';
        modal.style.left = '50%';
        modal.style.transform = 'translate(-50%, -50%)';
        modal.style.backgroundColor = '#fff';
        modal.style.padding = '20px';
        modal.style.borderRadius = '8px';
        modal.style.boxShadow = '0 4px 12px rgba(0,0,0,0.15)';
        modal.style.zIndex = '1000';
        modal.style.maxWidth = '80%';
        modal.style.maxHeight = '80%';
        modal.style.overflow = 'auto';
        
        const titleEl = document.createElement('h3');
        titleEl.textContent = title;
        modal.appendChild(titleEl);
        
        const content = document.createElement('pre');
        content.style.whiteSpace = 'pre-wrap';
        content.style.fontSize = '14px';
        content.style.maxHeight = '400px';
        content.style.overflow = 'auto';
        content.style.backgroundColor = '#f5f5f5';
        content.style.padding = '12px';
        content.style.borderRadius = '4px';
        content.textContent = JSON.stringify(data, null, 2);
        modal.appendChild(content);
        
        const closeBtn = document.createElement('button');
        closeBtn.textContent = 'Close';
        closeBtn.style.marginTop = '16px';
        closeBtn.style.padding = '8px 16px';
        closeBtn.onclick = () => document.body.removeChild(modal);
        modal.appendChild(closeBtn);
        
        document.body.appendChild(modal);
    }
}

// Main App class
class App {
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
            // Try the direct status endpoint first
            const res = await fetch('/api/status');
            if (res.ok) {
                this.status = await res.json();
                this.events.emit('status:changed');
                return;
            }
            
            // Fallback to health endpoint if status is not available
            const healthRes = await fetch('/api/health');
            if (healthRes.ok) {
                this.status = { msGraph: 'red', llm: 'red', details: {} };
                this.events.emit('status:changed');
            }
        } catch (e) {
            console.error('Failed to fetch status:', e);
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
        
        // Show login or logout button based on authentication status
        if (status.msGraph !== 'green') {
            // Show login button if not authenticated
            const loginBtn = document.createElement('button');
            loginBtn.textContent = 'Login with Microsoft';
            loginBtn.style.marginLeft = '8px';
            loginBtn.style.padding = '8px 16px';
            loginBtn.style.backgroundColor = '#0078d4';
            loginBtn.style.color = 'white';
            loginBtn.style.border = 'none';
            loginBtn.style.borderRadius = '4px';
            loginBtn.style.cursor = 'pointer';
            loginBtn.onclick = () => {
                // Use a simple form submission to avoid CORS issues
                // This will cause a server-side redirect without any client-side fetch
                loginBtn.disabled = true;
                loginBtn.textContent = 'Logging in...';
                
                // Create a form and submit it
                const form = document.createElement('form');
                form.method = 'POST';
                form.action = '/api/auth/login';
                document.body.appendChild(form);
                form.submit();
                
                // No need to reset button state as we're redirecting
            };
            statusBar.appendChild(loginBtn);
        } else {
            // Show logout button if authenticated
            const logoutBtn = document.createElement('button');
            logoutBtn.textContent = 'Logout';
            logoutBtn.style.marginLeft = '8px';
            logoutBtn.style.padding = '8px 16px';
            logoutBtn.style.backgroundColor = '#e0e0e0';
            logoutBtn.style.color = '#333';
            logoutBtn.style.border = 'none';
            logoutBtn.style.borderRadius = '4px';
            logoutBtn.style.cursor = 'pointer';
            logoutBtn.onclick = async () => {
                try {
                    logoutBtn.disabled = true;
                    logoutBtn.textContent = 'Logging out...';
                    
                    // Call the logout endpoint
                    const res = await fetch('/api/auth/logout', { 
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' }
                    });
                    
                    if (res.ok) {
                        console.log('Logout successful');
                        // Refresh status after logout
                        await this.fetchStatus();
                    } else {
                        const errorData = await res.json();
                        console.error('Logout failed:', errorData);
                        alert(`Logout failed: ${errorData.message || 'Unknown error'}`);
                        logoutBtn.disabled = false;
                        logoutBtn.textContent = 'Logout';
                    }
                } catch (error) {
                    console.error('Logout failed:', error);
                    alert(`Logout failed: ${error.message}`);
                    logoutBtn.disabled = false;
                    logoutBtn.textContent = 'Logout';
                }
            };
            statusBar.appendChild(logoutBtn);
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
            serverStatus.textContent = 'MCP Server running with limited functionality';
            serverStatus.style.color = '#ff9800';
        }
        statusBar.appendChild(serverStatus);
        
        // Add connection checks
        addConnectionChecks(this.root);
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('app');
    if (!root) {
        // Create root if missing
        const div = document.createElement('div');
        div.id = 'app';
        document.body.appendChild(div);
    }
    const app = new App({
        element: document.getElementById('app')
    });
    app.render().catch(error => {
        console.error('Failed to render app:', error);
        const errorDiv = document.createElement('div');
        errorDiv.textContent = `Error rendering app: ${error.message}`;
        errorDiv.style.color = 'red';
        document.getElementById('app').appendChild(errorDiv);
    });
});
