/**
 * @fileoverview Main App Controller for MCP renderer process
 * Orchestrates UI, API, and Connection management
 */

import { UIManager } from './UIManager.js';
import { APIService } from './APIService.js';
import { ConnectionManager } from './ConnectionManager.js';

export class AppController {
    constructor(element) {
        this.root = element;
        this.initialized = false;
        
        // Initialize managers
        this.uiManager = new UIManager();
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
            
            // Load check-connections functionality
            try {
                const checkConnections = await import('../check-connections.js');
                this.dependencies.checkConnections = checkConnections;
            } catch (err) {
                window.MonitoringService && window.MonitoringService.error('Failed to load check-connections.js', {
                    error: err.message,
                    operation: 'dependency-load'
                }, 'renderer');
            }
            
            // Load LogViewer component
            try {
                const LogViewer = await import('../components/LogViewer.js');
                this.dependencies.LogViewer = LogViewer.default || LogViewer;
            } catch (err) {
                window.MonitoringService && window.MonitoringService.error('Failed to load LogViewer.js', {
                    error: err.message,
                    operation: 'dependency-load'
                }, 'renderer');
            }
            
            // Check IPC availability
            if (!window.electron?.ipcRenderer) {
                window.MonitoringService && window.MonitoringService.warn('Electron IPC not available. Using console fallbacks for monitoring and error services.', {
                    operation: 'ipc-check'
                }, 'renderer');
            }
            
            window.MonitoringService && window.MonitoringService.info('Dependencies loaded successfully', { 
                loadedCount: Object.keys(this.dependencies).length,
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
                    <div class="login-section mt-4">
                        <button id="login-button" class="btn btn-primary">Login with Microsoft</button>
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
                            <label class="toggle-switch">
                                <input type="checkbox" id="auto-refresh-toggle" checked>
                                <span class="toggle-slider"></span>
                                <span class="toggle-label">Auto-refresh</span>
                            </label>
                            <button id="clear-logs-btn" class="action-btn">Clear</button>
                        </div>
                    </div>
                    <div class="activity-filters">
                        <button class="filter-btn active" data-filter="all">All</button>
                        <button class="filter-btn" data-filter="mail">Mail</button>
                        <button class="filter-btn" data-filter="calendar">Calendar</button>
                        <button class="filter-btn" data-filter="files">Files</button>
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
            // Setup login button
            const loginButton = document.getElementById('login-button');
            if (loginButton) {
                loginButton.addEventListener('click', () => {
                    // Redirect to login page using GET
                    window.location.href = '/api/auth/login';
                });
            }
            
            // Setup auto-refresh toggle
            const autoRefreshToggle = document.getElementById('auto-refresh-toggle');
            if (autoRefreshToggle) {
                autoRefreshToggle.addEventListener('change', () => {
                    // Implement auto-refresh logic for logs
                    this.handleAutoRefreshToggle(autoRefreshToggle.checked);
                });
            }
            
            // Setup filter buttons
            document.querySelectorAll('.filter-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    // Update active state
                    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
                    btn.classList.add('active');
                    
                    const filter = btn.dataset.filter;
                    this.handleLogFilter(filter);
                });
            });
            
            // Setup clear buttons
            const clearLogsBtn = document.getElementById('clear-logs-btn');
            if (clearLogsBtn) {
                clearLogsBtn.addEventListener('click', () => {
                    this.clearLogs();
                });
            }
            
            const clearErrorsBtn = document.getElementById('clear-errors-btn');
            if (clearErrorsBtn) {
                clearErrorsBtn.addEventListener('click', () => {
                    this.clearErrorLogs();
                });
            }
            
            // Fetch and display initial logs
            this.fetchRecentLogs();
            
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
     * Start auto-refresh for logs
     */
    startLogAutoRefresh() {
        if (this.logRefreshInterval) {
            clearInterval(this.logRefreshInterval);
        }
        
        this.logRefreshInterval = setInterval(() => {
            this.fetchRecentLogs(false); // Don't clear existing logs
        }, 10000); // Refresh every 10 seconds
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
        // Apply filtering to logs
        this.currentLogFilter = filter;
        this.fetchRecentLogs(true);
    }

