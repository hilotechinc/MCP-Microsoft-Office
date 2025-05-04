/**
 * @fileoverview Bundled JavaScript for MCP renderer process.
 * This combines all the modules into a single file to avoid module loading issues.
 */

// Use IPC for monitoring and error services instead of direct imports
const MonitoringService = {
    info: (message, metadata, category) => {
        window.electron.ipcRenderer.send('monitoring:info', { message, metadata, category });
    },
    warn: (message, metadata, category) => {
        window.electron.ipcRenderer.send('monitoring:warn', { message, metadata, category });
    },
    error: (message, metadata, category) => {
        window.electron.ipcRenderer.send('monitoring:error', { message, metadata, category });
    },
    logError: (error) => {
        window.electron.ipcRenderer.send('monitoring:logError', { error });
        return true; // Always return true so the fallback doesn't execute
    },
    trackMetric: (name, value, metadata) => {
        window.electron.ipcRenderer.send('monitoring:trackMetric', { name, value, metadata });
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
        window.electron.ipcRenderer.send('error:create', error);
        return error;
    }
};

// Function to initialize IPC communication
function initIPC() {
    try {
        // Check if electron IPC is available
        if (!window.electron || !window.electron.ipcRenderer) {
            console.error('Electron IPC not available. Falling back to console logging.');
            return false;
        }
        
        // Log successful initialization
        MonitoringService.info('IPC communication initialized', { ipcInitialized: true }, 'renderer');
        return true;
    } catch (e) {
        // If IPC fails to initialize, we'll use console fallbacks
        console.error('Failed to initialize IPC:', e);
        return false;
    }
}

