/**
 * @fileoverview Main App class for MCP renderer process.
 * Handles UI composition, state, and IPC integration.
 */

// Use IPC for monitoring and error services instead of direct imports
const MonitoringService = {
    info: (message, metadata, category) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:info', { message, metadata, category });
            return true;
        }
        console.info(`[${category || 'renderer'}] ${message}`, metadata || {});
        return false;
    },
    warn: (message, metadata, category) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:warn', { message, metadata, category });
            return true;
        }
        console.warn(`[${category || 'renderer'}] ${message}`, metadata || {});
        return false;
    },
    error: (message, metadata, category) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:error', { message, metadata, category });
            return true;
        }
        console.error(`[${category || 'renderer'}] ${message}`, metadata || {});
        return false;
    },
    logError: (error) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:logError', { error });
            return true;
        }
        console.error('[error]', error);
        return false;
    },
    trackMetric: (name, value, metadata) => {
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('monitoring:trackMetric', { name, value, metadata });
            return true;
        }
        console.log(`[metric] ${name}: ${value}`, metadata || {});
        return false;
    }
};

const ErrorService = {
    createError: (category, message, severity, context) => {
        // Create error locally but send via IPC for logging
        const error = {
            category,
            message,
            severity,
            context,
            timestamp: new Date().toISOString()
        };
        if (window.electron?.ipcRenderer) {
            window.electron.ipcRenderer.send('error:create', error);
        }
        return error;
    }
};

// Minimal event emitter for dashboard events
class EventEmitter {
    constructor() { this.events = {}; }
    on(event, fn) { (this.events[event] = this.events[event] || []).push(fn); return () => this.off(event, fn); }
    off(event, fn) { 
        if (!this.events[event]) return;
        const idx = this.events[event].indexOf(fn);
        if (idx >= 0) this.events[event].splice(idx, 1);
    }
    emit(event, ...args) { (this.events[event] || []).forEach(fn => fn(...args)); }
}

