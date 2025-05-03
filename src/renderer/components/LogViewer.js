/**
 * @fileoverview LogViewer component for displaying system logs.
 * Allows viewing, filtering, and clearing application logs.
 */

export class LogViewer {
    /**
     * Create a new LogViewer component
     * @param {HTMLElement} root - Container element to render into
     * @param {Object} options - Configuration options
     * @param {string} options.apiEndpoint - API endpoint for logs (default: '/api/v1/logs')
     * @param {number} options.refreshInterval - Auto-refresh interval in ms (default: 5000ms)
     * @param {boolean} options.autoScroll - Enable auto-scrolling (default: true)
     * @param {number} options.maxEntries - Maximum number of entries to show (default: 100)
     */
    constructor(root, options = {}) {
        this.root = root;
        this.options = {
            apiEndpoint: options.apiEndpoint || '/api/v1/logs',
            refreshInterval: options.refreshInterval || 5000,
            autoScroll: options.autoScroll !== undefined ? options.autoScroll : true,
            maxEntries: options.maxEntries || 100
        };
        
        this.container = document.createElement('div');
        this.container.className = 'log-viewer';
        this.root.appendChild(this.container);
        
        this.logs = [];
        this.filter = {
            level: null,  // 'info', 'error', 'warn', 'debug'
            category: null
        };
        
        this.refreshIntervalId = null;
        this.createUI();
        this.fetchLogs();
        
        if (this.options.autoScroll) {
            this.startAutoRefresh();
        }
    }
    
