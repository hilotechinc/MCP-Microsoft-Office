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
     * @param {Object} [options] - { filter, once, userId, deviceId, sessionId }
     * @returns {Promise<number>} listener ID
     */
    async subscribe(event, handler, options = {}) {
        const startTime = Date.now();
        const { userId = null, deviceId = null, sessionId = null } = options;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            this._ensureMonitoringService().debug('Processing event subscription request', {
                event,
                hasFilter: !!options.filter,
                once: !!options.once,
                userId,
                deviceId,
                sessionId,
                timestamp: new Date().toISOString()
            }, 'events');
        }
        
        try {
            if (typeof event !== 'string' || !event.trim()) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'events',
                    'Event name must be a non-empty string',
                    'warn',
                    {
                        event,
                        eventType: typeof event,
                        userId,
                        deviceId,
                        sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                this._ensureMonitoringService().logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    this._ensureMonitoringService().error('Event subscription failed - invalid event name', {
                        error: 'Event name must be a non-empty string',
                        event,
                        timestamp: new Date().toISOString()
                    }, 'events', null, userId);
                } else if (sessionId) {
                    this._ensureMonitoringService().error('Event subscription failed - invalid event name', {
                        sessionId,
                        error: 'Event name must be a non-empty string',
                        event,
                        timestamp: new Date().toISOString()
                    }, 'events');
                }
                
                throw mcpError;
            }
            
            if (typeof handler !== 'function') {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'events',
                    'Event handler must be a function',
                    'warn',
                    {
                        event,
                        handlerType: typeof handler,
                        userId,
                        deviceId,
                        sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                this._ensureMonitoringService().logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    this._ensureMonitoringService().error('Event subscription failed - invalid handler', {
                        error: 'Event handler must be a function',
                        event,
                        timestamp: new Date().toISOString()
                    }, 'events', null, userId);
                } else if (sessionId) {
                    this._ensureMonitoringService().error('Event subscription failed - invalid handler', {
                        sessionId,
                        error: 'Event handler must be a function',
                        event,
                        timestamp: new Date().toISOString()
                    }, 'events');
                }
                
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
            
            // Pattern 2: User Activity Logs
            if (userId) {
                this._ensureMonitoringService().info('Event subscription completed successfully', {
                    event,
                    listenerId: id,
                    totalListeners: this._listeners.get(event).length,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'events', null, userId);
            } else if (sessionId) {
                this._ensureMonitoringService().info('Event subscription completed with session', {
                    sessionId,
                    event,
                    listenerId: id,
                    totalListeners: this._listeners.get(event).length,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
            this._ensureMonitoringService().trackMetric('event_subscribe_success', executionTime, {
                event,
                listenerId: id,
                totalListeners: this._listeners.get(event).length,
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            });
            
            // Track memory usage
            this._ensureMonitoringService().trackMetric('event_listeners_count', this._getTotalListenerCount(), {
                event,
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            });
            
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
                });
                throw error;
            }
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'events',
                `Event subscription failed: ${error.message}`,
                'error',
                {
                    event,
                    stack: error.stack,
                    userId,
                    deviceId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            this._ensureMonitoringService().logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                this._ensureMonitoringService().error('Event subscription failed', {
                    error: error.message,
                    event,
                    timestamp: new Date().toISOString()
                }, 'events', null, userId);
            } else if (sessionId) {
                this._ensureMonitoringService().error('Event subscription failed', {
                    sessionId,
                    error: error.message,
                    event,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
            this._ensureMonitoringService().trackMetric('event_subscribe_failure', executionTime, {
                event,
                errorType: error.code || 'unknown',
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Emit an event (async, all handlers) with optional user context for filtering.
     * @param {string} event
     * @param {any} payload
     * @param {Object} [options] - { userId, deviceId, sessionId }
     * @returns {Promise<void>}
     */
    async emit(event, payload, options = {}) {
        const startTime = Date.now();
        const { userId = null, deviceId = null, sessionId = null } = options;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            try {
                const monitor = this._ensureMonitoringService();
                if (monitor && typeof monitor.debug === 'function') {
                    monitor.debug('Processing event emission request', {
                        event,
                        payloadType: typeof payload,
                        userId,
                        deviceId,
                        sessionId,
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
                });
                
                // Pattern 2: User Activity Logs (even for no-op)
                if (userId) {
                    this._ensureMonitoringService().info('Event emitted with no listeners', {
                        event,
                        duration: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'events', null, userId);
                } else if (sessionId) {
                    this._ensureMonitoringService().info('Event emitted with no listeners', {
                        sessionId,
                        event,
                        duration: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'events');
                }
                
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
                    
                    // Pattern 3: Infrastructure Error Logging
                    const mcpError = ErrorService.createError(
                        'events',
                        `Event handler failed for event '${event}': ${handlerError.message}`,
                        'error',
                        {
                            event,
                            listenerId: listener.id,
                            handlerError: handlerError.message,
                            stack: handlerError.stack,
                            userId: listener.userId,
                            deviceId: listener.deviceId,
                            sessionId,
                            timestamp: new Date().toISOString()
                        }
                    );
                    
                    this._ensureMonitoringService().logError(mcpError);
                    
                    // Pattern 4: User Error Tracking
                    if (userId) {
                        this._ensureMonitoringService().error('Event handler execution failed', {
                            event,
                            listenerId: listener.id,
                            error: handlerError.message,
                            timestamp: new Date().toISOString()
                        }, 'events', null, userId);
                    } else if (sessionId) {
                        this._ensureMonitoringService().error('Event handler execution failed', {
                            sessionId,
                            event,
                            listenerId: listener.id,
                            error: handlerError.message,
                            timestamp: new Date().toISOString()
                        }, 'events');
                    }
                }
            }
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                this._ensureMonitoringService().info('Event emission completed successfully', {
                    event,
                    totalListeners: listeners.length,
                    successCount,
                    failureCount,
                    filteredCount,
                    userFilteredCount,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'events', null, userId);
            } else if (sessionId) {
                this._ensureMonitoringService().info('Event emission completed with session', {
                    sessionId,
                    event,
                    totalListeners: listeners.length,
                    successCount,
                    failureCount,
                    filteredCount,
                    userFilteredCount,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
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
            });
            
            // Pattern 1: Development Debug Logs
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
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'events',
                `Event emission failed: ${error.message}`,
                'error',
                {
                    event,
                    stack: error.stack,
                    userId,
                    deviceId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            this._ensureMonitoringService().logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                this._ensureMonitoringService().error('Event emission failed', {
                    event,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'events', null, userId);
            } else if (sessionId) {
                this._ensureMonitoringService().error('Event emission failed', {
                    sessionId,
                    event,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
            this._ensureMonitoringService().trackMetric('event_emit_failure', executionTime, {
                event,
                errorType: error.code || 'unknown',
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Unsubscribe from an event by listener ID.
     * @param {string} id - Listener ID to remove
     * @param {Object} [options] - { sessionId }
     * @returns {Promise<boolean>} - True if found and removed
     */
    async unsubscribe(id, options = {}) {
        const startTime = Date.now();
        const { sessionId = null } = options;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            try {
                const monitor = this._ensureMonitoringService();
                if (monitor && typeof monitor.debug === 'function') {
                    monitor.debug('Processing unsubscribe request', {
                        listenerId: id,
                        sessionId,
                        timestamp: new Date().toISOString()
                    }, 'events');
                } else {
                    console.debug(`[events] Unsubscribe request received: ${id}`);
                }
            } catch (logError) {
                // Silently handle any logging errors
                console.debug(`[events] Unsubscribe request received: ${id}`);
            }
        }
        
        try {
            let found = false;
            let event = null;
            let userId = null;
            let deviceId = null;
            
            // Find and remove the listener
            for (const [eventName, listeners] of this._listeners.entries()) {
                const index = listeners.findIndex(listener => listener.id === id);
                if (index !== -1) {
                    event = eventName;
                    userId = listeners[index].userId;
                    deviceId = listeners[index].deviceId;
                    listeners.splice(index, 1);
                    found = true;
                    break;
                }
            }
            
            const executionTime = Date.now() - startTime;
            
            if (found) {
                this._ensureMonitoringService().trackMetric('event_unsubscribe_success', executionTime, {
                    listenerId: id,
                    event,
                    userId,
                    deviceId,
                    timestamp: new Date().toISOString()
                });
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    this._ensureMonitoringService().info('Event unsubscribe completed', {
                        listenerId: id,
                        event,
                        duration: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'events', null, userId);
                } else if (sessionId) {
                    this._ensureMonitoringService().info('Event unsubscribe completed', {
                        sessionId,
                        listenerId: id,
                        event,
                        duration: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'events');
                }
                
                // Pattern 1: Development Debug Logs
                if (process.env.NODE_ENV === 'development') {
                    this._ensureMonitoringService().debug('Event unsubscribe successful', {
                        listenerId: id,
                        event,
                        userId,
                        deviceId,
                        sessionId,
                        executionTimeMs: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'events');
                }
                
                return true;
            } else {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'events',
                    `Event unsubscribe failed: listener ID '${id}' not found`,
                    'warn',
                    {
                        listenerId: id,
                        sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                
                this._ensureMonitoringService().logError(mcpError);
                this._ensureMonitoringService().trackMetric('event_unsubscribe_not_found', executionTime, {
                    listenerId: id,
                    timestamp: new Date().toISOString()
                });
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    this._ensureMonitoringService().warn('Event unsubscribe failed: listener not found', {
                        listenerId: id,
                        timestamp: new Date().toISOString()
                    }, 'events', null, userId);
                } else if (sessionId) {
                    this._ensureMonitoringService().warn('Event unsubscribe failed: listener not found', {
                        sessionId,
                        listenerId: id,
                        timestamp: new Date().toISOString()
                    }, 'events');
                }
                
                // Pattern 1: Development Debug Logs
                if (process.env.NODE_ENV === 'development') {
                    this._ensureMonitoringService().debug('Event unsubscribe failed: listener not found', {
                        listenerId: id,
                        sessionId,
                        executionTimeMs: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'events');
                }
                
                return false;
            }
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'events',
                `Event unsubscribe error: ${error.message}`,
                'error',
                {
                    listenerId: id,
                    sessionId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            this._ensureMonitoringService().logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                this._ensureMonitoringService().error('Event unsubscribe failed with error', {
                    listenerId: id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'events', null, userId);
            } else if (sessionId) {
                this._ensureMonitoringService().error('Event unsubscribe failed with error', {
                    sessionId,
                    listenerId: id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
            this._ensureMonitoringService().trackMetric('event_unsubscribe_error', executionTime, {
                listenerId: id,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Remove all listeners (for test cleanup).
     * @param {Object} [options] - { userId, sessionId }
     * @returns {Promise<void>}
     */
    async clear(options = {}) {
        const startTime = Date.now();
        const { userId = null, sessionId = null } = options;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            try {
                this._ensureMonitoringService().debug('Processing clear all listeners request', {
                    userId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }, 'events');
            } catch (logError) {
                // Silently handle any logging errors
                console.debug('[events] Processing clear all listeners request');
            }
        }
        
        try {
            const totalListeners = this._getTotalListenerCount();
            const eventCount = this._listeners.size;
            
            this._listeners.clear();
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                this._ensureMonitoringService().info('All event listeners cleared', {
                    clearedListeners: totalListeners,
                    clearedEvents: eventCount,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'events', null, userId);
            } else if (sessionId) {
                this._ensureMonitoringService().info('All event listeners cleared', {
                    sessionId,
                    clearedListeners: totalListeners,
                    clearedEvents: eventCount,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
            this._ensureMonitoringService().trackMetric('event_clear_success', executionTime, {
                clearedListeners: totalListeners,
                clearedEvents: eventCount,
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            });
            
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                this._ensureMonitoringService().debug('Event listeners cleared successfully', {
                    clearedListeners: totalListeners,
                    clearedEvents: eventCount,
                    userId,
                    sessionId,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'events',
                `Event clear operation failed: ${error.message}`,
                'error',
                {
                    userId,
                    sessionId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            this._ensureMonitoringService().logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                this._ensureMonitoringService().error('Failed to clear event listeners', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'events', null, userId);
            } else if (sessionId) {
                this._ensureMonitoringService().error('Failed to clear event listeners', {
                    sessionId,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'events');
            }
            
            this._ensureMonitoringService().trackMetric('event_clear_failure', executionTime, {
                errorType: error.code || 'unknown',
                userId,
                sessionId,
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
