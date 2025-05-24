/**
 * @fileoverview Connection Manager for MCP renderer process
 * Handles connection status monitoring and testing
 */

export class ConnectionManager {
    constructor(apiService) {
        this.apiService = apiService;
        this.status = null;
        this.listeners = new Set();
        this.refreshInterval = null;
        this.refreshRate = 60000; // 60 seconds to reduce memory usage
        this.initialized = false;
    }

    /**
     * Initialize Connection Manager
     */
    async init() {
        if (this.initialized) return;
        
        try {
            window.MonitoringService && window.MonitoringService.info('Initializing Connection Manager', { operation: 'connection-init' }, 'renderer');
            
            // Initial status fetch (non-blocking)
            try {
                await this.refreshStatus();
            } catch (error) {
                window.MonitoringService && window.MonitoringService.warn('Initial status fetch failed, will retry periodically', {
                    error: error.message,
                    operation: 'initial-status-fetch'
                }, 'renderer');
                // Don't fail initialization if initial status fetch fails
            }
            
            // Start periodic refresh
            this.startPeriodicRefresh();
            
            this.initialized = true;
            window.MonitoringService && window.MonitoringService.info('Connection Manager initialized successfully', { 
                refreshRate: this.refreshRate,
                operation: 'connection-init-complete'
            }, 'renderer');
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Failed to initialize Connection Manager', {
                error: error.message,
                stack: error.stack,
                operation: 'connection-init'
            }, 'renderer');
            throw error;
        }
    }

    /**
     * Start periodic status refresh
     */
    startPeriodicRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
        }
        
        this.refreshInterval = setInterval(async () => {
            try {
                await this.refreshStatus();
            } catch (error) {
                window.MonitoringService && window.MonitoringService.error('Error in periodic status refresh', {
                    error: error.message,
                    operation: 'status-refresh-periodic'
                }, 'renderer');
            }
        }, this.refreshRate);
        
        window.MonitoringService && window.MonitoringService.info('Started periodic status refresh', { 
            interval: this.refreshRate,
            operation: 'status-refresh-start'
        }, 'renderer');
    }

    /**
     * Stop periodic status refresh
     */
    stopPeriodicRefresh() {
        if (this.refreshInterval) {
            clearInterval(this.refreshInterval);
            this.refreshInterval = null;
            window.MonitoringService && window.MonitoringService.info('Stopped periodic status refresh', { operation: 'status-refresh-stop' }, 'renderer');
        }
    }

    /**
     * Refresh connection status
     */
    async refreshStatus() {
        try {
            const oldStatus = this.status;
            this.status = await this.apiService.fetchStatus();
            
            // Check if status changed
            const statusChanged = !oldStatus || 
                JSON.stringify(oldStatus) !== JSON.stringify(this.status);
            
            if (statusChanged) {
                window.MonitoringService && window.MonitoringService.info('Connection status updated', {
                    status: this.getConnectionSummary(),
                    operation: 'status-update'
                }, 'renderer');
                
                this.notifyListeners('status:changed', this.status);
            }
            
            return this.status;
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('Failed to refresh status', {
                error: error.message,
                operation: 'status-refresh'
            }, 'renderer');
            
            // Set error status
            this.status = {
                error: true,
                message: error.message,
                timestamp: new Date().toISOString()
            };
            
            this.notifyListeners('status:error', error);
            throw error;
        }
    }

    /**
     * Test specific API connection
     * @param {string} api - API to test ('mail', 'calendar', 'files')
     * @returns {Promise<Object>} Test result
     */
    async testConnection(api) {
        try {
            window.MonitoringService && window.MonitoringService.info('Testing API connection', { api, operation: 'connection-test' }, 'renderer');
            
            const result = await this.apiService.testAPI(api);
            
            window.MonitoringService && window.MonitoringService.info('API connection test completed', {
                api,
                success: result.success,
                operation: 'connection-test-complete'
            }, 'renderer');
            
            // Notify listeners about test result
            this.notifyListeners('test:completed', { api, result });
            
            return result;
        } catch (error) {
            window.MonitoringService && window.MonitoringService.error('API connection test failed', {
                api,
                error: error.message,
                operation: 'connection-test'
            }, 'renderer');
            
            const result = {
                success: false,
                error: error.message,
                timestamp: new Date().toISOString()
            };
            
            this.notifyListeners('test:failed', { api, result });
            return result;
        }
    }

    /**
     * Get current connection status
     * @returns {Object|null} Current status
     */
    getStatus() {
        return this.status;
    }

    /**
     * Get connection summary
     * @returns {Object} Summary of connections
     */
    getConnectionSummary() {
        if (!this.status) {
            return { overall: 'unknown', services: {} };
        }
        
        if (this.status.error) {
            return { overall: 'error', message: this.status.message };
        }
        
        const services = this.status.services || {};
        const summary = {
            overall: 'healthy',
            services: {}
        };
        
        Object.entries(services).forEach(([service, data]) => {
            summary.services[service] = {
                status: data.connected ? 'connected' : 'disconnected',
                authenticated: data.authenticated || false
            };
            
            if (!data.connected || !data.authenticated) {
                summary.overall = 'warning';
            }
        });
        
        return summary;
    }

    /**
     * Check if specific service is connected
     * @param {string} service - Service name ('mail', 'calendar', 'files')
     * @returns {boolean} Whether service is connected
     */
    isServiceConnected(service) {
        if (!this.status || this.status.error) return false;
        
        const serviceData = this.status.services?.[service];
        return serviceData?.connected && serviceData?.authenticated;
    }

    /**
     * Get service status details
     * @param {string} service - Service name
     * @returns {Object|null} Service status details
     */
    getServiceStatus(service) {
        if (!this.status || this.status.error) return null;
        
        return this.status.services?.[service] || null;
    }

    /**
     * Add status change listener
     * @param {Function} listener - Listener function
     */
    addListener(listener) {
        this.listeners.add(listener);
        
        // Immediately notify with current status if available
        if (this.status) {
            try {
                listener('status:current', this.status);
            } catch (error) {
                window.MonitoringService && window.MonitoringService.error('Error in status listener', {
                    error: error.message,
                    operation: 'status-listener'
                }, 'renderer');
            }
        }
    }

    /**
     * Remove status change listener
     * @param {Function} listener - Listener function to remove
     */
    removeListener(listener) {
        this.listeners.delete(listener);
    }

    /**
     * Notify all listeners of an event
     * @param {string} event - Event name
     * @param {any} data - Event data
     */
    notifyListeners(event, data) {
        this.listeners.forEach(listener => {
            try {
                listener(event, data);
            } catch (error) {
                window.MonitoringService && window.MonitoringService.error('Error in connection listener', {
                    event,
                    error: error.message,
                    operation: 'connection-listener'
                }, 'renderer');
            }
        });
    }

    /**
     * Set refresh rate for periodic updates
     * @param {number} rate - Refresh rate in milliseconds
     */
    setRefreshRate(rate) {
        if (rate < 5000) {
            window.MonitoringService && window.MonitoringService.warn('Refresh rate too low, setting to minimum 5 seconds', {
                requested: rate,
                set: 5000,
                operation: 'refresh-rate-update'
            }, 'renderer');
            rate = 5000;
        }
        
        this.refreshRate = rate;
        
        if (this.refreshInterval) {
            this.stopPeriodicRefresh();
            this.startPeriodicRefresh();
        }
        
        window.MonitoringService && window.MonitoringService.info('Refresh rate updated', { 
            rate: this.refreshRate,
            operation: 'refresh-rate-update'
        }, 'renderer');
    }

    /**
     * Force immediate status refresh
     * @returns {Promise<Object>} Updated status
     */
    async forceRefresh() {
        window.MonitoringService && window.MonitoringService.info('Forcing status refresh', { operation: 'status-force-refresh' }, 'renderer');
        return await this.refreshStatus();
    }

    /**
     * Get health metrics
     * @returns {Object} Health metrics
     */
    getHealthMetrics() {
        const summary = this.getConnectionSummary();
        const metrics = {
            overall: summary.overall,
            timestamp: new Date().toISOString(),
            services: {}
        };
        
        Object.entries(summary.services || {}).forEach(([service, data]) => {
            metrics.services[service] = {
                healthy: data.status === 'connected' && data.authenticated,
                status: data.status,
                authenticated: data.authenticated
            };
        });
        
        return metrics;
    }

    /**
     * Cleanup Connection Manager resources
     */
    destroy() {
        this.stopPeriodicRefresh();
        this.listeners.clear();
        this.status = null;
        this.initialized = false;
        window.MonitoringService && window.MonitoringService.info('Connection Manager destroyed', { operation: 'connection-cleanup' }, 'renderer');
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.ConnectionManager = ConnectionManager;
}