    /**
     * Create the UI elements for the log viewer
     */
    createUI() {
        this.container.innerHTML = `
            <div class="log-viewer-header">
                <h3>System Logs</h3>
                <div class="log-viewer-controls">
                    <div class="filter-controls">
                        <select class="level-filter">
                            <option value="">All Levels</option>
                            <option value="error">Errors</option>
                            <option value="warn">Warnings</option>
                            <option value="info">Info</option>
                            <option value="debug">Debug</option>
                        </select>
                        <button class="refresh-btn">Refresh</button>
                        <button class="clear-btn">Clear</button>
                    </div>
                    <div class="view-controls">
                        <label>
                            <input type="checkbox" class="auto-scroll" ${this.options.autoScroll ? 'checked' : ''}>
                            Auto-scroll
                        </label>
                        <label>
                            <input type="checkbox" class="auto-refresh" ${this.refreshIntervalId ? 'checked' : ''}>
                            Auto-refresh
                        </label>
                    </div>
                </div>
            </div>
            <div class="log-entries-container">
                <div class="log-entries"></div>
            </div>
        `;
        
        // Apply styles
        const style = document.createElement('style');
        style.textContent = `
            .log-viewer {
                font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
                border-radius: 6px;
                overflow: hidden;
                box-shadow: 0 2px 8px rgba(0,0,0,0.1);
                margin-bottom: 20px;
                border: 1px solid #e0e0e0;
            }
            
            .log-viewer-header {
                background-color: #f0f7ff;
                padding: 12px 16px;
                border-bottom: 1px solid #cfe5fc;
            }
            
            .log-viewer-header h3 {
                margin: 0 0 10px 0;
                color: #0078d4;
                font-weight: 500;
            }
            
            .log-viewer-controls {
                display: flex;
                justify-content: space-between;
                align-items: center;
                flex-wrap: wrap;
                gap: 10px;
            }
            
            .filter-controls, .view-controls {
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .level-filter {
                padding: 6px 10px;
                border-radius: 4px;
                border: 1px solid #ccc;
                background-color: white;
                font-size: 13px;
            }
            
            .refresh-btn, .clear-btn {
                padding: 6px 12px;
                border-radius: 4px;
                border: none;
                cursor: pointer;
                font-weight: 500;
                transition: background-color 0.15s ease;
            }
            
            .refresh-btn {
                background-color: #0078d4;
                color: white;
            }
            
            .refresh-btn:hover {
                background-color: #0067b9;
            }
            
            .clear-btn {
                background-color: #d83b01;
                color: white;
            }
            
            .clear-btn:hover {
                background-color: #c43600;
            }
            
            .log-entries-container {
                height: 400px;
                overflow-y: auto;
                background-color: #f9f9f9;
                border-top: 1px solid #e0e0e0;
            }
            
            .log-entries {
                font-family: 'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace;
                font-size: 12px;
                line-height: 1.6;
                white-space: pre-wrap;
                padding: 12px;
            }
            
            .log-entry {
                margin-bottom: 10px;
                padding-bottom: 10px;
                border-bottom: 1px solid #ebebeb;
                display: flex;
                flex-direction: column;
            }
            
            .log-entry-header {
                display: flex;
                align-items: center;
                flex-wrap: wrap;
                gap: 6px;
                margin-bottom: 4px;
            }
            
            .log-timestamp {
                color: #666;
                font-size: 11px;
                font-family: 'Menlo', 'Monaco', 'Consolas', 'Courier New', monospace;
            }
            
            .log-level {
                font-weight: bold;
                padding: 2px 8px;
                border-radius: 12px;
                margin: 0 5px;
                font-size: 10px;
                text-transform: uppercase;
            }
            
            .log-level-error {
                background-color: #fde7e9;
                color: #d13438;
            }
            
            .log-level-warn {
                background-color: #fff4ce;
                color: #c19c00;
            }
            
            .log-level-info {
                background-color: #e5f2ff;
                color: #0078d4;
            }
            
            .log-level-debug {
                background-color: #e0e0e0;
                color: #5c5c5c;
            }
            
            .log-category {
                display: inline-block;
                padding: 1px 6px;
                background-color: #f0f0f0;
                color: #333;
                border-radius: 3px;
                font-size: 11px;
                font-weight: 500;
            }
            
            .log-message {
                display: block;
                padding: 4px 8px;
                word-break: break-word;
                background-color: white;
                border-radius: 4px;
                border-left: 3px solid #e0e0e0;
            }
            
            .log-level-error ~ .log-message {
                border-left-color: #d13438;
            }
            
            .log-level-warn ~ .log-message {
                border-left-color: #c19c00;
            }
            
            .log-level-info ~ .log-message {
                border-left-color: #0078d4;
            }
            
            .log-context {
                margin-top: 6px;
                margin-left: 10px;
                font-size: 11px;
                color: #555;
                background-color: #f5f5f5;
                border-radius: 4px;
                padding: 8px;
                border: 1px solid #e5e5e5;
                overflow-x: auto;
            }
        `;
        document.head.appendChild(style);
        
        // Add event listeners
        this.container.querySelector('.refresh-btn').addEventListener('click', () => this.fetchLogs());
        this.container.querySelector('.clear-btn').addEventListener('click', () => this.clearLogs());
        this.container.querySelector('.level-filter').addEventListener('change', (e) => {
            this.filter.level = e.target.value || null;
            this.fetchLogs();
        });
        this.container.querySelector('.auto-scroll').addEventListener('change', (e) => {
            this.options.autoScroll = e.target.checked;
        });
        this.container.querySelector('.auto-refresh').addEventListener('change', (e) => {
            if (e.target.checked) {
                this.startAutoRefresh();
            } else {
                this.stopAutoRefresh();
            }
        });
    }
    
    /**
     * Fetch logs from the API
     */
    async fetchLogs() {
        try {
            let url = this.options.apiEndpoint;
            const params = new URLSearchParams();
            
            // Add filters if they exist
            if (this.filter.level) {
                params.append('level', this.filter.level);
            }
            if (this.filter.category) {
                params.append('category', this.filter.category);
            }
            
            // Add limit
            params.append('limit', this.options.maxEntries);
            
            // Add params to URL if there are any
            if (params.toString()) {
                url += '?' + params.toString();
            }
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`Failed to fetch logs: ${response.status} ${response.statusText}`);
            }
            
