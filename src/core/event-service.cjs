/**
 * @fileoverview EventService provides async event-based communication between components.
 * Supports subscribe, emit, filtering, one-time listeners, and unsubscribe. Modular, async, and testable.
 */

const ErrorService = require('./error-service.cjs');

// Use lazy loading for MonitoringService to avoid circular dependency
let MonitoringService = null;

// Initialize service with basic console logging first (only in non-silent mode)
if (process.env.MCP_SILENT_MODE !== 'true') {
    console.log('[MCP EVENTS] Event service initialized');
}

class EventService {
    constructor() {
        this._listeners = new Map(); // event -> [{id, handler, once, filter, userId, deviceId}]
        this._nextId = 1;
        
        // Lazy load MonitoringService to avoid circular dependency
        this._ensureMonitoringService();
    }
    
    /**
     * Lazy load MonitoringService to avoid circular dependency
     * Returns a guaranteed safe logging interface even during initialization
     */
    _ensureMonitoringService() {
        // Return existing instance if already initialized
        if (MonitoringService) {
            return MonitoringService;
        }
        
        // Create a proxy object that will defer method calls until real implementation is available
        const monitoringServiceProxy = new Proxy({}, {
            get: function(target, prop) {
                // If MonitoringService is loaded and has the method, use it
                if (MonitoringService && typeof MonitoringService[prop] === 'function') {
                    return MonitoringService[prop];
                }
                
                // Otherwise return a fallback function
                return function(message, context, category) {
                    // Try to load MonitoringService if not loaded yet
                    if (!MonitoringService) {
                        try {
                            MonitoringService = require('./monitoring-service.cjs');
                        } catch (error) {
                            // Silently fail and use console fallback
                        }
                    }
                    
                    // If loaded successfully and has the method, use it
                    if (MonitoringService && typeof MonitoringService[prop] === 'function') {
                        return MonitoringService[prop](message, context, category);
                    }
                    
                    // Fallback to console
                    switch(prop) {
                        case 'debug':
                            console.debug(`[${category || 'event'}] ${message}`, context ? JSON.stringify(context) : '');
                            break;
                        case 'info':
                            console.info(`[${category || 'event'}] ${message}`, context ? JSON.stringify(context) : '');
                            break;
                        case 'warn':
                            console.warn(`[${category || 'event'}] ${message}`, context ? JSON.stringify(context) : '');
                            break;
                        case 'error':
                            console.error(`[${category || 'event'}] ${message}`, context ? JSON.stringify(context) : '');
                            break;
                        case 'logError':
                            console.error('[event]', typeof message === 'object' ? JSON.stringify(message) : message);
                            break;
                        case 'trackMetric':
                            // No-op for metrics
                            break;
                        default:
                            // Handle any other methods
                            console.log(`[event] Called unknown method ${prop}`);
                    }
                };
            }
        });
        
        // Try to load the real MonitoringService
        try {
            MonitoringService = require('./monitoring-service.cjs');
        } catch (error) {
            // If we can't load it now, the proxy will try again later
            console.warn('[EVENT] Could not load MonitoringService, using fallback:', error.message);
        }
        
        return monitoringServiceProxy;
    }