    /**
     * Fetch recent logs and display them
     * @param {boolean} clearExisting - Whether to clear existing logs
     */
    async fetchRecentLogs(clearExisting = true) {
        try {
            const options = {
                limit: 50,
                category: this.currentLogFilter !== 'all' ? this.currentLogFilter : undefined
            };
            
            const logsResponse = await this.apiService.fetchLogs(options);
            
            // Debug log the response to see what we're getting
            window.MonitoringService && window.MonitoringService.info('Logs response data', { 
                logsResponse: logsResponse,
                type: typeof logsResponse,
                isArray: Array.isArray(logsResponse),
                operation: 'log-fetch-debug'
            }, 'renderer');
            
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
                    logsResponse: logsResponse,
                    operation: 'log-fetch-warning'
                }, 'renderer');
            }
            
            this.displayLogs(logs, clearExisting);
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error fetching logs', {
                error: error.message,
                operation: 'log-fetch'
            }, 'renderer');
            
            const logsContainer = document.getElementById('recent-logs');
            if (logsContainer) {
                logsContainer.innerHTML = '<p class="error">Error loading logs: ' + error.message + '</p>';
            }
        }
    }

    /**
     * Display logs in the UI with modern formatting and grouping
     * @param {Array} logs - Log entries
     * @param {boolean} clearExisting - Whether to clear existing logs
     */
    displayLogs(logs, clearExisting = true) {
        const logsContainer = document.getElementById('recent-logs');
        if (!logsContainer) return;

        if (!logs || logs.length === 0) {
            logsContainer.innerHTML = '<p>No recent activity to display</p>';
            return;
        }

        // Sort logs by timestamp (newest first) and group by level and category
        const sortedLogs = logs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        const groupedLogs = this.groupLogsByLevelAndCategory(sortedLogs);
        
        // Build modern log interface
        let logsHtml = `
            <div class="log-viewer-controls">
                <div class="log-stats">
                    <span class="stat-badge error">${groupedLogs.stats.error} Errors</span>
                    <span class="stat-badge warn">${groupedLogs.stats.warn} Warnings</span>
                    <span class="stat-badge info">${groupedLogs.stats.info} Info</span>
                    <span class="stat-badge debug">${groupedLogs.stats.debug} Debug</span>
                </div>
                <div class="log-filters">
                    <button class="filter-toggle active" data-level="all">All</button>
                    <button class="filter-toggle" data-level="error">Errors</button>
                    <button class="filter-toggle" data-level="warn">Warnings</button>
                    <button class="filter-toggle" data-level="info">Info</button>
                    <button class="filter-toggle" data-level="debug">Debug</button>
                </div>
            </div>
            <div class="log-groups">
        `;

        // Display grouped logs
        Object.entries(groupedLogs.groups).forEach(([level, categories]) => {
            if (Object.keys(categories).length === 0) return;
            
            logsHtml += `
                <div class="log-level-group" data-level="${level}">
                    <div class="log-level-header">
                        <h4 class="level-title level-${level}">
                            <span class="level-indicator"></span>
                            ${level.toUpperCase()} (${groupedLogs.stats[level]})
                        </h4>
                        <button class="collapse-toggle" data-target="${level}">−</button>
                    </div>
                    <div class="log-categories" id="categories-${level}">
            `;

            Object.entries(categories).forEach(([category, logEntries]) => {
                const categoryType = this.getCategoryType(category);
                const recentLogs = logEntries.slice(0, 5); // Show only 5 most recent per category
                
                logsHtml += `
                    <div class="log-category-group" data-category="${category}">
                        <div class="category-header">
                            <span class="category-icon ${categoryType}"></span>
                            <span class="category-name">${category}</span>
                            <span class="category-count">${logEntries.length}</span>
                            ${logEntries.length > 5 ? `<button class="show-more" data-category="${category}" data-level="${level}">+${logEntries.length - 5} more</button>` : ''}
                        </div>
                        <div class="log-entries">
                `;

                recentLogs.forEach(log => {
                    const timestamp = new Date(log.timestamp).toLocaleTimeString();
                    const message = this.truncateMessage(log.message || '', 100);
                    const context = log.context ? JSON.stringify(log.context, null, 2) : '';
                    
                    logsHtml += `
                        <div class="log-entry" data-log-id="${log.id}" title="${log.message}">
                            <div class="log-meta">
                                <span class="log-time">${timestamp}</span>
                                ${log.id ? `<span class="log-id">${log.id.slice(0, 8)}</span>` : ''}
                            </div>
                            <div class="log-content">
                                <div class="log-message">${message}</div>
                                ${context ? `<div class="log-context" style="display: none;">${context}</div>` : ''}
                            </div>
                            ${context ? '<button class="context-toggle" title="Show/hide context">⋯</button>' : ''}
                        </div>
                    `;
                });

                logsHtml += `
                        </div>
                    </div>
                `;
            });

            logsHtml += `
                    </div>
                </div>
            `;
        });

        logsHtml += '</div>';
        logsContainer.innerHTML = logsHtml;
        
        // Setup event listeners for the new interface
        this.setupLogViewerEventListeners();
    }

    /**
     * Group logs by level and category for better organization
     */
    groupLogsByLevelAndCategory(logs) {
        const groups = {
            error: {},
            warn: {},
            info: {},
            debug: {}
        };
        
        const stats = {
            error: 0,
            warn: 0,
            info: 0,
            debug: 0
        };

        logs.forEach(log => {
            const level = log.level || log.severity || 'info';
            const category = log.category || 'system';
            
            if (!groups[level]) groups[level] = {};
            if (!groups[level][category]) groups[level][category] = [];
            
            groups[level][category].push(log);
            stats[level]++;
        });

        return { groups, stats };
    }

    /**
     * Determine category type for styling
     */
    getCategoryType(category) {
        const categoryMap = {
            'core': 'core-service',
            'auth': 'core-service',
            'storage': 'core-service',
            'monitoring': 'core-service',
            'error': 'core-service',
            'events': 'core-service',
            'cache': 'core-service',
            'tools': 'core-service',
            
            'api': 'controller',
            'routes': 'controller',
            'controller': 'controller',
            'middleware': 'controller',
            
            'mail': 'module',
            'calendar': 'module',
            'files': 'module',
            'people': 'module',
            'modules': 'module',
            
            'graph': 'service',
            'llm': 'service',
            'msal': 'service',
            
            'system': 'system',
            'electron': 'system',
            'main': 'system',
            'renderer': 'system',
            'ipc': 'system'
        };
        
        const lowerCategory = category.toLowerCase();
        return categoryMap[lowerCategory] || 'system';
    }

    /**
     * Truncate long messages for display
     */
    truncateMessage(message, maxLength) {
        if (!message) return '';
        if (message.length <= maxLength) return message;
        return message.substring(0, maxLength) + '...';
    }

    /**
     * Setup event listeners for the log viewer interface
     */
    setupLogViewerEventListeners() {
        // Level filter toggles
        document.querySelectorAll('.filter-toggle').forEach(button => {
            button.addEventListener('click', (e) => {
                const level = e.target.dataset.level;
                
                // Update active state
                document.querySelectorAll('.filter-toggle').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                
                // Show/hide log groups
                document.querySelectorAll('.log-level-group').forEach(group => {
                    if (level === 'all' || group.dataset.level === level) {
                        group.style.display = 'block';
                    } else {
                        group.style.display = 'none';
                    }
                });
            });
        });

        // Collapse toggles
        document.querySelectorAll('.collapse-toggle').forEach(button => {
            button.addEventListener('click', (e) => {
                const target = e.target.dataset.target;
                const categories = document.getElementById(`categories-${target}`);
                
                if (categories.style.display === 'none') {
                    categories.style.display = 'block';
                    e.target.textContent = '−';
                } else {
                    categories.style.display = 'none';
                    e.target.textContent = '+';
                }
            });
        });

        // Context toggles
        document.querySelectorAll('.context-toggle').forEach(button => {
            button.addEventListener('click', (e) => {
                const logEntry = e.target.closest('.log-entry');
                const context = logEntry.querySelector('.log-context');
                
                if (context.style.display === 'none') {
                    context.style.display = 'block';
                    e.target.textContent = '−';
                } else {
                    context.style.display = 'none';
                    e.target.textContent = '⋯';
                }
            });
        });

        // Show more buttons
        document.querySelectorAll('.show-more').forEach(button => {
            button.addEventListener('click', (e) => {
                const category = e.target.dataset.category;
                const level = e.target.dataset.level;
                // TODO: Implement show more functionality
                console.log(`Show more logs for ${category} at ${level} level`);
            });
        });
    }

    /**
     * Clear logs
     */
    async clearLogs() {
        try {
            await this.apiService.clearLogs();
            const logsContainer = document.getElementById('recent-logs');
            if (logsContainer) {
                logsContainer.innerHTML = '<p>No recent activity to display</p>';
            }
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Error clearing logs', {
                error: error.message,
                operation: 'log-clear'
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