// Function to initialize IPC communication
function initServices() {
    try {
        // Check if electron IPC is available
        if (!window.electron || !window.electron.ipcRenderer) {
            console.error('Electron IPC not available. Falling back to console logging.');
            return false;
        }
        
        // Notify main process that we're ready
        window.electron.ipcRenderer.send('services:load', 'all');
        
        // Log successful initialization
        MonitoringService.info('IPC services initialized successfully', { ipcInitialized: true }, 'renderer');
        return true;
    } catch (error) {
        // This is an acceptable use of console.error as a fallback
        console.error('Failed to initialize IPC services:', error);
        return false;
    }
}

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
    // Log initialization
    MonitoringService?.info('Initializing connection checks', { apiBase }, 'renderer');
    
    // Attach debug button listeners if present in DOM
    const debugMailBtn = document.getElementById('debug-mail-btn');
    const debugCalBtn = document.getElementById('debug-calendar-btn');
    
    if (debugMailBtn) {
        debugMailBtn.onclick = async () => {
            // Start performance tracking
            const startTime = performance.now();
            
            debugMailBtn.disabled = true;
            debugMailBtn.textContent = 'Debugging...';
            
            MonitoringService?.info('Mail debug requested', { endpoint: `${apiBase}/v1/mail` }, 'api');
            
            try {
                const res = await fetch(`${apiBase}/v1/mail?limit=1&debug=true`);
                const data = await res.json();
                
                // Track API performance
                if (MonitoringService) {
                    const duration = performance.now() - startTime;
                    MonitoringService.trackMetric('mail_debug_time', duration, { endpoint: `${apiBase}/v1/mail` });
                    MonitoringService.info('Mail debug successful', { status: res.status }, 'api');
                }
                
                showDebugModal('Mail Debug', data);
            } catch (e) {
                // Create standardized error
                const error = ErrorService ? 
                    ErrorService.createError(
                        'api',
                        'Mail debug failed',
                        'error',
                        { endpoint: `${apiBase}/v1/mail`, errorMessage: e.message }
                    ) : { message: `Mail debug failed: ${e.message}` };
                    
                MonitoringService?.logError(error) || console.error('Mail debug failed:', e);
                
                showDebugModal('Mail Debug', { error: e.message });
            } finally {
                debugMailBtn.disabled = false;
                debugMailBtn.textContent = 'Debug Mail';
            }
        };
    }
    
    if (debugCalBtn) {
        debugCalBtn.onclick = async () => {
            // Start performance tracking
            const startTime = performance.now();
            
            debugCalBtn.disabled = true;
            debugCalBtn.textContent = 'Debugging...';
            
            if (MonitoringService) {
                MonitoringService.info('Calendar debug requested', { endpoint: `${apiBase}/v1/calendar` }, 'api');
            }
            
            try {
                const res = await fetch(`${apiBase}/v1/calendar?limit=1&debug=true`);
                const data = await res.json();
                
                // Track API performance
                if (MonitoringService) {
                    const duration = performance.now() - startTime;
                    MonitoringService.trackMetric('calendar_debug_time', duration, { endpoint: `${apiBase}/v1/calendar` });
                    MonitoringService.info('Calendar debug successful', { status: res.status }, 'api');
                }
                
                showDebugModal('Calendar Debug', data);
            } catch (e) {
                // Create standardized error
                const error = ErrorService ? 
                    ErrorService.createError(
                        'api',
                        'Calendar debug failed',
                        'error',
                        { endpoint: `${apiBase}/v1/calendar`, errorMessage: e.message }
                    ) : { message: `Calendar debug failed: ${e.message}` };
                
                MonitoringService?.logError(error) || console.error('Calendar debug failed:', e);
                
                showDebugModal('Calendar Debug', { error: e.message });
            } finally {
                debugCalBtn.disabled = false;
                debugCalBtn.textContent = 'Debug Calendar';
            }
        };
    }
    
    // Debug modal helper
    function showDebugModal(title, data) {
        try {
            if (MonitoringService) {
                // Redact sensitive data before logging
                const safeData = { ...data };
                if (safeData.token) safeData.token = '[REDACTED]';
                if (safeData.accessToken) safeData.accessToken = '[REDACTED]';
                if (safeData.refreshToken) safeData.refreshToken = '[REDACTED]';
                
                MonitoringService.info('Showing debug modal', { title, dataType: typeof data }, 'renderer');
            }
            
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
            
            // Redact sensitive data in the displayed JSON
            const displayData = JSON.parse(JSON.stringify(data)); // Deep clone
            if (displayData.token) displayData.token = '[REDACTED]';
            if (displayData.accessToken) displayData.accessToken = '[REDACTED]';
            if (displayData.refreshToken) displayData.refreshToken = '[REDACTED]';
            
            content.textContent = JSON.stringify(displayData, null, 2);
            modal.appendChild(content);
            
            const closeBtn = document.createElement('button');
            closeBtn.textContent = 'Close';
            closeBtn.style.marginTop = '16px';
            closeBtn.style.padding = '8px 16px';
            closeBtn.onclick = () => {
                try {
                    document.body.removeChild(modal);
                    if (MonitoringService) {
                        MonitoringService.info('Debug modal closed', { title }, 'renderer');
                    }
                } catch (e) {
                    const error = ErrorService ? 
                        ErrorService.createError(
                            'renderer',
                            'Failed to close debug modal',
                            'warning',
                            { title, errorMessage: e.message }
                        ) : { message: `Failed to close debug modal: ${e.message}` };
                    
                    MonitoringService?.logError(error) || console.error('Failed to close debug modal:', e);
                }
            };
            modal.appendChild(closeBtn);
            
            document.body.appendChild(modal);
        } catch (e) {
            // Create standardized error
            const error = ErrorService ? 
                ErrorService.createError(
                    'renderer',
                    'Failed to show debug modal',
                    'error',
                    { title, errorMessage: e.message }
                ) : { message: `Failed to show debug modal: ${e.message}` };
            
            MonitoringService?.logError(error) || console.error('Failed to show debug modal:', e);
            
            // Fallback to alert if modal creation fails
            alert(`Debug ${title} Error: ${e.message}`);
        }
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
        // Start performance tracking
        const startTime = performance.now();
        
        MonitoringService?.info('Fetching application status', { timestamp: new Date().toISOString() }, 'api');
        
        try {
            // Try the direct status endpoint first
            const res = await fetch('/api/status');
            if (res.ok) {
                this.status = await res.json();
                this.events.emit('status:changed');
                
                // Track API performance
                const duration = performance.now() - startTime;
                MonitoringService?.trackMetric('status_fetch_time', duration, { endpoint: '/api/status' });
                MonitoringService?.info('Successfully fetched status', { status: this.status.msGraph }, 'api');
                
                return;
            }
            
            // Fallback to health endpoint if status is not available
            MonitoringService?.warn('Status endpoint unavailable, falling back to health check', { statusCode: res.status }, 'api');
            
            const healthRes = await fetch('/api/health');
            if (healthRes.ok) {
                this.status = { msGraph: 'red', llm: 'red', details: {} };
                this.events.emit('status:changed');
                
                MonitoringService?.info('Fetched health status (fallback)', { status: 'red' }, 'api');
            }
        } catch (e) {
            // Create standardized error
            const error = ErrorService?.createError(
                'api',
                'Failed to fetch status',
                'error',
                { endpoint: '/api/status', errorMessage: e.message }
            ) || { message: `Failed to fetch status: ${e.message}` };
            
            MonitoringService?.logError(error) || console.error('Failed to fetch status:', e);
            
            this.status = null;
            this.events.emit('status:changed');
        }
    }

    async render() {
        // Start performance tracking
        const startTime = performance.now();
        
        MonitoringService?.info('Rendering application', { timestamp: new Date().toISOString() }, 'renderer');
        
        try {
            await this.fetchStatus();
            
            // Track render performance
            const duration = performance.now() - startTime;
            MonitoringService?.trackMetric('render_time', duration, { component: 'application' });
            MonitoringService?.info('Application render complete', { renderTime: duration }, 'renderer');
        } catch (error) {
            // Create standardized error
            const mcpError = ErrorService?.createError(
                'renderer',
                'Application render failed',
                'error',
                { errorMessage: error.message }
            ) || { message: `Application render failed: ${error.message}` };
            
            MonitoringService?.logError(mcpError) || console.error('Application render failed:', error);
            
            throw error; // Re-throw to allow the initialization code to handle it
        }
    }

    async renderDashboard() {
        // Start performance tracking
        const startTime = performance.now();
        
        MonitoringService?.info('Rendering dashboard', { timestamp: new Date().toISOString() }, 'renderer');
        
        try {
            this.root.innerHTML = '';
            // Status dashboard
            if (!this.status) {
                const err = document.createElement('div');
                err.textContent = 'Could not connect to MCP API backend.';
                err.style.color = '#e53935';
                this.root.appendChild(err);
                
                MonitoringService?.warn('Rendering dashboard with no status data', { timestamp: new Date().toISOString() }, 'renderer');
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
                if (res.ok) {
                    status = await res.json();
                    
                    MonitoringService?.info('Fetched status for dashboard', { status: status.msGraph }, 'api');
                }
            } catch (e) {
                const error = ErrorService?.createError(
                    'api',
                    'Failed to fetch status for dashboard',
                    'warning', // Warning since we have fallback
                    { errorMessage: e.message }
                ) || { message: `Failed to fetch status for dashboard: ${e.message}` };
                
                MonitoringService?.logError(error) || console.error('Failed to fetch status for dashboard:', e);
            }
            
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
                    
                    MonitoringService?.info('User initiated login', { timestamp: new Date().toISOString() }, 'auth');
                    
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
                    // Start performance tracking
                    const logoutStartTime = performance.now();
                    
                    MonitoringService?.info('User initiated logout', { timestamp: new Date().toISOString() }, 'auth');
                    
                    try {
                        logoutBtn.disabled = true;
                        logoutBtn.textContent = 'Logging out...';
                        
                        // Call the logout endpoint
                        const res = await fetch('/api/auth/logout', { 
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' }
                        });
                        
                        if (res.ok) {
                            const duration = performance.now() - logoutStartTime;
                            MonitoringService?.trackMetric('logout_time', duration, { component: 'auth' });
                            MonitoringService?.info('Logout successful', { logoutTime: duration }, 'auth');
                            
                            // Refresh status after logout
                            await this.fetchStatus();
                        } else {
                            const errorData = await res.json();
                            
                            // Create standardized error
                            const error = ErrorService?.createError(
                                'auth',
                                'Logout failed',
                                'error',
                                { statusCode: res.status, errorMessage: errorData.message || 'Unknown error' }
                            ) || { message: `Logout failed: ${errorData.message || 'Unknown error'}` };
                            
                            MonitoringService?.logError(error) || console.error('Logout failed:', errorData);
                            
                            alert(`Logout failed: ${errorData.message || 'Unknown error'}`);
                            logoutBtn.disabled = false;
                            logoutBtn.textContent = 'Logout';
                        }
                    } catch (error) {
                        // Create standardized error
                        const mcpError = ErrorService?.createError(
                            'auth',
                            'Logout failed',
                            'error',
                            { errorMessage: error.message }
                        ) || { message: `Logout failed: ${error.message}` };
                        
                        MonitoringService?.logError(mcpError) || console.error('Logout failed:', error);
                        
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
            
            // Track render performance
            const duration = performance.now() - startTime;
            MonitoringService?.trackMetric('dashboard_render_time', duration, { component: 'dashboard' });
            MonitoringService?.info('Dashboard render complete', { renderTime: duration }, 'renderer');
        } catch (error) {
            // Create standardized error
            const mcpError = ErrorService?.createError(
                'renderer',
                'Dashboard render failed',
                'error',
                { errorMessage: error.message }
            ) || { message: `Dashboard render failed: ${error.message}` };
            
            MonitoringService?.logError(mcpError) || console.error('Dashboard render failed:', error);
            
            // Show error message to user
            this.root.innerHTML = '';
            const errorDiv = document.createElement('div');
            errorDiv.textContent = `Error rendering dashboard: ${error.message}`;
            errorDiv.style.color = 'red';
            errorDiv.style.padding = '20px';
            this.root.appendChild(errorDiv);
        }
    }
}

