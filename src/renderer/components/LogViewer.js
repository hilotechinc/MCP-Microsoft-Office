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
                        <select class="category-filter">
                            <option value="">All Categories</option>
                            <option value="calendar">Calendar</option>
                            <option value="mail">Mail</option>
                            <option value="files">Files</option>
                            <option value="graph">Graph API</option>
                            <option value="api">API</option>
                            <option value="adapter">MCP Adapter</option>
                        </select>
                        <button class="track-calendar-flow-btn">Track Calendar Flow</button>
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
            /* Modern 2025 Design System Variables */
            :root {
                --primary: #0078d4;
                --primary-dark: #005a9e;
                --primary-light: #c7e0f4;
                --secondary: #5c2d91;
                --accent: #107c41;
                --warning: #ff8c00;
                --error: #d13438;
                --success: #0f7b0f;
                --neutral-100: #ffffff;
                --neutral-95: #f9f9f9;
                --neutral-90: #f0f0f0;
                --neutral-80: #e0e0e0;
                --neutral-60: #bdbdbd;
                --neutral-40: #767676;
                --neutral-20: #333333;
                --neutral-10: #1f1f1f;
                --shadow-sm: 0 2px 8px rgba(0,0,0,0.06);
                --shadow-md: 0 4px 16px rgba(0,0,0,0.08);
                --shadow-lg: 0 8px 24px rgba(0,0,0,0.12);
                --radius-sm: 6px;
                --radius-md: 8px;
                --radius-lg: 12px;
                --font-primary: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, 'Helvetica Neue', sans-serif;
                --font-mono: 'Cascadia Code', 'SF Mono', Monaco, Menlo, Consolas, 'Courier New', monospace;
                --transition-fast: 150ms cubic-bezier(0.4, 0, 0.2, 1);
                --transition-normal: 250ms cubic-bezier(0.4, 0, 0.2, 1);
            }
            
            .log-viewer {
                font-family: var(--font-primary);
                color: var(--neutral-20);
                background-color: var(--neutral-100);
                border-radius: var(--radius-lg);
                box-shadow: var(--shadow-md);
                margin: 24px 0;
                overflow: hidden;
                max-width: 1200px;
                margin-left: auto;
                margin-right: auto;
                border: 1px solid var(--neutral-90);
            }
            
            .log-viewer-header {
                padding: 20px 24px;
                background-color: var(--neutral-95);
                border-bottom: 1px solid var(--neutral-90);
                display: flex;
                flex-direction: column;
                gap: 16px;
            }
            
            .log-viewer-header h3 {
                margin: 0;
                font-size: 20px;
                font-weight: 600;
                color: var(--neutral-20);
                letter-spacing: -0.01em;
            }
            
            /* Modern Button Base Style */
            .btn {
                display: inline-flex;
                align-items: center;
                justify-content: center;
                padding: 10px 16px;
                border-radius: var(--radius-sm);
                border: none;
                font-size: 14px;
                font-weight: 500;
                cursor: pointer;
                transition: all var(--transition-fast);
                position: relative;
                overflow: hidden;
                gap: 8px;
                min-width: 100px;
                height: 40px;
                letter-spacing: 0.01em;
            }
            
            .btn:focus {
                outline: none;
                box-shadow: 0 0 0 2px var(--neutral-100), 0 0 0 4px var(--primary);
            }
            
            .btn:active {
                transform: translateY(1px);
            }
            
            /* Button Variants */
            .btn-primary {
                background-color: var(--primary);
                color: white;
            }
            
            .btn-primary:hover {
                background-color: var(--primary-dark);
            }
            
            .btn-secondary {
                background-color: var(--secondary);
                color: white;
            }
            
            .btn-secondary:hover {
                background-color: #4a2477;
            }
            
            .btn-accent {
                background-color: var(--accent);
                color: white;
            }
            
            .btn-accent:hover {
                background-color: #0a6535;
            }
            
            .btn-warning {
                background-color: var(--warning);
                color: white;
            }
            
            .btn-warning:hover {
                background-color: #e67e00;
            }
            
            .btn-danger {
                background-color: var(--error);
                color: white;
            }
            
            .btn-danger:hover {
                background-color: #b92b2f;
            }
            
            .btn-outline {
                background-color: transparent;
                color: var(--neutral-20);
                border: 1px solid var(--neutral-60);
            }
            
            .btn-outline:hover {
                background-color: var(--neutral-95);
                border-color: var(--neutral-40);
            }
            
            /* Form Controls */
            .form-control {
                padding: 10px 16px;
                border-radius: var(--radius-sm);
                border: 1px solid var(--neutral-80);
                background-color: var(--neutral-100);
                font-size: 14px;
                min-width: 160px;
                height: 40px;
                transition: all var(--transition-fast);
                color: var(--neutral-20);
                font-family: var(--font-primary);
            }
            
            .form-control:focus {
                outline: none;
                border-color: var(--primary);
                box-shadow: 0 0 0 3px var(--primary-light);
            }
            
            .form-control:hover:not(:focus) {
                border-color: var(--neutral-60);
            }
            
            /* Layout Components */
            .flow-tracking-header {
                padding: 16px;
                background-color: var(--primary-light);
                border-radius: var(--radius-md);
                margin-bottom: 16px;
                font-weight: 500;
                color: var(--primary-dark);
                display: flex;
                align-items: center;
                gap: 8px;
            }
            
            .flow-tracking-header::before {
                content: '';
                display: block;
                width: 8px;
                height: 8px;
                border-radius: 50%;
                background-color: var(--primary);
            }
            
            .log-viewer-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 20px;
                justify-content: space-between;
            }
            
            .filter-controls {
                display: flex;
                flex-wrap: wrap;
                gap: 12px;
                align-items: center;
            }
            
            /* Apply our form-control class */
            .level-filter, .category-filter {
                composes: form-control;
            }
            
            /* Apply our button classes */
            .track-calendar-flow-btn {
                composes: btn btn-warning;
            }
            
            .refresh-btn {
                composes: btn btn-primary;
            }
            
            .clear-btn {
                composes: btn btn-danger;
            }
            
            /* Log Container */
            .log-entries-container {
                height: 500px;
                overflow-y: auto;
                background-color: var(--neutral-95);
                border-top: 1px solid var(--neutral-90);
                padding: 0;
                position: relative;
                scrollbar-width: thin;
                scrollbar-color: var(--neutral-60) var(--neutral-95);
            }
            
            .log-entries-container::-webkit-scrollbar {
                width: 8px;
                height: 8px;
            }
            
            .log-entries-container::-webkit-scrollbar-track {
                background: var(--neutral-95);
            }
            
            .log-entries-container::-webkit-scrollbar-thumb {
                background-color: var(--neutral-60);
                border-radius: 20px;
                border: 2px solid var(--neutral-95);
            }
            
            .log-entries {
                font-family: var(--font-mono);
                font-size: 13px;
                line-height: 1.6;
                padding: 16px 0;
            }
            
            /* Log Entry Styling */
            .log-entry {
                padding: 12px 24px;
                border-bottom: 1px solid var(--neutral-90);
                transition: background-color var(--transition-fast);
                position: relative;
            }
            
            .log-entry:hover {
                background-color: var(--neutral-100);
            }
            
            .log-entry:last-child {
                border-bottom: none;
            }
            
            .log-entry-header {
                display: flex;
                gap: 12px;
                margin-bottom: 8px;
                font-size: 13px;
                align-items: center;
                flex-wrap: wrap;
            }
            
            .log-timestamp {
                color: var(--neutral-40);
                font-size: 12px;
                font-family: var(--font-mono);
            }
            
            .log-level {
                padding: 2px 6px;
                border-radius: 4px;
                font-size: 11px;
                font-weight: 600;
                text-transform: uppercase;
                letter-spacing: 0.05em;
            }
            
            .log-level-error {
                background-color: rgba(209, 52, 56, 0.1);
                color: var(--error);
            }
            
            .log-level-warn {
                background-color: rgba(255, 140, 0, 0.1);
                color: var(--warning);
            }
            
            .log-level-info {
                background-color: rgba(0, 120, 212, 0.1);
                color: var(--primary);
            }
            
            .log-level-debug {
                background-color: rgba(92, 45, 145, 0.1);
                color: var(--secondary);
            }
            
            .log-category {
                padding: 2px 8px;
                border-radius: 12px;
                font-size: 11px;
                background-color: var(--neutral-90);
                color: var(--neutral-20);
            }
            
            .log-message {
                font-family: var(--font-primary);
                font-size: 14px;
                margin-bottom: 8px;
                line-height: 1.5;
                color: var(--neutral-20);
            }
            
            .log-context {
                background-color: var(--neutral-100);
                border: 1px solid var(--neutral-90);
                border-radius: var(--radius-sm);
                padding: 12px;
                margin-top: 8px;
                overflow-x: auto;
                position: relative;
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
        const refreshBtn = this.container.querySelector('.refresh-btn');
        const clearBtn = this.container.querySelector('.clear-btn');
        const levelFilter = this.container.querySelector('.level-filter');
        const categoryFilter = this.container.querySelector('.category-filter');
        const trackCalendarFlowBtn = this.container.querySelector('.track-calendar-flow-btn');
        const autoScrollCheckbox = this.container.querySelector('.auto-scroll');
        const autoRefreshCheckbox = this.container.querySelector('.auto-refresh');
        
        // Store tracking state
        this.isTrackingCalendarFlow = false;
        
        refreshBtn.addEventListener('click', () => this.fetchLogs());
        clearBtn.addEventListener('click', () => this.clearLogs());
        levelFilter.addEventListener('change', () => {
            this.filter.level = levelFilter.value || null;
            this.fetchLogs();
        });
        categoryFilter.addEventListener('change', () => {
            this.filter.category = categoryFilter.value || null;
            this.fetchLogs();
        });
        trackCalendarFlowBtn.addEventListener('click', () => this.trackCalendarFlow());
        autoScrollCheckbox.addEventListener('change', () => {
            this.options.autoScroll = autoScrollCheckbox.checked;
        });
        autoRefreshCheckbox.addEventListener('change', () => {
            if (autoRefreshCheckbox.checked) {
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
     * Track the calendar API flow from routes to Microsoft Graph
     */
    async trackCalendarFlow() {
        try {
            // Set tracking state
            this.isTrackingCalendarFlow = true;
            
            // Clear logs first to make it easier to track the flow
            await this.clearLogs();
            
            // Show tracking message
            const logsContainer = this.container.querySelector('.log-entries');
            logsContainer.innerHTML = '<div class="flow-tracking-header">Preparing to track calendar flow...</div>';
            
            // Make a calendar API call to generate logs
            const response = await fetch('/api/v1/calendar?debug=true');
            const data = await response.json();
            
            // Wait a moment for all logs to be generated
            setTimeout(async () => {
                // Fetch and display the calendar flow logs with special filtering
                await this.fetchCalendarFlowLogs();
            }, 1000);
        } catch (error) {
            console.error('Error tracking calendar flow:', error);
            const logsContainer = this.container.querySelector('.log-entries');
            logsContainer.innerHTML = `<div class="log-entry log-level-error">Error tracking calendar flow: ${error.message}</div>`;
        }
    }
    
    /**
     * Fetch logs specifically for calendar flow tracking
     */
    async fetchCalendarFlowLogs() {
        try {
            // Build query parameters - we'll filter client-side for more control
            const url = `${this.options.apiEndpoint}?limit=200`;
            
            const response = await fetch(url);
            if (response.ok) {
                const logs = await response.json();
                
                // Clear the log div
                const logsContainer = this.container.querySelector('.log-entries');
                logsContainer.innerHTML = '';
                
                // Filter logs for calendar flow tracking
                const filteredLogs = logs.filter(log => {
                    // Include logs from routes.cjs
                    if ((log.message || '').includes('/v1/calendar') && 
                        (log.category === 'api-request' || log.category === 'api')) {
                        return true;
                    }
                    
                    // Include logs from calendar controller
                    if (log.category === 'calendar') {
                        return true;
                    }
                    
                    // Include logs from MCP adapter related to calendar
                    if ((log.category === 'adapter' || log.category === 'calendar-adapter') && 
                        ((log.message || '').toLowerCase().includes('calendar') || 
                         JSON.stringify(log.data || {}).toLowerCase().includes('calendar'))) {
                        return true;
                    }
                    
                    // Include Microsoft Graph API calls
                    if (log.category === 'graph' && 
                        ((log.message || '').toLowerCase().includes('calendar') || 
                         JSON.stringify(log.data || {}).toLowerCase().includes('calendar'))) {
                        return true;
                    }
                    
                    return false;
                });
                
                // Sort by timestamp to show the flow in order
                filteredLogs.sort((a, b) => {
                    return new Date(a.timestamp) - new Date(b.timestamp);
                });
                
                // Add header for flow tracking
                logsContainer.innerHTML = `<div class="flow-tracking-header">
                    <strong>Calendar API Flow Tracking</strong><br>
                    Showing ${filteredLogs.length} log entries related to calendar API flow from routes to Microsoft Graph
                </div>`;
                
                // Add each log entry with special formatting
                filteredLogs.forEach(log => {
                    const logEntry = document.createElement('div');
                    logEntry.className = 'log-entry';
                    
                    // Format timestamp
                    const timestamp = new Date(log.timestamp).toLocaleString();
                    
                    // Determine color based on category for flow tracking
                    let categoryColor = '#0078d4'; // Default blue
                    if (log.category === 'api-request' || log.category === 'api') {
                        categoryColor = '#107c41'; // Green for API routes
                    } else if (log.category === 'calendar') {
                        categoryColor = '#5c2d91'; // Purple for calendar controller
                    } else if (log.category === 'adapter' || log.category === 'calendar-adapter') {
                        categoryColor = '#0078d4'; // Blue for MCP adapter
                    } else if (log.category === 'graph') {
                        categoryColor = '#d83b01'; // Orange for Graph API
                    }
                    
                    // Create header with timestamp, level, and category
                    const headerDiv = document.createElement('div');
                    headerDiv.className = 'log-entry-header';
                    headerDiv.innerHTML = `
                        <span class="log-timestamp">[${timestamp}]</span>
                        <span class="log-level log-level-${log.level || 'info'}">${log.level || 'info'}</span>
                        <span class="log-category" style="color:${categoryColor}">${log.category || 'unknown'}</span>
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
        } catch (error) {
            console.error('Error fetching calendar flow logs:', error);
            const logsContainer = this.container.querySelector('.log-entries');
            logsContainer.innerHTML = `<div class="log-entry log-level-error">Error fetching calendar flow logs: ${error.message}</div>`;
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