            const logs = await response.json();
            this.logs = logs;
            this.renderLogs();
        } catch (error) {
            console.error('Error fetching logs:', error);
            this.showError(`Failed to fetch logs: ${error.message}`);
        }
    }
    
    /**
     * Clear all logs from the server
     */
    async clearLogs() {
        try {
            const clearUrl = `${this.options.apiEndpoint}/clear`;
            const response = await fetch(clearUrl, {
                method: 'POST'
            });
            
            if (!response.ok) {
                throw new Error(`Failed to clear logs: ${response.status} ${response.statusText}`);
            }
            
            this.logs = [];
            this.renderLogs();
            
            // Show success message in logs container
            const logsContainer = this.container.querySelector('.log-entries');
            logsContainer.innerHTML = '<div class="log-entry"><span class="log-message">Logs cleared successfully.</span></div>';
        } catch (error) {
            console.error('Error clearing logs:', error);
            this.showError(`Failed to clear logs: ${error.message}`);
        }
    }
    
    /**
     * Render the logs to the UI
     */
    renderLogs() {
        const logsContainer = this.container.querySelector('.log-entries');
        
        if (this.logs.length === 0) {
            logsContainer.innerHTML = '<div class="log-entry"><span class="log-message">No logs found.</span></div>';
            return;
        }
        
        logsContainer.innerHTML = '';
        
        this.logs.forEach(log => {
            const logEntry = document.createElement('div');
            logEntry.className = 'log-entry';
            
            // Format timestamp
            const timestamp = new Date(log.timestamp).toLocaleString();
            
            // Create header with timestamp, level, and category
            const headerDiv = document.createElement('div');
            headerDiv.className = 'log-entry-header';
            headerDiv.innerHTML = `
                <span class="log-timestamp">[${timestamp}]</span>
                <span class="log-level log-level-${log.level || 'info'}">${log.level || 'info'}</span>
                ${log.category ? `<span class="log-category">${log.category}</span>` : ''}
            `;
            
            // Create message content
            const messageDiv = document.createElement('div');
            messageDiv.className = 'log-message';
            messageDiv.textContent = log.message || 'No message';
            
            // Add components to log entry
            logEntry.appendChild(headerDiv);
            logEntry.appendChild(messageDiv);
            
            // Add context data if available
            if (log.data && Object.keys(log.data).length > 0) {
                const contextDiv = document.createElement('div');
                contextDiv.className = 'log-context';
                contextDiv.innerHTML = this.formatContext(log.data);
                logEntry.appendChild(contextDiv);
            }
            
            logsContainer.appendChild(logEntry);
        });
        
        // Auto-scroll to bottom if enabled
        if (this.options.autoScroll) {
            const container = this.container.querySelector('.log-entries-container');
            container.scrollTop = container.scrollHeight;
        }
    }
    
    /**
     * Format context object for display
     * @param {Object} context - Context data to format
     * @returns {string} Formatted HTML string
     */
    formatContext(context) {
        if (!context || typeof context !== 'object') {
            return String(context || '');
        }
        
        // For safety, limit depth of parsing
        const stringified = JSON.stringify(context, null, 2);
        
        // Simple syntax highlighting
        return stringified
            .replace(/("\\w+")/g, '<span style="color: #7928CA">$1</span>') // keys
            .replace(/"([^"]*)"/g, '<span style="color: #0070f3">"$1"</span>') // strings
            .replace(/\b(true|false|null)\b/g, '<span style="color: #ff0080">$1</span>'); // literals
    }
    
    /**
     * Show an error message in the logs container
     * @param {string} message - Error message to display
     */
    showError(message) {
        const logsContainer = this.container.querySelector('.log-entries');
        logsContainer.innerHTML = `
            <div class="log-entry">
                <span class="log-level log-level-error">ERROR</span>
                <span class="log-message">${message}</span>
            </div>
        `;
    }
    
    /**
     * Start auto-refreshing logs at the specified interval
     */
    startAutoRefresh() {
        // Clear any existing interval
        this.stopAutoRefresh();
        
        // Set auto-refresh checkbox
        const checkbox = this.container.querySelector('.auto-refresh');
        if (checkbox) {
            checkbox.checked = true;
        }
        
        // Start new interval
        this.refreshIntervalId = setInterval(() => {
            this.fetchLogs();
        }, this.options.refreshInterval);
    }
    
    /**
     * Stop auto-refreshing logs
     */
    stopAutoRefresh() {
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
            this.refreshIntervalId = null;
        }
        
        // Update checkbox
        const checkbox = this.container.querySelector('.auto-refresh');
        if (checkbox) {
            checkbox.checked = false;
        }
    }
    
    /**
     * Clean up resources when the component is removed
     */
    destroy() {
        this.stopAutoRefresh();
        this.container.remove();
    }
}