// Initialize the app
document.addEventListener('DOMContentLoaded', async () => {
    // Initialize IPC services for monitoring and error handling
    initServices();
    
    MonitoringService?.info('Application initializing', { timestamp: new Date().toISOString() }, 'renderer');
    
    try {
        const root = document.getElementById('app');
        if (!root) {
            // Create root if missing
            const div = document.createElement('div');
            div.id = 'app';
            document.body.appendChild(div);
            
            MonitoringService?.info('Created app root element', { elementId: 'app' }, 'renderer');
        }
        
        // Start performance tracking
        const startTime = performance.now();
        
        const app = new App({
            element: document.getElementById('app')
        });
        
        await app.render();
        
        // Track initialization performance
        const duration = performance.now() - startTime;
        MonitoringService?.trackMetric('app_initialization_time', duration, { component: 'application' });
        MonitoringService?.info('Application initialized successfully', { initTime: duration }, 'renderer');
    } catch (error) {
        // Create standardized error
        const mcpError = ErrorService?.createError(
            'renderer',
            'Failed to initialize application',
            'error',
            { errorMessage: error.message }
        ) || { message: `Failed to initialize application: ${error.message}` };
        
        MonitoringService?.logError(mcpError) || console.error('Failed to initialize application:', error);
        
        // Show error message to user
        const errorDiv = document.createElement('div');
        errorDiv.textContent = `Error initializing app: ${error.message}`;
        errorDiv.style.color = 'red';
        errorDiv.style.padding = '20px';
        document.getElementById('app')?.appendChild(errorDiv) || document.body.appendChild(errorDiv);
    }
});
