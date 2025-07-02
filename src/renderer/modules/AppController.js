/**
 * @fileoverview Main App Controller for MCP renderer process
 * Orchestrates UI, API, and Connection management
 */

import { APIService } from './APIService.js';
import { ConnectionManager } from './ConnectionManager.js';

export class AppController {
    constructor(element) {
        this.root = element;
        this.initialized = false;
        
        // Initialize managers
        this.uiManager = window.UIManagerInstance; // Use global instance
        this.apiService = new APIService();
        this.connectionManager = new ConnectionManager(this.apiService);
        
        // Component references
        this.components = {};
        this.dependencies = {};
        this.dependencyPromises = [];
        
        // Log management
        this.currentLogFilter = 'all';
        this.logRefreshInterval = null;
    }

    /**
     * Initialize the application
     */
    async init() {
        if (this.initialized) return;
        
        try {
            window.MonitoringService && window.MonitoringService.info('Initializing MCP Application', { operation: 'app-init' }, 'renderer');
            
            // Show loading state
            this.uiManager.showLoading(this.root, 'Initializing MCP Desktop...');
            
            // Initialize dependencies
            await this.initDependencies();
            
            // Initialize managers
            await this.uiManager.init();
            await this.apiService.init();
            await this.connectionManager.init();
            
            // Initialize authentication state
            await this.initializeAuthState();
            
            // Setup connection listeners
            this.setupConnectionListeners();
            
            // Initial render
            await this.render();
            
            this.initialized = true;
            this.uiManager.hideLoading(this.root);
            
            window.MonitoringService && window.MonitoringService.info('MCP Application initialized successfully', { 
                operation: 'app-init-complete'
            }, 'renderer');
            
        } catch (error) {
            this.uiManager.hideLoading(this.root);
            this.uiManager.showError(this.root, 'Failed to initialize application', () => {
                this.init();
            });
            
            window.MonitoringService && window.MonitoringService.error('Failed to initialize application', {
                error: error.message,
                stack: error.stack,
                operation: 'app-init'
            }, 'renderer');
            
            if (UINotification) {
                UINotification.handleError(error, 'Failed to initialize application', {
                    operation: 'app-init'
                });
            }
            
            throw error;
        }
    }