/**
 * Main App class for MCP renderer process.
 */
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
        
        // Dynamically import dependencies
        this.initialized = false;
        this.components = {};
        this.dependencies = {};
        this.dependencyPromises = [];
        
        // Start loading dependencies immediately
        this.initDependencies();
    }

    /**
     * Fetch status from the API
     * @returns {Promise<Object>} Status object
     */
    async fetchStatus() {
        try {
            // Start performance tracking
            const startTime = performance.now();
            
            // Try the direct status endpoint first
            const res = await fetch('/api/status');
            if (res.ok) {
                this.status = await res.json();
                this.events.emit('status:changed');
                
                // Track API performance
                const duration = performance.now() - startTime;
                if (MonitoringService && MonitoringService.trackMetric) {
                    MonitoringService.trackMetric('status_fetch_time', duration, { status: this.status.msGraph });
                }
                
                return this.status;
            } else {
                throw new Error(`API returned status ${res.status}`);
            }
        } catch (e) {
            // Create standardized error
            const errorObj = ErrorService.createError(
                'api',
                'Failed to fetch status',
                'error',
                { errorMessage: e.message }
            );
            if (MonitoringService && MonitoringService.logError) {
                MonitoringService.logError(errorObj);
            } else {
                console.error('Failed to fetch status:', e);
            }
            
            this.status = null;
            this.events.emit('status:changed');
            throw e;
        }
    }

    /**
     * Dynamically import dependencies to avoid top-level await
     * @returns {Promise<void>}
     */
    async initDependencies() {
        try {
            // Create promises for all dependencies to load in parallel
            this.dependencyPromises = [
                // Connection check module
                import('./check-connections.js')
                    .then(module => {
                        this.dependencies.connectionModule = module;
                        return module;
                    })
                    .catch(err => {
                        const error = ErrorService.createError(
                            'renderer',
                            'Failed to load check-connections.js',
                            'error',
                            { error: err }
                        );
                        if (MonitoringService && MonitoringService.logError) {
                            MonitoringService.logError(error);
                        }
                        console.error('Failed to load check-connections.js:', err);
                        throw err;
                    }),
                
                // Log viewer component
                import('./components/LogViewer.js')
                    .then(module => {
                        this.components.LogViewer = module.LogViewer;
                        return module;
                    })
                    .catch(err => {
                        const error = ErrorService.createError(
                            'renderer',
                            'Failed to load LogViewer.js',
                            'error',
                            { error: err }
                        );
                        if (MonitoringService && MonitoringService.logError) {
                            MonitoringService.logError(error);
                        }
                        console.error('Failed to load LogViewer.js:', err);
                    }),
                    
                // Initialize IPC communication for monitoring and error services
                new Promise((resolve) => {
                    // Check if IPC is available
                    if (window.electron?.ipcRenderer) {
                        // Notify main process that we're ready to use services
                        window.electron.ipcRenderer.send('renderer:ready');
                        MonitoringService.info('IPC initialized successfully', {}, 'renderer');
                    } else {
                        console.warn('Electron IPC not available. Using console fallbacks for monitoring and error services.');
                    }
                    resolve();
                })
            ];
            
            // Wait for critical dependencies
            await Promise.all(this.dependencyPromises);
            
            this.initialized = true;
            if (MonitoringService && MonitoringService.info) {
                MonitoringService.info('All dependencies loaded successfully', 
                    { dependenciesCount: this.dependencyPromises.length, initialized: true }, 
                    'renderer');
            }
        } catch (error) {
            console.error('Failed to initialize dependencies:', error);
            throw error;
        }
    }

    /**
     * Render the application
     * @returns {Promise<void>}
     */
    async render() {
        // Start performance tracking
        const startTime = performance.now();
        
        if (MonitoringService && MonitoringService.info) {
            MonitoringService.info('Rendering application', { initialized: this.initialized }, 'renderer');
        }
        
        try {
            // Wait for dependencies to be loaded before rendering
            if (!this.initialized) {
                if (MonitoringService && MonitoringService.info) {
                    MonitoringService.info('Waiting for dependencies to load', 
                        { dependenciesCount: this.dependencyPromises.length }, 
                        'renderer');
                }
                
                try {
                    await Promise.allSettled(this.dependencyPromises);
                    
                    if (!this.initialized) {
                        // Fallback timeout - don't wait forever
                        await new Promise((resolve, reject) => {
                            const timeout = setTimeout(() => {
                                this.initialized = true;
                                resolve();
                            }, 5000);
                            
                            // If dependencies load before timeout, clear it
                            const unsubscribe = this.events.on('dependencies:loaded', () => {
                                clearTimeout(timeout);
                                unsubscribe();
                                resolve();
                            });
                        });
                    }
                } catch (error) {
                    console.error('Error waiting for dependencies:', error);
                }
            }
            
            // Render the dashboard
            await this.renderDashboard();
            
            // Track render performance
            const duration = performance.now() - startTime;
            if (MonitoringService && MonitoringService.trackMetric) {
                MonitoringService.trackMetric('render_time', duration, { initialized: this.initialized });
            }
        } catch (error) {
            // Create standardized error
            const mcpError = ErrorService.createError(
                'renderer',
                'Render failed',
                'error',
                { errorMessage: error.message }
            );
            
            if (MonitoringService && MonitoringService.logError) {
                MonitoringService.logError(mcpError);
            } else {
                console.error('Render failed:', error);
            }
            
            // Display error in the root element using DOM methods instead of template literals
            this.root.innerHTML = '';
            
            const errorDiv = document.createElement('div');
            errorDiv.style.color = '#d13438';
            errorDiv.style.padding = '20px';
            errorDiv.style.backgroundColor = '#fde7e9';
            errorDiv.style.borderRadius = '4px';
            errorDiv.style.margin = '20px';
            
            const errorTitle = document.createElement('h2');
            errorTitle.textContent = 'Render Error';
            errorDiv.appendChild(errorTitle);
            
            const errorMessage = document.createElement('p');
            errorMessage.textContent = error.message || 'Unknown error';
            errorDiv.appendChild(errorMessage);
            
            const reloadButton = document.createElement('button');
            reloadButton.textContent = 'Reload Application';
            reloadButton.style.padding = '8px 16px';
            reloadButton.style.backgroundColor = '#0078d4';
            reloadButton.style.color = 'white';
            reloadButton.style.border = 'none';
            reloadButton.style.borderRadius = '4px';
            reloadButton.style.cursor = 'pointer';
            reloadButton.style.marginTop = '10px';
            reloadButton.onclick = () => location.reload();
            errorDiv.appendChild(reloadButton);
            
            // Append to document
            this.root.appendChild(errorDiv);
        }
    }
    
    /**
     * Fetches recent logs from the API and displays them in the Recent Activity section
     * Shows the flow of API calls through the MCP architecture
     * @param {boolean} clearExisting - Whether to clear existing logs before displaying new ones
     * @returns {Promise<void>}
     */
    async fetchRecentLogs(clearExisting = true) {
        try {
            const logsContainer = document.getElementById('recent-logs');
            if (!logsContainer) return;
            
            // DISABLED: Error preservation was causing exponential duplication
            // The circular buffer in the monitoring service now handles persistence
            let existingErrorLogs = [];
            
            // Fetch logs from the API with increased limit to ensure we get enough meaningful logs
            const response = await fetch('/api/v1/logs?limit=100&category=all');
            if (!response.ok) {
                throw new Error(`Failed to fetch logs: ${response.status}`);
            }
            
            const logs = await response.json();
            
            // Use logs directly from the monitoring service (no frontend preservation needed)
            const combinedLogs = [...logs];
            
            if (!Array.isArray(combinedLogs) || combinedLogs.length === 0) {
                logsContainer.innerHTML = '<p>No recent activity to display</p>';
                return;
            }
            
            // Get the active filter
            const activeFilter = document.querySelector('.filter-btn.active')?.dataset?.filter || 'all';
            
            // Filter out routine logs and apply component filters
            const filteredLogs = combinedLogs.filter(log => {
                // Always keep error logs regardless of filter
                if (log.severity === 'error' || log.level === 'error') {
                    return true;
                }
                
                // Filter out 'Unknown method' entries
                if (log.message && (log.message.includes('Unknown method') || log.message.includes('Unknown endpoint'))) {
                    return false;
                }
                
                // Filter out logs endpoint calls
                if (log.message && log.message.includes('/api/v1/logs')) {
                    return false;
                }
                
                // Skip routine health checks
                if (log.message && (
                    log.message.includes('health check') ||
                    log.message.includes('Health check')
                )) {
                    return false;
                }
                
                // Apply component-specific filtering
                if (activeFilter !== 'all') {
                    const lowerMessage = (log.message || '').toLowerCase();
                    const lowerCategory = (log.category || '').toLowerCase();
                    const lowerContext = JSON.stringify(log.context || {}).toLowerCase();
                    
                    if (activeFilter === 'mail') {
                        return lowerMessage.includes('mail') || 
                               lowerCategory.includes('mail') || 
                               lowerContext.includes('mail') || 
                               lowerMessage.includes('email') || 
                               lowerContext.includes('email');
                    } else if (activeFilter === 'calendar') {
                        return lowerMessage.includes('calendar') || 
                               lowerCategory.includes('calendar') || 
                               lowerContext.includes('calendar') || 
                               lowerMessage.includes('event') || 
                               lowerContext.includes('event');
                    } else if (activeFilter === 'files') {
                        return lowerMessage.includes('file') || 
                               lowerCategory.includes('file') || 
                               lowerContext.includes('file') || 
                               lowerMessage.includes('document') || 
                               lowerContext.includes('document');
                    }
                }
                
                return true;
            });
            
            // Check if we have any logs after filtering
            if (filteredLogs.length === 0) {
                logsContainer.innerHTML = '<p>No significant activity to display. Routine health checks and log requests are filtered out.</p>';
                return;
            }
            
            // Group logs by request ID to show the flow of a single request through the system
            const logsByRequestId = {};
            filteredLogs.forEach(log => {
                // Use context.requestId or generate a grouping key based on timestamp
                const requestId = log.context?.requestId || log.timestamp.substring(0, 19);
                if (!logsByRequestId[requestId]) {
                    logsByRequestId[requestId] = [];
                }
                logsByRequestId[requestId].push(log);
            });
            
            // Sort request groups by timestamp (newest first)
            const sortedRequestIds = Object.keys(logsByRequestId).sort((a, b) => {
                const timestampA = logsByRequestId[a][0].timestamp;
                const timestampB = logsByRequestId[b][0].timestamp;
                return new Date(timestampB) - new Date(timestampA);
            });
            
            // Build HTML for logs
            let logsHtml = '';
            
            sortedRequestIds.forEach(requestId => {
                const requestLogs = logsByRequestId[requestId];
                
                // Find the first log that indicates the start of a request
                const firstLog = requestLogs[0];
                
                // Try to find a log entry with method and path information
                const logWithRequestInfo = requestLogs.find(log => log.context?.method && log.context?.path);
                
                // Use the found log or fall back to the first log
                const endpoint = logWithRequestInfo?.context?.path || firstLog.context?.path || '';
                const method = logWithRequestInfo?.context?.method || firstLog.context?.method || '';
                
                // Create a collapsible section for each request
                logsHtml += `
                    <div class="log-request">
                        <div class="log-request-header" onclick="this.parentElement.classList.toggle('expanded')">
                            <span class="log-timestamp">${new Date(firstLog.timestamp).toLocaleTimeString()}</span>
                            ${method ? `<span class="log-method">${method}</span>` : ''}
                            ${endpoint ? `<span class="log-endpoint">${endpoint}</span>` : ''}
                            <span class="log-count">${requestLogs.length} steps</span>
                            <span class="log-expand-icon">▼</span>
                        </div>
                        <div class="log-request-details">
                `;
                
                // Add flow visualization
                logsHtml += '<div class="log-flow">';
                
                // Track which components we've seen in this request
                const components = [];
                requestLogs.forEach(log => {
                    // Determine component based on category or context
                    let component = log.category;
                    if (log.message && log.message.includes('routes')) component = 'routes';
                    else if (log.message && log.message.includes('controller')) component = 'controller';
                    else if (log.message && log.message.includes('module')) component = 'module';
                    else if (log.message && log.message.includes('service')) component = 'service';
                    else if (log.message && log.message.includes('normalizer')) component = 'normalizer';
                    
                    // Only add unique components
                    if (!components.includes(component)) {
                        components.push(component);
                    }
                });
                
                // Create the flow visualization
                const flowComponents = ['routes', 'controller', 'module', 'service', 'normalizer', 'service', 'module', 'controller', 'routes'];
                flowComponents.forEach((component, index) => {
                    const isActive = components.includes(component);
                    const isLast = index === flowComponents.length - 1;
                    
                    logsHtml += `<div class="flow-component ${isActive ? 'active' : ''}">
                        <div class="flow-node">${component}</div>
                        ${!isLast ? '<div class="flow-arrow">→</div>' : ''}
                    </div>`;
                });
                
                logsHtml += '</div>'; // End flow visualization
                
                // Add individual log entries
                requestLogs.forEach(log => {
                    const severity = log.severity || 'info';
                    const category = log.category || 'system';
                    const timestamp = new Date(log.timestamp).toLocaleTimeString();
                    
                    logsHtml += `
                        <div class="log-entry log-${severity}">
                            <span class="log-entry-timestamp">${timestamp}</span>
                            <span class="log-entry-category">${category}</span>
                            <span class="log-entry-message">${log.message}</span>
                        </div>
                    `;
                    
                    // If there's context, show it in a collapsible section
                    if (log.context && Object.keys(log.context).length > 0) {
                        let contextStr = '';
                        try {
                            contextStr = JSON.stringify(log.context, null, 2);
                        } catch (e) {
                            contextStr = 'Error formatting context';
                        }
                        
                        logsHtml += `
                            <div class="log-entry-context">
                                <pre>${contextStr}</pre>
                            </div>
                        `;
                    }
                });
                
                logsHtml += '</div></div>'; // Close log-request-details and log-request
            });
            
            // Store the current expanded state of log requests if we're not clearing existing logs
            const expandedRequestIds = [];
            if (!clearExisting) {
                document.querySelectorAll('.log-request.expanded').forEach(request => {
                    // Find a unique identifier for this request
                    const timestamp = request.querySelector('.log-timestamp')?.textContent;
                    const endpoint = request.querySelector('.log-endpoint')?.textContent;
                    if (timestamp && endpoint) {
                        expandedRequestIds.push(`${timestamp}-${endpoint}`);
                    }
                });
            }
            
            // Update the logs container
            logsContainer.innerHTML = logsHtml || '<p>No recent activity to display</p>';
            
            // Restore expanded state if we're not clearing existing logs
            if (!clearExisting && expandedRequestIds.length > 0) {
                document.querySelectorAll('.log-request').forEach(request => {
                    const timestamp = request.querySelector('.log-timestamp')?.textContent;
                    const endpoint = request.querySelector('.log-endpoint')?.textContent;
                    if (timestamp && endpoint) {
                        const requestId = `${timestamp}-${endpoint}`;
                        if (expandedRequestIds.includes(requestId)) {
                            request.classList.add('expanded');
                        }
                    }
                });
            }
            
            // Extract and display error logs in the dedicated error section
            const errorLogs = filteredLogs.filter(log => 
                log.severity === 'error' || 
                log.level === 'error' || 
                (log.message && log.message.toLowerCase().includes('error'))
            );
            
            // Update the error logs section if we have errors
            const errorLogsContainer = document.getElementById('error-logs');
            const errorLogsCard = document.getElementById('error-logs-card');
            
            if (errorLogsContainer && errorLogs.length > 0) {
                // Show the error logs card
                if (errorLogsCard) {
                    errorLogsCard.style.display = 'block';
                }
                
                // Build HTML for error logs
                let errorLogsHtml = '';
                
                errorLogs.forEach(log => {
                    const severity = log.severity || 'error';
                    const category = log.category || 'system';
                    const timestamp = log.context?.preserved ? 
                        log.context.originalTimestamp : 
                        new Date(log.timestamp).toLocaleTimeString();
                    
                    const preservedClass = log.context?.preserved ? 'preserved-error' : '';
                    
                    errorLogsHtml += `
                        <div class="log-entry log-${severity} ${preservedClass}">
                            <span class="log-entry-timestamp">${timestamp}</span>
                            <span class="log-entry-category">${category}</span>
                            <span class="log-entry-message">${log.message}</span>
                        </div>
                    `;
                    
                    // If there's context with a stack trace, show it
                    if (log.context && log.context.stack) {
                        errorLogsHtml += `
                            <div class="log-entry-context">
                                <pre>${log.context.stack}</pre>
                            </div>
                        `;
                    } else if (log.context && Object.keys(log.context).length > 0 && !log.context.preserved) {
                        let contextStr = '';
                        try {
                            contextStr = JSON.stringify(log.context, null, 2);
                        } catch (e) {
                            contextStr = 'Error formatting context';
                        }
                        
                        errorLogsHtml += `
                            <div class="log-entry-context">
                                <pre>${contextStr}</pre>
                            </div>
                        `;
                    }
                });
                
                errorLogsContainer.innerHTML = errorLogsHtml || '<p>No errors to display</p>';
                
                // Add event listener to the clear errors button
                const clearErrorsBtn = document.getElementById('clear-errors-btn');
                if (clearErrorsBtn) {
                    clearErrorsBtn.addEventListener('click', () => {
                        if (errorLogsContainer) {
                            errorLogsContainer.innerHTML = '<p>No errors to display</p>';
                        }
                        if (errorLogsCard) {
                            errorLogsCard.style.display = 'none';
                        }
                    });
                }
            } else if (errorLogsContainer) {
                errorLogsContainer.innerHTML = '<p>No errors to display</p>';
                if (errorLogsCard) {
                    errorLogsCard.style.display = 'none';
                }
            }
            
            // Add event listeners to filter buttons
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    // Update active state
                    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    const filter = btn.dataset.filter;
                    
                    // Apply filtering
                    document.querySelectorAll('.log-request').forEach(request => {
                        if (filter === 'all') {
                            request.classList.remove('filtered');
                            return;
                        }
                        
                        // Check if this request matches the filter
                        const endpoint = request.querySelector('.log-endpoint')?.textContent || '';
                        const messages = Array.from(request.querySelectorAll('.log-entry-message')).map(el => el.textContent);
                        
                        let matches = false;
                        
                        // Check if endpoint or any message contains the filter keyword
                        if (endpoint.toLowerCase().includes(filter.toLowerCase())) {
                            matches = true;
                        } else if (messages.some(msg => msg.toLowerCase().includes(filter.toLowerCase()))) {
                            matches = true;
                        }
                        
                        if (matches) {
                            request.classList.remove('filtered');
                        } else {
                            request.classList.add('filtered');
                        }
                    });
                });
            });
            
            // Add CSS for the logs
            if (!document.getElementById('logs-css')) {
                const style = document.createElement('style');
                style.id = 'logs-css';
                style.textContent = `
                    .recent-logs {
                        max-height: 500px;
                        overflow-y: auto;
                        font-family: var(--font-mono);
                        font-size: 12px;
                    }
                    .log-request {
                        margin-bottom: 12px;
                        border: 1px solid var(--neutral-90);
                        border-radius: 4px;
                    }
                    .log-request-header {
                        display: flex;
                        align-items: center;
                        padding: 8px 12px;
                        background-color: var(--neutral-95);
                        cursor: pointer;
                        border-radius: 4px;
                    }
                    .log-timestamp {
                        color: var(--neutral-40);
                        margin-right: 8px;
                        font-size: 11px;
                    }
                    .log-method {
                        font-weight: bold;
                        margin-right: 8px;
                        color: var(--primary);
                    }
                    .log-endpoint {
                        flex-grow: 1;
                        font-weight: 500;
                    }
                    .log-count {
                        background: var(--neutral-90);
                        padding: 2px 6px;
                        border-radius: 10px;
                        font-size: 10px;
                        margin-right: 8px;
                    }
                    .log-expand-icon {
                        transition: transform 0.2s;
                    }
                    .log-request-details {
                        display: none;
                        padding: 8px 12px;
                        border-top: 1px solid var(--neutral-90);
                    }
                    .log-request.expanded .log-request-details {
                        display: block;
                    }
                    .log-request.expanded .log-expand-icon {
                        transform: rotate(180deg);
                    }
                    .log-entry {
                        padding: 4px 0;
                        border-bottom: 1px solid var(--neutral-95);
                    }
                    .log-entry:last-child {
                        border-bottom: none;
                    }
                    .log-entry-timestamp {
                        color: var(--neutral-40);
                        margin-right: 8px;
                        font-size: 11px;
                    }
                    .log-entry-category {
                        background: var(--neutral-90);
                        padding: 1px 4px;
                        border-radius: 3px;
                        margin-right: 8px;
                        font-size: 10px;
                    }
                    .log-entry-message {
                        word-break: break-word;
                    }
                    .log-entry-context {
                        margin-left: 20px;
                        padding: 4px 8px;
                        background: var(--neutral-97);
                        border-radius: 3px;
                        margin-top: 4px;
                        margin-bottom: 8px;
                        font-size: 11px;
                    }
                    .log-entry-context pre {
                        margin: 0;
                        white-space: pre-wrap;
                    }
                    .log-info { color: var(--neutral-20); }
                    .log-warning { color: var(--warning); }
                    .log-error { color: var(--error); }
                    .log-critical { color: var(--error); font-weight: bold; }
                    .log-flow {
                        display: flex;
                        align-items: center;
                        padding: 12px 0;
                        margin-bottom: 12px;
                        overflow-x: auto;
                        border-bottom: 1px solid var(--neutral-90);
                    }
                    .flow-component {
                        display: flex;
                        align-items: center;
                        opacity: 0.5;
                    }
                    .flow-component.active {
                        opacity: 1;
                    }
                    .flow-node {
                        background: var(--neutral-90);
                        padding: 4px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 500;
                    }
                    .flow-component.active .flow-node {
                        background: var(--primary);
                        color: white;
                    }
                    .flow-arrow {
                        margin: 0 4px;
                        color: var(--neutral-60);
                    }
                    .activity-filters {
                        display: flex;
                        gap: 8px;
                        margin-top: 8px;
                    }
                    .filter-btn {
                        background: var(--neutral-95);
                        border: 1px solid var(--neutral-90);
                        border-radius: 4px;
                        padding: 4px 8px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .filter-btn:hover {
                        background: var(--neutral-90);
                    }
                    .filter-btn.active {
                        background: var(--primary);
                        color: white;
                        border-color: var(--primary);
                    }
                    .log-request.filtered {
                        display: none;
                    }
                    .card-header-top {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        margin-bottom: 8px;
                    }
                    .card-controls {
                        display: flex;
                        align-items: center;
                        gap: 12px;
                    }
                    .toggle-switch {
                        position: relative;
                        display: inline-flex;
                        align-items: center;
                        cursor: pointer;
                        font-size: 12px;
                    }
                    .toggle-switch input {
                        opacity: 0;
                        width: 0;
                        height: 0;
                    }
                    .toggle-slider {
                        position: relative;
                        display: inline-block;
                        width: 36px;
                        height: 18px;
                        background-color: var(--neutral-80);
                        border-radius: 18px;
                        transition: .4s;
                        margin-right: 8px;
                    }
                    .toggle-slider:before {
                        position: absolute;
                        content: "";
                        height: 14px;
                        width: 14px;
                        left: 2px;
                        bottom: 2px;
                        background-color: white;
                        border-radius: 50%;
                        transition: .4s;
                    }
                    input:checked + .toggle-slider {
                        background-color: var(--primary);
                    }
                    input:checked + .toggle-slider:before {
                        transform: translateX(18px);
                    }
                    .toggle-label {
                        color: var(--neutral-40);
                    }
                    .action-btn {
                        background: var(--neutral-95);
                        border: 1px solid var(--neutral-90);
                        border-radius: 4px;
                        padding: 4px 8px;
                        font-size: 12px;
                        cursor: pointer;
                        transition: all 0.2s;
                    }
                    .action-btn:hover {
                        background: var(--neutral-90);
                    }
                    .error-card {
                        margin-bottom: 16px;
                        border-left: 4px solid var(--error);
                    }
                    .error-header {
                        background-color: rgba(var(--error-rgb), 0.05);
                    }
                    .error-logs {
                        max-height: 300px;
                        overflow-y: auto;
                        font-family: var(--font-mono);
                        font-size: 12px;
                    }
                    .preserved-error {
                        border-left: 3px solid var(--error);
                        padding-left: 8px;
                        margin-bottom: 8px;
                    }
                `;
                document.head.appendChild(style);
            }
        } catch (error) {
            console.error('Error fetching logs:', error);
            const logsContainer = document.getElementById('recent-logs');
            if (logsContainer) {
                logsContainer.innerHTML = `<p class="error">Error loading logs: ${error.message}</p>`;
            }
        }
    }
    
    /**
     * Renders the dashboard with the modern two-column layout.
     * Displays system status, integration status, and recent activity.
     * @returns {Promise<void>}
     */
    async renderDashboard() {
        // Start performance tracking
        const startTime = performance.now();
        
        try {
            // Get the app container
            const appDiv = document.getElementById('app');
            if (!appDiv) {
                throw new Error('App container not found');
            }
            
            // Check if we have status information
            if (!this.status) {
                try {
                    await this.fetchStatus();
                } catch (error) {
                    // Create error card
                    const errorCard = document.createElement('div');
                    errorCard.className = 'card error-card';
                    errorCard.innerHTML = 
                        '<div class="card-header">'+
                            '<h3 class="card-title">Connection Error</h3>'+
                        '</div>'+
                        '<div class="card-body">'+
                            '<p>Unable to connect to MCP API. Please check your connection and try again.</p>'+
                            '<p class="error-details">'+(error.message || 'Unknown error')+'</p>'+
                            '<button id="retry-connection" class="btn btn-primary mt-4">Retry Connection</button>'+
                        '</div>';
                    
                    // Clear and append
                    appDiv.innerHTML = '';
                    appDiv.appendChild(errorCard);
                    
                    // Add retry button listener
                    const retryButton = document.getElementById('retry-connection');
                    if (retryButton) {
                        retryButton.addEventListener('click', async () => {
                            try {
                                await this.fetchStatus();
                                this.renderDashboard();
                            } catch (retryError) {
                                const errorDetails = document.querySelector('.error-details');
                                if (errorDetails) {
                                    errorDetails.textContent = retryError.message || 'Connection failed';
                                }
                            }
                        });
                    }
                    
                    // Log error
                    if (MonitoringService && MonitoringService.error) {
                        MonitoringService.error('Failed to fetch status', { error: error.message }, 'api');
                    }
                    return;
                }
            }
            
            // Create system status card
            const statusCard = document.createElement('div');
            statusCard.className = 'card';
            const msGraphStatus = this.status.msGraph === 'green' ? 'active' : '';
            const llmStatus = this.status.llm === 'green' ? 'active' : '';
            statusCard.innerHTML = 
                '<div class="card-header">'+
                    '<h3 class="card-title">System Status</h3>'+
                '</div>'+
                '<div class="card-body">'+
                    '<div class="status-indicators">'+
                        '<div class="status-indicator">'+
                            '<span class="status-dot '+msGraphStatus+'"></span>'+
                            '<span>Microsoft Graph API</span>'+
                        '</div>'+
                        '<div class="status-indicator">'+
                            '<span class="status-dot '+llmStatus+'"></span>'+
                            '<span>LLM API</span>'+
                        '</div>'+
                    '</div>'+
                    '<div class="system-status mt-4">'+
                        '<span class="status-indicator">'+
                            '<span class="status-dot active"></span>'+
                            '<span>System Online</span>'+
                        '</span>'+
                    '</div>'+
                    '<div class="login-section mt-4">'+
                        '<button id="login-button" class="btn btn-primary">Login with Microsoft</button>'+
                    '</div>'+
                '</div>';
            
            // Create logs card
            // Create error logs card first (will be shown if there are errors)
            const errorLogsCard = document.createElement('div');
            errorLogsCard.className = 'card error-card';
            errorLogsCard.id = 'error-logs-card';
            errorLogsCard.style.display = 'none'; // Hidden by default, shown when errors exist
            errorLogsCard.innerHTML = 
                '<div class="card-header error-header">'+
                    '<div class="card-header-top">'+
                        '<h3 class="card-title">Error Logs</h3>'+
                        '<div class="card-controls">'+
                            '<button id="clear-errors-btn" class="action-btn">Clear</button>'+
                        '</div>'+
                    '</div>'+
                '</div>'+
                '<div class="card-body">'+
                    '<div id="error-logs" class="error-logs">'+
                        '<p>No errors to display</p>'+
                    '</div>'+
                '</div>';
            
            // Create regular logs card
            const logsCard = document.createElement('div');
            logsCard.className = 'card';
            logsCard.innerHTML = 
                '<div class="card-header">'+
                    '<div class="card-header-top">'+
                        '<h3 class="card-title">Recent Activity</h3>'+
                        '<div class="card-controls">'+
                            '<label class="toggle-switch">'+
                                '<input type="checkbox" id="auto-refresh-toggle" checked>'+
                                '<span class="toggle-slider"></span>'+
                                '<span class="toggle-label">Auto-refresh</span>'+
                            '</label>'+
                            '<button id="clear-logs-btn" class="action-btn">Clear</button>'+
                        '</div>'+
                    '</div>'+
                    '<div class="activity-filters">'+
                        '<button class="filter-btn active" data-filter="all">All</button>'+
                        '<button class="filter-btn" data-filter="mail">Mail</button>'+
                        '<button class="filter-btn" data-filter="calendar">Calendar</button>'+
                        '<button class="filter-btn" data-filter="files">Files</button>'+
                    '</div>'+
                '</div>'+
                '<div class="card-body">'+
                    '<div id="recent-logs" class="recent-logs">'+
                        '<p>Loading recent activity...</p>'+
                    '</div>'+
                '</div>';
            
            // Clear and append cards
            appDiv.innerHTML = '';
            appDiv.appendChild(statusCard);
            appDiv.appendChild(errorLogsCard); // Add error logs card first
            appDiv.appendChild(logsCard);
            
            // Add login button event listener
            const loginButton = document.getElementById('login-button');
            if (loginButton) {
                loginButton.addEventListener('click', () => {
                    // Redirect to login page using GET
                    window.location.href = '/api/auth/login';
                });
            }
            
            // Fetch recent logs
            this.fetchRecentLogs();
            
            // Set up auto-refresh toggle handler
            const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
            if (autoRefreshToggle) {
                // Set initial state
                autoRefreshToggle.checked = this.autoRefreshEnabled !== false;
                
                // Add event listener
                autoRefreshToggle.addEventListener('change', () => {
                    this.autoRefreshEnabled = autoRefreshToggle.checked;
                    
                    // Clear existing interval if any
                    if (this.logRefreshInterval) {
                        clearInterval(this.logRefreshInterval);
                        this.logRefreshInterval = null;
                    }
                    
                    // Set up new interval if enabled
                    if (this.autoRefreshEnabled) {
                        this.logRefreshInterval = setInterval(() => {
                            this.fetchRecentLogs(false); // Don't clear existing logs
                        }, 10000); // Refresh every 10 seconds
                    }
                });
                
                // Initial setup of interval
                if (this.autoRefreshEnabled !== false && !this.logRefreshInterval) {
                    this.logRefreshInterval = setInterval(() => {
                        this.fetchRecentLogs(false); // Don't clear existing logs
                    }, 10000); // Refresh every 10 seconds
                }
            }
            
            // Set up clear logs button handler
            const clearLogsBtn = document.getElementById('clear-logs-btn');
            if (clearLogsBtn) {
                clearLogsBtn.addEventListener('click', () => {
                    this.fetchRecentLogs(true); // Force clear and refresh logs
                });
            }
            
            // Track dashboard render performance
            const duration = performance.now() - startTime;
            if (MonitoringService && MonitoringService.trackMetric) {
                MonitoringService.trackMetric('dashboard_render_time', duration, { status: this.status.msGraph });
            }
        } catch (error) {
            // Log error
            if (MonitoringService && MonitoringService.error) {
                MonitoringService.error('Failed to render dashboard', { error: error.message }, 'renderer');
            }
            console.error('Error rendering dashboard:', error);
            
            // Display error in UI
            if (appDiv) {
                const errorCard = document.createElement('div');
                errorCard.className = 'card error-card';
                errorCard.innerHTML = 
                    '<div class="card-header">'+
                        '<h3 class="card-title">Application Error</h3>'+
                    '</div>'+
                    '<div class="card-body">'+
                        '<p>Unexpected error occurred while rendering the dashboard.</p>'+
                        '<p class="error-details">'+(error.message || 'Unknown error')+'</p>'+
                        '<button id="retry-dashboard" class="btn btn-primary mt-4">Retry</button>'+
                    '</div>';
                
                // Clear and append
                appDiv.innerHTML = '';
                appDiv.appendChild(errorCard);
                
                // Add retry button listener
                const retryButton = document.getElementById('retry-dashboard');
                if (retryButton) {
                    retryButton.addEventListener('click', () => {
                        this.renderDashboard();
                    });
                }
            }
        }
    }
}
