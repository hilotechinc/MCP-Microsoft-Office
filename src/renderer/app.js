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

// Import using dynamic import for ESM compatibility with CommonJS backend
let addConnectionChecks;

// We'll import these dynamically in the constructor instead of at the module level
// to avoid top-level await which can cause issues in some browsers

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
                MonitoringService.trackMetric('api_status_fetch_time', duration, { endpoint: '/api/status' });
                MonitoringService.info('Successfully fetched status', { status: this.status.msGraph }, 'api');
                return;
            }
            
            // Fallback to health endpoint if status is not available
            const healthRes = await fetch('/api/health');
            if (healthRes.ok) {
                this.status = { msGraph: 'red', llm: 'red', details: {} };
                this.events.emit('status:changed');
                
                MonitoringService.info('Fetched health status (fallback)', { status: 'red' }, 'api');
            }
        } catch (e) {
            // Create standardized error
            const error = ErrorService.createError(
                'api',
                'Failed to fetch status',
                'error',
                { errorMessage: e.message }
            );
            MonitoringService.logError(error) || console.error('Failed to fetch status:', e);
            
            this.status = null;
            this.events.emit('status:changed');
        }
    }

    /**
     * Dynamically import dependencies to avoid top-level await
     */
    async initDependencies() {
        try {
            // Create promises for all dependencies to load in parallel
            this.dependencyPromises = [
                // Connection check module
                import('./check-connections.js')
                    .then(module => {
                        this.dependencies.connectionModule = module;
                        addConnectionChecks = module.addConnectionChecks;
                        MonitoringService?.info('Loaded connection check module', { moduleName: 'check-connections.js' }, 'renderer');
                    })
                    .catch(err => {
                        const error = ErrorService.createError(
                            'module', 
                            'Failed to load check-connections.js', 
                            'error', 
                            { error: err.message }
                        );
                        MonitoringService.logError(error) || console.error('Failed to load check-connections.js:', err);
                        throw err;
                    }),
                
                // Log viewer component
                import('./components/LogViewer.js')
                    .then(module => {
                        this.components.LogViewer = module.LogViewer;
                        MonitoringService?.info('Loaded LogViewer component', { componentName: 'LogViewer.js' }, 'renderer');
                    })
                    .catch(err => {
                        // Non-critical component, don't throw but still log
                        const error = ErrorService.createError(
                            'module', 
                            'Failed to load LogViewer.js', 
                            'warning', 
                            { error: err.message }
                        );
                        MonitoringService.logError(error) || console.error('Failed to load LogViewer.js:', err);
                    }),
                    
                // Initialize IPC communication for monitoring and error services
                new Promise((resolve) => {
                    // Check if IPC is available
                    if (window.electron?.ipcRenderer) {
                        // Notify main process that we're ready to use services
                        window.electron.ipcRenderer.send('services:load', 'all');
                        MonitoringService.info('IPC services initialized', { serviceName: 'ipc-services' }, 'renderer');
                    } else {
                        console.warn('Electron IPC not available. Using console fallbacks for monitoring and error services.');
                    }
                    resolve();
                })
            ];
            
            // Wait for critical dependencies
            await Promise.all(this.dependencyPromises);
            
            this.initialized = true;
            MonitoringService?.info('All dependencies loaded successfully', { dependenciesCount: this.dependencyPromises.length, initialized: true }, 'renderer');
        } catch (error) {
            // Create a standardized error if ErrorService is available
            const mcpError = ErrorService ? 
                ErrorService.createError('module', 'Failed to load critical dependencies', 'error', { error: error.message }) :
                { message: `Failed to load critical dependencies: ${error.message}` };
                
            // Log the error
            if (MonitoringService) {
                MonitoringService.logError(mcpError);
            } else {
                console.error(mcpError.message);
            }
            
            throw new Error(mcpError.message);
        }
    }

    async render() {
        // Start performance tracking
        const startTime = performance.now();
        
        MonitoringService?.info('Rendering application', { initialized: this.initialized }, 'renderer');
        
        try {
            // Wait for dependencies to be loaded before rendering
            if (!this.initialized) {
                MonitoringService?.info('Waiting for dependencies to load', { dependenciesCount: this.dependencyPromises.length }, 'renderer');
                
                try {
                    await Promise.allSettled(this.dependencyPromises);
                    
                    if (!this.initialized) {
                        // Fallback timeout - don't wait forever
                        await new Promise((resolve, reject) => {
                            const timeout = setTimeout(() => {
                                reject(new Error('Dependency loading timed out after 5 seconds'));
                            }, 5000);
                            
                            const checkInit = () => {
                                if (this.initialized) {
                                    clearTimeout(timeout);
                                    resolve();
                                } else {
                                    setTimeout(checkInit, 50);
                                }
                            };
                            checkInit();
                        });
                    }
                } catch (error) {
                    const mcpError = ErrorService.createError(
                        'module', 
                        'Error waiting for dependencies', 
                        'error', 
                        { error: error.message }
                    );
                    
                    MonitoringService.logError(mcpError) || console.error('Error waiting for dependencies:', error);
                    
                    throw error;
                }
            }
            
            // Fetch status to display in the dashboard
            await this.fetchStatus();
            
            // Track render performance
            const duration = performance.now() - startTime;
            MonitoringService?.trackMetric('render_time', duration, { initialized: this.initialized, hasStatus: !!this.status });
            MonitoringService?.info('Initial render complete', { renderTime: duration, hasStatus: !!this.status }, 'renderer');
        } catch (error) {
            // Create standardized error
            const mcpError = ErrorService.createError(
                'renderer', 
                'Render failed', 
                'error', 
                { error: error.message }
            );
            
            MonitoringService?.logError(mcpError) || console.error('Render failed:', error);
            
            // Display error in the root element
            this.root.innerHTML = `
                <div style="color: #d13438; padding: 20px; background-color: #fde7e9; border-radius: 4px; margin: 20px;">
                    <h2>Render Error</h2>
                    <p>${error.message}</p>
                    <button onclick="location.reload()" style="padding: 8px 16px; background-color: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">Reload Application</button>
                </div>
            `;
        }
    }

    async renderDashboard() {
        // Start performance tracking
        const startTime = performance.now();
        
        MonitoringService?.info('Rendering dashboard', { hasStatus: !!this.status }, 'renderer');
        
        this.root.innerHTML = '';
        // Status dashboard
        if (!this.status) {
            const err = document.createElement('div');
            err.textContent = 'Could not connect to MCP API backend.';
            err.style.color = '#e53935';
            this.root.appendChild(err);
            
            MonitoringService?.warn('Rendering dashboard with no status data', { attemptedRender: true, errorDisplayed: true }, 'renderer');
            return;
        }
        const statusBar = document.createElement('div');
        statusBar.id = 'status-bar';
        statusBar.style.display = 'flex';
        statusBar.style.alignItems = 'center';
        statusBar.style.gap = '24px';
        statusBar.style.marginBottom = '24px';
        this.root.appendChild(statusBar);
        
        // Use the status that was already fetched in the render method
        // This avoids duplicate API calls and logs
        let status = this.status || { msGraph: 'red', llm: 'red', details: {} };
        
        // Log dashboard rendering with status info (without sensitive data)
        MonitoringService?.info('Using status for dashboard', { 
            status: status.msGraph,
            hasUserInfo: !!(status.details?.msGraph?.user),
            // Don't log the actual user information
        }, 'renderer');
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
        
        // Always show login button in development mode for testing
        // In production, only show if not authenticated
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
            // Redirect to login page instead of fetch (avoids CORS issues)
            window.location.href = '/api/auth/login';
        };
        statusBar.appendChild(loginBtn);
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
        // Add connection check buttons (mail, calendar) if the function is available
        if (typeof addConnectionChecks === 'function') {
            try {
                addConnectionChecks(this.root);
                MonitoringService?.info('Added connection check buttons', {}, 'renderer');
            } catch (error) {
                // Create standardized error
                const mcpError = ErrorService ? 
                    ErrorService?.createError(
                        'renderer',
                        'Failed to add connection checks',
                        'warning', // Warning since rendering can continue
                        { errorMessage: error.message }
                    ) : { message: `Failed to add connection checks: ${error.message}` };
                MonitoringService?.logError(mcpError) || console.error('Failed to add connection checks:', error);
                // Continue rendering even if this fails
            }
        } else {
            MonitoringService?.warn('addConnectionChecks is not available', { functionName: 'addConnectionChecks' }, 'renderer') || console.warn('addConnectionChecks is not available');
        }

        // Add log viewer component if components are loaded
        if (this.components.LogViewer) {
            try {
                const logViewerContainer = document.createElement('div');
                logViewerContainer.id = 'log-viewer-container';
                logViewerContainer.style.margin = '24px 0';
                this.root.appendChild(logViewerContainer);
                
                // Initialize the log viewer component
                new this.components.LogViewer(logViewerContainer, {
                    apiEndpoint: '/api/v1/logs',
                    refreshInterval: 5000,
                    autoScroll: true,
                    maxEntries: 100
                });
                
                MonitoringService?.info('Initialized log viewer component', { componentName: 'LogViewer', apiEndpoint: '/api/v1/logs' }, 'renderer');
            } catch (error) {
                // Create standardized error
                const mcpError = ErrorService.createError(
                    'renderer',
                    'Failed to initialize log viewer',
                    'warning', // Warning since rendering can continue
                    { errorMessage: error.message }
                );
                MonitoringService?.logError(mcpError) || console.error('Failed to initialize log viewer:', error);
            }
        }

        // Claude integration help
        if (status.msGraph === 'green' && status.llm === 'green') {
            const help = document.createElement('div');
            help.style.margin = '24px 0';
            help.innerHTML = `
                <h2>Connect MCP to Claude Desktop</h2>
                <p>Add this API as a plugin in Claude Desktop:</p>
                <pre style="background:#f5f5f5;padding:8px;border-radius:4px;">http://localhost:3000/api</pre>
                <p>Then you can ask Claude things like:<br><code>Can you help me respond to the last mail from Krister?</code></p>
            `;
            this.root.appendChild(help);
        }
        
        // Track dashboard render performance
        const duration = performance.now() - startTime;
        MonitoringService?.trackMetric('dashboard_render_time', duration, { status: status.msGraph });
    }

    /**
     * Handle sending a query from the input box.
     */
    async handleSend() {
        const query = this.input.value.trim();
        if (!query) return;
        this.input.value = '';
        
        // Start performance tracking
        const startTime = performance.now();
        
        // Log the query (redact any sensitive information)
        // Don't log the full query as it might contain sensitive information
        // Just log that a query was sent with its length
        MonitoringService?.info('User sent query', { queryLength: query.length }, 'renderer');
        
        // Display in conversation
        this.addMessage('You', query);
        
        // IPC call to main process
        try {
            const res = await this.api.sendQuery(query);
            this.addMessage('Main', res.echo || JSON.stringify(res));
            
            // Track API performance
            const duration = performance.now() - startTime;
            MonitoringService?.trackMetric('query_response_time', duration, { queryLength: query.length, hasResponse: !!res });
            MonitoringService?.info('Query completed successfully', { hasResponse: !!res }, 'api');
        } catch (err) {
            // Create standardized error
            const error = ErrorService.createError(
                'api',
                'Query failed',
                'error',
                { errorMessage: err.message }
            );
            MonitoringService?.logError(error) || console.error('Query failed:', err);
            
            this.addMessage('Error', err.message || String(err));
        }
    }

    /**
     * Add a message to the conversation display.
     * @param {string} sender
     * @param {string} text
     */
    addMessage(sender, text) {
        try {
            const msg = document.createElement('div');
            msg.className = 'message';
            msg.innerHTML = `<strong>${sender}:</strong> ${text}`;
            this.conversation.appendChild(msg);
            this.conversation.scrollTop = this.conversation.scrollHeight;
            
            if (sender === 'Error') {
                // Log UI errors separately
                MonitoringService?.warn('Error message displayed to user', { sender }, 'renderer');
            }
        } catch (err) {
            // Create standardized error
            const error = ErrorService.createError(
                'renderer',
                'Failed to add message to conversation',
                'warning',
                { sender, errorMessage: err.message }
            );
            MonitoringService?.logError(error) || console.error('Failed to add message:', err);
        }
    }
}