    /**
     * Initialize dependencies (components)
     */
    async initDependencies() {
        try {
            window.MonitoringService && window.MonitoringService.info('Loading application dependencies', { operation: 'dependency-init' }, 'renderer');
            
            // Check IPC availability
            if (!window.electron?.ipcRenderer) {
                window.MonitoringService && window.MonitoringService.warn('Electron IPC not available. Using console fallbacks for monitoring and error services.', {
                    operation: 'ipc-check'
                }, 'renderer');
            }
            
            window.MonitoringService && window.MonitoringService.info('Dependencies loaded successfully', { 
                operation: 'dependency-init-complete'
            }, 'renderer');
            
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Failed to initialize dependencies', {
                error: error.message,
                stack: error.stack,
                operation: 'dependency-init'
            }, 'renderer');
            throw error;
        }
    }

    /**
     * Initialize authentication state
     */
    async initializeAuthState() {
        try {
            // Check authentication status on app load
            await this.uiManager.refreshAuthenticationState();
            
        } catch (error) {
            console.error('Failed to initialize auth state:', error);
            this.uiManager.showUnauthenticatedState();
        }
    }

    /**
     * Update session status in UI
     */
    async updateSessionStatus() {
        // Removed session status update logic
    }

    /**
     * Setup connection status listeners
     */
    setupConnectionListeners() {
        this.connectionManager.addListener((event, data) => {
            switch (event) {
                case 'status:changed':
                    this.handleStatusChange(data);
                    break;
                case 'status:error':
                    this.handleStatusError(data);
                    break;
                case 'test:completed':
                    this.handleTestCompleted(data);
                    break;
                case 'test:failed':
                    this.handleTestFailed(data);
                    break;
            }
        });
    }

    /**
     * Handle connection status changes
     * @param {Object} status - New status data
     */
    handleStatusChange(status) {
        try {
            window.MonitoringService && window.MonitoringService.info('Connection status changed', {
                status: status,
                summary: this.connectionManager.getConnectionSummary(),
                operation: 'status-change'
            }, 'renderer');
            
            // Trigger UI update
            this.updateStatusDisplay(status);
            
            // Re-render dashboard with new status
            this.renderDashboard();
            
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error handling status change', {
                error: error.message,
                operation: 'status-change-handler'
            }, 'renderer');
        }
    }

    /**
     * Handle connection status errors
     * @param {Error} error - Status error
     */
    handleStatusError(error) {
        window.MonitoringService && window.MonitoringService.error('Connection status error', {
            error: error.message,
            operation: 'status-error'
        }, 'renderer');
        
        if (UINotification) {
            UINotification.showWarning('Connection status update failed');
        }
    }

    /**
     * Handle API test completion
     * @param {Object} data - Test result data
     */
    handleTestCompleted(data) {
        const { api, result } = data;
        
        window.MonitoringService && window.MonitoringService.info('API test completed', {
            api,
            success: result.success,
            operation: 'api-test-complete'
        }, 'renderer');
        
        if (UINotification) {
            if (result.success) {
                UINotification.showSuccess(`${api} API test successful`);
            } else {
                UINotification.showError(`${api} API test failed: ${result.error || 'Unknown error'}`);
            }
        }
    }

    /**
     * Handle API test failures
     * @param {Object} data - Test failure data
     */
    handleTestFailed(data) {
        const { api, result } = data;
        
        window.MonitoringService && window.MonitoringService.error('API test failed', {
            api,
            error: result.error,
            operation: 'api-test-failed'
        }, 'renderer');
        
        if (UINotification) {
            UINotification.showError(`${api} API test failed: ${result.error}`);
        }
    }

    /**
     * Update status display in UI
     * @param {Object} status - Status data
     */
    updateStatusDisplay(status) {
        try {
            const statusElement = document.getElementById('status-indicators');
            if (!statusElement) return;
            
            const summary = this.connectionManager.getConnectionSummary();
            const statusClass = summary.overall === 'healthy' ? 'status-healthy' : 
                               summary.overall === 'warning' ? 'status-warning' : 'status-error';
            
            statusElement.className = `status-indicator ${statusClass}`;
            statusElement.textContent = summary.overall === 'healthy' ? 'Connected' : 
                                      summary.overall === 'warning' ? 'Partial' : 'Disconnected';
            
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error updating status display', {
                error: error.message,
                operation: 'status-display-update'
            }, 'renderer');
        }
    }

    /**
     * Render the application
     */
    async render() {
        try {
            window.MonitoringService && window.MonitoringService.info('Rendering application', { operation: 'app-render' }, 'renderer');
            
            // Wait for dependencies if needed
            if (this.dependencyPromises.length > 0) {
                try {
                    await Promise.all(this.dependencyPromises);
                } catch (error) {
                    window.MonitoringService && window.MonitoringService.error('Error waiting for dependencies', {
                        error: error.message,
                        stack: error.stack,
                        operation: 'dependency-wait'
                    }, 'renderer');
                }
            }
            
            // Render main dashboard
            await this.renderDashboard();
            
            window.MonitoringService && window.MonitoringService.info('Application rendered successfully', { 
                operation: 'app-render-complete'
            }, 'renderer');
            
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Render failed', {
                error: error.message,
                stack: error.stack,
                operation: 'render'
            }, 'renderer');
            
            this.uiManager.showError(this.root, 'Failed to render application', () => {
                this.render();
            });
        }
    }

    /**
     * Render the main dashboard
     */
    async renderDashboard() {
        try {
            const status = this.connectionManager.getStatus();
            
            // Create main dashboard HTML
            const dashboardHTML = this.createDashboardHTML(status);
            
            // Update app container (not main-content, as sidebar should remain)
            const appContainer = document.getElementById('app');
            if (appContainer) {
                appContainer.innerHTML = dashboardHTML;
                
                // Initialize dashboard components
                await this.initializeDashboardComponents();
            }
            
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error rendering dashboard', {
                error: error.message,
                stack: error.stack,
                operation: 'dashboard-render'
            }, 'renderer');
            throw error;
        }
    }

    /**
     * Create dashboard HTML
     * @param {Object} status - Current status
     * @returns {string} Dashboard HTML
     */
    createDashboardHTML(status) {
        // Debug log the status to see what we're getting
        window.MonitoringService && window.MonitoringService.info('Dashboard status data', { 
            status: status,
            operation: 'dashboard-render'
        }, 'renderer');
        
        // More flexible status checking - ensure we handle string and boolean values
        const msGraphGreen = status?.msGraph === 'green' || status?.msGraph === true;
        const llmGreen = status?.llm === 'green' || status?.llm === true;
        
        const msGraphStatus = msGraphGreen ? 'active' : '';
        const llmStatus = llmGreen ? 'active' : '';
        
        // Log individual status checks for debugging
        window.MonitoringService && window.MonitoringService.info('Status checks', { 
            msGraph: status?.msGraph,
            llm: status?.llm,
            msGraphGreen,
            llmGreen,
            operation: 'status-check'
        }, 'renderer');
        
        return `
            <!-- System Status Card -->
            <div class="card">
                <div class="card-header">
                    <h3 class="card-title">System Status</h3>
                </div>
                <div class="card-body">
                    <div class="status-indicators">
                        <div class="status-indicator">
                            <span class="status-dot ${msGraphStatus}"></span>
                            <span>Microsoft Graph API</span>
                        </div>
                        <div class="status-indicator">
                            <span class="status-dot ${llmStatus}"></span>
                            <span>LLM API</span>
                        </div>
                    </div>
                    <div class="system-status mt-4">
                        <span class="status-indicator">
                            <span class="status-dot active"></span>
                            <span>System Online</span>
                        </span>
                    </div>
                </div>
            </div>

            <!-- Error Logs Card (initially hidden) -->
            <div class="card error-card" id="error-logs-card" style="display: none;">
                <div class="card-header error-header">
                    <div class="card-header-top">
                        <h3 class="card-title">Error Logs</h3>
                        <div class="card-controls">
                            <button id="clear-errors-btn" class="action-btn">Clear</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div id="error-logs" class="error-logs">
                        <p>No errors to display</p>
                    </div>
                </div>
            </div>

            <!-- Recent Activity Card -->
            <div class="card">
                <div class="card-header">
                    <div class="card-header-top">
                        <h3 class="card-title">Recent Activity</h3>
                        <div class="card-controls">
                            <div class="log-scope-selector">
                                <label class="radio-label">
                                    <input type="radio" name="log-scope" value="user" checked>
                                    <span>User Logs</span>
                                </label>
                                <label class="radio-label">
                                    <input type="radio" name="log-scope" value="global">
                                    <span>Global Logs</span>
                                </label>
                            </div>
                            <label class="toggle-switch">
                                <input type="checkbox" id="auto-refresh-toggle" checked>
                                <span class="toggle-slider"></span>
                                <span class="toggle-label">Auto-refresh</span>
                            </label>
                            <button id="clear-logs-btn" class="action-btn">Clear</button>
                        </div>
                    </div>
                </div>
                <div class="card-body">
                    <div id="recent-logs" class="recent-logs">
                        <p>Loading recent activity...</p>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Initialize dashboard components
     */
    async initializeDashboardComponents() {
        try {
            // Setup log auto-refresh toggle
            const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
            if (autoRefreshToggle) {
                autoRefreshToggle.addEventListener('change', () => {
                    this.handleAutoRefreshToggle(autoRefreshToggle.checked);
                    
                    // Initialize auto-refresh if checked
                    if (autoRefreshToggle.checked) {
                        this.startLogAutoRefresh();
                    }
                });
                
                // Initialize auto-refresh if checked
                if (autoRefreshToggle.checked) {
                    this.startLogAutoRefresh();
                }
            }
            
            // Setup log scope selector
            const logScopeSelectors = document.querySelectorAll('input[name="log-scope"]');
            if (logScopeSelectors.length > 0) {
                logScopeSelectors.forEach(radio => {
                    radio.addEventListener('change', () => {
                        // When scope changes, fetch logs with the new scope
                        const scope = radio.value;
                        this.fetchRecentLogs(true, scope, false);
                        
                        // Log the scope change
                        window.MonitoringService && window.MonitoringService.info('Log scope changed', {
                            scope: scope,
                            operation: 'log-scope-change'
                        }, 'renderer');
                    });
                });
            }
            
            // Setup clear buttons
            const clearLogsBtn = document.getElementById('clear-logs-btn');
            if (clearLogsBtn) {
                clearLogsBtn.addEventListener('click', () => {
                    // Get the currently selected scope
                    const scopeSelector = document.querySelector('input[name="log-scope"]:checked');
                    const scope = scopeSelector ? scopeSelector.value : 'user';
                    this.clearLogs(scope);
                });
            }
            
            const clearErrorsBtn = document.getElementById('clear-errors-btn');
            if (clearErrorsBtn) {
                clearErrorsBtn.addEventListener('click', () => {
                    this.clearErrorLogs();
                });
            }
            
            // Fetch and display initial logs
            this.fetchRecentLogs(true, 'user');
            
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error initializing dashboard components', {
                error: error.message,
                operation: 'dashboard-components-init'
            }, 'renderer');
        }
    }

    /**
     * Handle auto-refresh toggle
     * @param {boolean} enabled - Whether auto-refresh is enabled
     */
    handleAutoRefreshToggle(enabled) {
        if (enabled) {
            this.startLogAutoRefresh();
        } else {
            this.stopLogAutoRefresh();
        }
    }

    /**
     * Start auto-refreshing logs
     */
    startLogAutoRefresh() {
        // Clear any existing interval
        if (this.logRefreshInterval) {
            clearInterval(this.logRefreshInterval);
        }
        
        // Set up auto-refresh interval
        this.logRefreshInterval = setInterval(() => {
            // Get the currently selected scope from the UI
            const scopeSelector = document.querySelector('input[name="log-scope"]:checked');
            const currentScope = scopeSelector ? scopeSelector.value : 'user';
            
            // Fetch logs with the current scope, preserving existing logs
            this.fetchRecentLogs(false, currentScope, true); // Don't clear existing logs during auto-refresh
        }, 10000); // Refresh every 10 seconds
        
        // Update UI to show auto-refresh is on
        const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
        if (autoRefreshToggle) {
            autoRefreshToggle.checked = true;
        }
        
        // Log the auto-refresh start
        window.MonitoringService && window.MonitoringService.info('Started log auto-refresh', {
            interval: '10s',
            operation: 'auto-refresh-start'
        }, 'renderer');
    }

    /**
     * Stop auto-refresh for logs
     */
    stopLogAutoRefresh() {
        if (this.logRefreshInterval) {
            clearInterval(this.logRefreshInterval);
            this.logRefreshInterval = null;
        }
    }

    /**
     * Handle log filter changes
     * @param {string} filter - Filter type ('all', 'mail', 'calendar', 'files')
     */
    handleLogFilter(filter) {
        this.currentLogFilter = filter;
        this.fetchRecentLogs(true, 'user'); // Default to user scope when manually filtering
    }

    /**
     * Fetch recent logs and display them
     * @param {boolean} clearExisting - Whether to clear existing logs
     * @param {string} [scope='user'] - Whether to fetch 'user' or 'global' logs
     * @param {boolean} [isAutoRefresh=false] - Whether this is an auto-refresh call
     */
    async fetchRecentLogs(clearExisting = true, scope = 'user', isAutoRefresh = false) {
        try {
            // Get the currently selected scope if not explicitly provided
            if (!scope && !isAutoRefresh) {
                const scopeSelector = document.querySelector('input[name="log-scope"]:checked');
                scope = scopeSelector ? scopeSelector.value : 'user';
            }
            
            // Update the radio button selection to match the scope
            if (!isAutoRefresh) {
                const scopeRadio = document.querySelector(`input[name="log-scope"][value="${scope}"]`);
                if (scopeRadio) {
                    scopeRadio.checked = true;
                }
            }
            
            const options = {
                limit: 50,
                category: this.currentLogFilter !== 'all' ? this.currentLogFilter : undefined,
                scope: scope, // 'user' or 'global'
                autoRefresh: isAutoRefresh // Add header flag for auto-refresh requests
            };
            
            const logsResponse = await this.apiService.fetchLogs(options);
            
            // Debug log the response only if not an auto-refresh to prevent log spam
            if (!isAutoRefresh && window.MonitoringService) {
                try {
                    // Use info instead of debug if debug is not available
                    const logMethod = typeof window.MonitoringService.debug === 'function' ? 
                        window.MonitoringService.debug : 
                        (typeof window.MonitoringService.info === 'function' ? 
                            window.MonitoringService.info : null);
                    
                    if (logMethod) {
                        logMethod.call(window.MonitoringService, 'Logs response data', { 
                            logCount: Array.isArray(logsResponse) ? logsResponse.length : 0,
                            isArray: Array.isArray(logsResponse),
                            scope: scope,
                            operation: 'log-fetch-debug'
                        }, 'renderer');
                    }
                } catch (logError) {
                    console.log('Error logging to MonitoringService:', logError);
                }
            }
            
            // Handle different response formats
            let logs;
            if (Array.isArray(logsResponse)) {
                logs = logsResponse;
            } else if (logsResponse && Array.isArray(logsResponse.logs)) {
                logs = logsResponse.logs;
            } else if (logsResponse && Array.isArray(logsResponse.data)) {
                logs = logsResponse.data;
            } else {
                // If it's not an array, create an empty array
                logs = [];
                window.MonitoringService && window.MonitoringService.warn('Logs response is not an array', { 
                    operation: 'log-fetch-warning',
                    scope: scope
                }, 'renderer');
            }
            
            // Update the log scope indicator in the UI
            let scopeIndicator = document.querySelector('.log-scope-indicator');
            
            // If the indicator doesn't exist, create it
            if (!scopeIndicator) {
                const cardHeader = document.querySelector('.card-header-top');
                if (cardHeader) {
                    scopeIndicator = document.createElement('span');
                    scopeIndicator.className = `log-scope-indicator ${scope}-scope`;
                    cardHeader.appendChild(scopeIndicator);
                }
            }
            
            // Update the indicator text and class
            if (scopeIndicator) {
                scopeIndicator.textContent = `Showing ${scope} logs`;
                scopeIndicator.className = `log-scope-indicator ${scope}-scope`;
            }
            
            this.displayLogs(logs, clearExisting);
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error fetching logs', {
                error: error.message,
                operation: 'log-fetch',
                scope: scope
            }, 'renderer');
            
            // Only update UI with error if it wasn't an auto-refresh request
            if (!isAutoRefresh) {
                const logsContainer = document.getElementById('recent-logs');
                if (logsContainer) {
                    logsContainer.innerHTML = '<p class="error">Error loading logs: ' + error.message + '</p>';
                }
            }
        }
    }

    /**
     * Display logs in the UI with simple chronological listing and text search
     * @param {Array} logs - Log entries
     * @param {boolean} clearExisting - Whether to clear existing logs
     */
    displayLogs(logs, clearExisting = true) {
        const logsContainer = document.getElementById('recent-logs');
        if (!logsContainer) return;

        // Initialize logs array if not provided
        logs = logs || [];
        
        // If we're clearing existing logs and there are no new logs, show empty message
        if (logs.length === 0 && clearExisting) {
            logsContainer.innerHTML = '<p>No recent activity to display</p>';
            return;
        }

        // Get existing logs if not clearing
        let allLogs = [];
        if (!clearExisting) {
            // Extract existing logs from the current display
            const existingEntries = logsContainer.querySelectorAll('.simple-log-entry');
            existingEntries.forEach(entry => {
                const timestamp = entry.querySelector('.log-timestamp')?.textContent;
                const level = entry.getAttribute('data-level');
                const category = entry.getAttribute('data-category');
                const message = entry.querySelector('.log-message')?.textContent;
                const userId = entry.getAttribute('data-user-id') || '';
                const deviceId = entry.getAttribute('data-device-id') || '';
                
                if (timestamp && level && message) {
                    allLogs.push({
                        timestamp: new Date(timestamp).toISOString(),
                        level,
                        category: category || 'general',
                        message,
                        userId,
                        deviceId,
                        id: `existing-${timestamp}-${level}`
                    });
                }
            });
        }

        // Add new logs and deduplicate by timestamp + message
        const newLogs = logs.filter(log => {
            const logKey = `${log.timestamp}-${log.message}`;
            return !allLogs.some(existing => `${existing.timestamp}-${existing.message}` === logKey);
        });
        
        allLogs = [...allLogs, ...newLogs];

        // Sort all logs by timestamp (newest first)
        const sortedLogs = allLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Limit to last 100 logs to prevent memory issues
        const limitedLogs = sortedLogs.slice(0, 100);
        
        // Count logs by level for stats
        const stats = {
            error: limitedLogs.filter(log => log.level === 'error').length,
            warn: limitedLogs.filter(log => log.level === 'warn').length,
            info: limitedLogs.filter(log => log.level === 'info').length,
            debug: limitedLogs.filter(log => log.level === 'debug').length
        };
        
        // Build simple log interface with search
        let logsHtml = `
            <div class="log-viewer-controls">
                <div class="log-stats">
                    <span class="stat-badge error">${stats.error} Errors</span>
                    <span class="stat-badge warn">${stats.warn} Warnings</span>
                    <span class="stat-badge info">${stats.info} Info</span>
                    <span class="stat-badge debug">${stats.debug} Debug</span>
                    <span class="stat-badge total">${limitedLogs.length} Total</span>
                </div>
                <div class="log-search">
                    <input type="text" id="log-search-input" placeholder="Search logs (e.g., 'tentativelyAccepted', 'error', 'calendar')..." class="search-input">
                    <button id="clear-search-btn" class="clear-search-btn" title="Clear search">×</button>
                </div>
            </div>
            <div class="simple-log-list" id="simple-log-list">
        `;

        // Display all logs in simple chronological order
        limitedLogs.forEach((log, index) => {
            const timestamp = new Date(log.timestamp).toLocaleString();
            const level = log.level || 'info';
            const category = log.category || 'general';
            const message = log.message || '';
            const context = log.context ? JSON.stringify(log.context, null, 2) : '';
            
            // Extract user context information if available
            const userId = log.userId || (log.context && log.context.userId) || '';
            const deviceId = log.deviceId || (log.context && log.context.deviceId) || '';
            const userBadge = userId ? `<span class="user-badge" title="User ID: ${userId}">${userId.slice(0, 8)}</span>` : '';
            const deviceBadge = deviceId ? `<span class="device-badge" title="Device ID: ${deviceId}">${deviceId.slice(0, 8)}</span>` : '';
            
            // Create searchable text content for filtering
            const searchableContent = `${timestamp} ${level} ${category} ${message} ${context} ${userId} ${deviceId}`.toLowerCase();
            
            logsHtml += `
                <div class="simple-log-entry" data-level="${level}" data-category="${category}" data-search="${searchableContent}" data-index="${index}" data-user-id="${userId}" data-device-id="${deviceId}">
                    <div class="log-header">
                        <span class="log-timestamp">${timestamp}</span>
                        <span class="log-level level-${level}">${level.toUpperCase()}</span>
                        <span class="log-category">${category}</span>
                        ${userBadge}
                        ${deviceBadge}
                        ${log.id ? `<span class="log-id">${log.id.slice(0, 8)}</span>` : ''}
                    </div>
                    <div class="log-message">${message}</div>
                    ${context ? `
                        <div class="log-context-container">
                            <button class="context-toggle-btn" data-index="${index}">Show Context</button>
                            <pre class="log-context" id="context-${index}" style="display: none;">${context}</pre>
                        </div>
                    ` : ''}
                </div>
            `;
        });

        logsHtml += `
            </div>
            <style>
                .user-badge, .device-badge {
                    display: inline-block;
                    padding: 2px 5px;
                    border-radius: 3px;
                    font-size: 11px;
                    margin-right: 5px;
                    cursor: default;
                }
                .user-badge {
                    background-color: #e6f7ff;
                    color: #0070c0;
                    border: 1px solid #91d5ff;
                }
                .device-badge {
                    background-color: #f6ffed;
                    color: #52c41a;
                    border: 1px solid #b7eb8f;
                }
                .log-scope-selector {
                    display: flex;
                    align-items: center;
                    margin-right: 15px;
                }
                .radio-label {
                    display: flex;
                    align-items: center;
                    margin-right: 10px;
                    font-size: 12px;
                    cursor: pointer;
                }
                .radio-label input {
                    margin-right: 4px;
                }
                .log-scope-indicator {
                    font-size: 0.8em;
                    color: #6c757d;
                    margin-left: 10px;
                    padding: 2px 6px;
                    border-radius: 10px;
                }
                .user-scope {
                    background-color: rgba(0, 123, 255, 0.1);
                }
                .global-scope {
                    background-color: rgba(108, 117, 125, 0.1);
                }
            </style>
        `;

        // Update container with new HTML
        logsContainer.innerHTML = logsHtml;
        
        // Setup simple event listeners
        this.setupSimpleLogViewerEventListeners();
    }

    /**
     * Setup simple event listeners for the log viewer interface
     */
    setupSimpleLogViewerEventListeners() {
        // Search input
        const searchInput = document.getElementById('log-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                const searchQuery = e.target.value.toLowerCase();
                const logEntries = document.querySelectorAll('.simple-log-entry');
                
                logEntries.forEach((entry) => {
                    const searchableContent = entry.getAttribute('data-search');
                    if (searchableContent.includes(searchQuery)) {
                        entry.style.display = 'block';
                    } else {
                        entry.style.display = 'none';
                    }
                });
            });
        }
        
        // Clear search button
        const clearSearchBtn = document.getElementById('clear-search-btn');
        if (clearSearchBtn) {
            clearSearchBtn.addEventListener('click', () => {
                const searchInput = document.getElementById('log-search-input');
                if (searchInput) {
                    searchInput.value = '';
                    searchInput.dispatchEvent(new Event('input'));
                }
            });
        }
        
        // Context toggles
        document.querySelectorAll('.context-toggle-btn').forEach(button => {
            button.addEventListener('click', (e) => {
                const logEntry = e.target.closest('.simple-log-entry');
                const context = logEntry.querySelector('.log-context');
                
                if (context.style.display === 'none') {
                    context.style.display = 'block';
                    e.target.textContent = 'Hide Context';
                } else {
                    context.style.display = 'none';
                    e.target.textContent = 'Show Context';
                }
            });
        });
    }

    /**
     * Clear logs
     * @param {string} [scope='user'] - Whether to clear 'user' or 'global' logs
     */
    async clearLogs(scope = 'user') {
        try {
            // Get the currently selected scope if not provided
            if (!scope) {
                const scopeSelector = document.querySelector('input[name="log-scope"]:checked');
                scope = scopeSelector ? scopeSelector.value : 'user';
            }
            
            await this.apiService.clearLogs({ scope });
            const logsContainer = document.getElementById('recent-logs');
            if (logsContainer) {
                logsContainer.innerHTML = '<p>No recent activity to display</p>';
            }
            
            window.MonitoringService && window.MonitoringService.info('Logs cleared', {
                scope: scope,
                operation: 'log-clear'
            }, 'renderer');
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error clearing logs', {
                error: error.message,
                operation: 'log-clear',
                scope: scope
            }, 'renderer');
        }
    }

    /**
     * Clear error logs
     */
    clearErrorLogs() {
        const errorLogsContainer = document.getElementById('error-logs');
        const errorLogsCard = document.getElementById('error-logs-card');
        
        if (errorLogsContainer) {
            errorLogsContainer.innerHTML = '<p>No errors to display</p>';
        }
        if (errorLogsCard) {
            errorLogsCard.style.display = 'none';
        }
    }

    /**
     * Cleanup application resources
     */
    destroy() {
        try {
            // Stop auto-refresh
            this.stopLogAutoRefresh();
            
            // Cleanup managers
            this.connectionManager.destroy();
            this.apiService.destroy();
            this.uiManager.destroy();
            
            // Cleanup components
            Object.values(this.components).forEach(component => {
                if (component && typeof component.destroy === 'function') {
                    component.destroy();
                }
            });
            
            this.initialized = false;
            window.MonitoringService && window.MonitoringService.info('Application destroyed', { operation: 'app-cleanup' }, 'renderer');
            
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error during application cleanup', {
                error: error.message,
                operation: 'app-cleanup'
            }, 'renderer');
        }
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.AppController = AppController;
}

// Export the controller
export default AppController;