    /**
     * Subscribe to an event with optional filtering and user context.
     * @param {string} event
     * @param {Function} handler
     * @param {Object} [options] - { filter, once, userId, deviceId }
     * @returns {Promise<number>} listener ID
     */
    async subscribe(event, handler, options = {}) {
        const startTime = Date.now();
        const { userId = null, deviceId = null } = options;
        
        if (process.env.NODE_ENV === 'development') {
            this._ensureMonitoringService().debug('Event subscription started', {
                event,
                hasFilter: !!options.filter,
                once: !!options.once,
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            }, 'events');
        }
        
        try {
            if (typeof event !== 'string' || !event.trim()) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'Event name must be a non-empty string',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        event,
                        eventType: typeof event,
                        userId,
                        deviceId,
                        timestamp: new Date().toISOString()
                    },
                    null,
                    userId,
                    deviceId
                );
                this._ensureMonitoringService().logError(mcpError);
                throw mcpError;
            }
            
            if (typeof handler !== 'function') {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'Event handler must be a function',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        event,
                        handlerType: typeof handler,
                        userId,
                        deviceId,
                        timestamp: new Date().toISOString()
                    },
                    null,
                    userId,
                    deviceId
                );
                this._ensureMonitoringService().logError(mcpError);
                throw mcpError;
            }
            
            if (!this._listeners.has(event)) this._listeners.set(event, []);
            const id = this._nextId++;
            
            // Store listener with user context for isolation
            this._listeners.get(event).push({ 
                id, 
                handler, 
                once: !!options.once, 
                filter: options.filter,
                userId,
                deviceId
            });
            
            const executionTime = Date.now() - startTime;
            this._ensureMonitoringService().trackMetric('event_subscribe_success', executionTime, {
                event,
                listenerId: id,
                totalListeners: this._listeners.get(event).length,
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            }, userId, deviceId);
            
            // Track memory usage
            this._ensureMonitoringService().trackMetric('event_listeners_count', this._getTotalListenerCount(), {
                event,
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            }, userId, deviceId);
            
            return id;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                this._ensureMonitoringService().trackMetric('event_subscribe_failure', executionTime, {
                    event,
                    errorType: error.code || 'validation_error',
                    userId,
                    deviceId,
                    timestamp: new Date().toISOString()
                }, userId, deviceId);
                throw error;
            }
            
            // Otherwise, wrap in MCP error
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Event subscription failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    event,
                    stack: error.stack,
                    userId,
                    deviceId,
                    timestamp: new Date().toISOString()
                },
                null,
                userId,
                deviceId
            );
            
            this._ensureMonitoringService().logError(mcpError);
            this._ensureMonitoringService().trackMetric('event_subscribe_failure', executionTime, {
                event,
                errorType: error.code || 'unknown',
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            }, userId, deviceId);
            
            throw mcpError;
        }
    }

    /**
     * Emit an event (async, all handlers) with optional user context for filtering.
     * @param {string} event
     * @param {any} payload
     * @param {Object} [options] - { userId, deviceId }
     * @returns {Promise<void>}
     */
    async emit(event, payload, options = {}) {
        const startTime = Date.now();
        const { userId = null, deviceId = null } = options;
        
        if (process.env.NODE_ENV === 'development') {
            try {
                const monitor = this._ensureMonitoringService();
                if (monitor && typeof monitor.debug === 'function') {
                    monitor.debug('Event emission started', {
                        event,
                        payloadType: typeof payload,
                        userId,
                        deviceId,
                        timestamp: new Date().toISOString()
                    }, 'events');
                } else {
                    console.debug(`[events] Event emission started: ${event}`);
                }
            } catch (logError) {
                // Silently handle any logging errors to prevent cascading failures
                console.debug(`[events] Event emission started: ${event}`);
            }
        }
        
        try {
            if (!this._listeners.has(event)) {
                const executionTime = Date.now() - startTime;
                this._ensureMonitoringService().trackMetric('event_emit_no_listeners', executionTime, {
                    event,
                    userId,
                    deviceId,
                    timestamp: new Date().toISOString()
                }, userId, deviceId);
                return;
            }
            
            const listeners = this._listeners.get(event);
            let successCount = 0;
            let failureCount = 0;
            let filteredCount = 0;
            let userFilteredCount = 0;
            
            // Copy for safe iteration
            for (const listener of [...listeners]) {
                try {
                    // User-scoped filtering: only emit to listeners with matching user context
                    // If userId is provided, only emit to listeners with same userId or no userId (global)
                    if (userId && listener.userId && listener.userId !== userId) {
                        userFilteredCount++;
                        continue;
                    }
                    
                    // Device-scoped filtering: only emit to listeners with matching device context
                    // If deviceId is provided, only emit to listeners with same deviceId or no deviceId (global)
                    if (deviceId && listener.deviceId && listener.deviceId !== deviceId) {
                        userFilteredCount++;
                        continue;
                    }
                    
                    if (listener.filter && !listener.filter(payload)) {
                        filteredCount++;
                        continue;
                    }
                    
                    await listener.handler(payload);
                    successCount++;
                    
                    if (listener.once) {
                        await this.unsubscribe(listener.id);
                    }
                    
                } catch (handlerError) {
                    failureCount++;
                    
                    const mcpError = ErrorService.createError(
                        ErrorService.CATEGORIES.SYSTEM,
                        `Event handler failed for event '${event}': ${handlerError.message}`,
                        ErrorService.SEVERITIES.ERROR,
                        {
                            event,
                            listenerId: listener.id,
                            handlerError: handlerError.message,
                            stack: handlerError.stack,
                            userId: listener.userId,
                            deviceId: listener.deviceId,
                            timestamp: new Date().toISOString()
                        }
                    );
                    
                    this._ensureMonitoringService().logError(mcpError);
                }
            }
            
            const executionTime = Date.now() - startTime;
            this._ensureMonitoringService().trackMetric('event_emit_success', executionTime, {
                event,
                totalListeners: listeners.length,
                successCount,
                failureCount,
                filteredCount,
                userFilteredCount,
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            }, userId, deviceId);
            
            if (process.env.NODE_ENV === 'development') {
                this._ensureMonitoringService().debug('Event emission completed', {
                    event,
                    totalListeners: listeners.length,
                    successCount,
                    failureCount,
                    filteredCount,
                    userFilteredCount,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Event emission failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    event,
                    stack: error.stack,
                    userId,
                    deviceId,
                    timestamp: new Date().toISOString()
                }
            );
            
            this._ensureMonitoringService().logError(mcpError);
            this._ensureMonitoringService().trackMetric('event_emit_failure', executionTime, {
                event,
                errorType: error.code || 'unknown',
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            }, userId, deviceId);
            
            throw mcpError;
        }
    }

    /**
     * Unsubscribe a handler by id.
     * @param {number} id
     * @returns {Promise<void>}
     */
    async unsubscribe(id) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            this._ensureMonitoringService().debug('Event unsubscription started', {
                listenerId: id,
                timestamp: new Date().toISOString()
            }, 'events');
        }
        
        try {
            let found = false;
            let eventName = null;
            
            for (const [event, listeners] of this._listeners.entries()) {
                const idx = listeners.findIndex(l => l.id === id);
                if (idx !== -1) {
                    listeners.splice(idx, 1);
                    eventName = event;
                    found = true;
                    
                    if (listeners.length === 0) {
                        this._listeners.delete(event);
                    }
                    break;
                }
            }
            
            const executionTime = Date.now() - startTime;
            this._ensureMonitoringService().trackMetric('event_unsubscribe_success', executionTime, {
                listenerId: id,
                found,
                event: eventName,
                timestamp: new Date().toISOString()
            });
            
            // Track memory usage
            this._ensureMonitoringService().trackMetric('event_listeners_count', this._getTotalListenerCount(), {
                operation: 'unsubscribe',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Event unsubscription failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    listenerId: id,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            this._ensureMonitoringService().logError(mcpError);
            this._ensureMonitoringService().trackMetric('event_unsubscribe_failure', executionTime, {
                listenerId: id,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Remove all listeners (for test cleanup).
     * @returns {Promise<void>}
     */
    async clear() {
        const startTime = Date.now();
        
        try {
            const totalListeners = this._getTotalListenerCount();
            const eventCount = this._listeners.size;
            
            this._ensureMonitoringService().info('Clearing all event listeners', {
                totalListeners,
                eventCount,
                timestamp: new Date().toISOString()
            }, 'events');
            
            this._listeners.clear();
            
            const executionTime = Date.now() - startTime;
            this._ensureMonitoringService().trackMetric('event_clear_success', executionTime, {
                clearedListeners: totalListeners,
                clearedEvents: eventCount,
                timestamp: new Date().toISOString()
            });
            
            this._ensureMonitoringService().info('All event listeners cleared successfully', {
                clearedListeners: totalListeners,
                clearedEvents: eventCount,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'events');
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Event clear operation failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            this._ensureMonitoringService().logError(mcpError);
            this._ensureMonitoringService().trackMetric('event_clear_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }
    
    /**
     * Helper method to get total listener count across all events.
     * @returns {number} Total number of listeners
     */
    _getTotalListenerCount() {
        let total = 0;
        for (const listeners of this._listeners.values()) {
            total += listeners.length;
        }
        return total;
    }
}

module.exports = new EventService();
