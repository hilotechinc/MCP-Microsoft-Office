/**
 * @fileoverview intent-router - Routes intents to the appropriate MCP module(s) based on capability.
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 */

const moduleRegistry = require('./module-registry.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

/**
 * Routes an intent to the first capable module.
 * Logs the routing process, handles errors, and tracks performance metrics.
 * Sensitive data in entities and context is automatically redacted in logs.
 * @param {string} intent - The intent/capability to route
 * @param {object} entities - Intent entities (optional)
 * @param {object} context - Context for the intent (optional)
 * @param {string} userId - User ID for logging context (optional)
 * @param {string} sessionId - Session ID for logging context (optional)
 * @returns {Promise<any>} Result from the module's handleIntent
 * @throws {Object} Standardized error object if no module supports the intent or other errors occur
 */
async function routeIntent(intent, entities = {}, context = {}, userId, sessionId) {
    const startTime = Date.now();
    
    // Redact potentially sensitive data from entities and context
    const safeEntities = redactSensitiveData(entities, userId, sessionId);
    const safeContext = redactSensitiveData(context, userId, sessionId);
    
    // Pattern 1: Development Debug Logs
    // Only emitted in development environment
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Starting intent routing', {
            intent,
            entities: safeEntities,
            context: safeContext,
            sessionId: sessionId || 'unknown',
            timestamp: new Date().toISOString()
        }, 'intent-router');
    }
    
    try {
        const candidates = moduleRegistry.findModulesForIntent(intent);
        
        if (!candidates.length) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'intent-router',
                `No module found for intent: ${intent}`,
                'error',
                { 
                    intent,
                    availableModules: moduleRegistry.getAllModules().map(m => m.id),
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Intent routing failed - no module found', {
                    intent,
                    error: `No module found for intent: ${intent}`,
                    timestamp: new Date().toISOString()
                }, 'intent-router', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Intent routing failed - no module found', {
                    sessionId: sessionId.substring(0, 8) + '...',
                    intent,
                    error: `No module found for intent: ${intent}`,
                    timestamp: new Date().toISOString()
                }, 'intent-router');
            }
            
            throw mcpError;
        }
        
        // Prioritize first registered module for now (could extend to all, or priority-based)
        const mod = candidates[0];
        
        if (typeof mod.handleIntent !== 'function') {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'intent-router',
                `Module ${mod.id} missing handleIntent method`,
                'error',
                { 
                    moduleId: mod.id,
                    moduleName: mod.name,
                    intent,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Intent routing failed - invalid module', {
                    moduleId: mod.id,
                    moduleName: mod.name,
                    intent,
                    error: `Module ${mod.id} missing handleIntent method`,
                    timestamp: new Date().toISOString()
                }, 'intent-router', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Intent routing failed - invalid module', {
                    sessionId: sessionId.substring(0, 8) + '...',
                    moduleId: mod.id,
                    moduleName: mod.name,
                    intent,
                    error: `Module ${mod.id} missing handleIntent method`,
                    timestamp: new Date().toISOString()
                }, 'intent-router');
            }
            
            throw mcpError;
        }
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Selected module for intent', {
                intent,
                moduleId: mod.id,
                moduleName: mod.name,
                sessionId: sessionId || 'unknown',
                timestamp: new Date().toISOString()
            }, 'intent-router');
        }
        
        // Execute the intent handler
        const result = await mod.handleIntent(intent, entities, context);
        
        // Track performance metric
        const elapsedTime = Date.now() - startTime;
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Intent routed successfully', {
                intent,
                moduleId: mod.id,
                moduleName: mod.name,
                executionTime: elapsedTime,
                timestamp: new Date().toISOString()
            }, 'intent-router', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Intent routed successfully with session', {
                sessionId: sessionId.substring(0, 8) + '...',
                intent,
                moduleId: mod.id,
                moduleName: mod.name,
                executionTime: elapsedTime,
                timestamp: new Date().toISOString()
            }, 'intent-router');
        }
        
        // Emit event for real-time UI updates if logEmitter is available
        try {
            if (MonitoringService?.logEmitter && typeof MonitoringService.logEmitter.emit === 'function') {
                MonitoringService.logEmitter.emit('intentHandled', {
                    event: 'intentHandled',
                    data: {
                        intent,
                        moduleId: mod.id,
                        success: true,
                        elapsedTimeMs: elapsedTime
                    },
                    timestamp: new Date().toISOString()
                });
            }
        } catch (emitError) {
            // Silently fail if emitter is not available or fails
            // This is non-critical functionality
        }
        
        return result;
        
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'intent-router',
            `Intent routing failed: ${intent}`,
            'error',
            { 
                intent,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Intent routing failed', {
                intent,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'intent-router', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Intent routing failed', {
                sessionId: sessionId.substring(0, 8) + '...',
                intent,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'intent-router');
        }
        
        throw mcpError;
    }
}

/**
 * Finds all modules that can handle a given intent.
 * Logs the search process and results.
 * @param {string} intent - The intent/capability to find modules for
 * @param {string} userId - User ID for logging context (optional)
 * @param {string} sessionId - Session ID for logging context (optional)
 * @returns {Array<object>} Modules supporting the intent
 */
function getModulesForIntent(intent, userId, sessionId) {
    const startTime = Date.now();
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Finding modules for intent', {
            intent,
            sessionId: sessionId || 'unknown',
            timestamp: new Date().toISOString()
        }, 'intent-router');
    }
    
    try {
        const modules = moduleRegistry.findModulesForIntent(intent);
        const elapsedTime = Date.now() - startTime;
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Found modules for intent', {
                intent,
                count: modules.length,
                moduleIds: modules.map(m => m.id),
                executionTime: elapsedTime,
                timestamp: new Date().toISOString()
            }, 'intent-router', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Found modules for intent with session', {
                sessionId: sessionId.substring(0, 8) + '...',
                intent,
                count: modules.length,
                moduleIds: modules.map(m => m.id),
                executionTime: elapsedTime,
                timestamp: new Date().toISOString()
            }, 'intent-router');
        }
        
        // Emit event for real-time UI updates if logEmitter is available
        try {
            if (MonitoringService?.logEmitter && typeof MonitoringService.logEmitter.emit === 'function') {
                MonitoringService.logEmitter.emit('modulesFound', {
                    event: 'modulesFound',
                    data: {
                        intent,
                        count: modules.length,
                        moduleIds: modules.map(m => m.id)
                    },
                    timestamp: new Date().toISOString()
                });
            }
        } catch (emitError) {
            // Silently fail if emitter is not available or fails
            // This is non-critical functionality
        }
        
        return modules;
        
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'intent-router',
            `Error finding modules for intent: ${intent}`,
            'error',
            {
                intent,
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Module search failed', {
                intent,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'intent-router', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Module search failed', {
                sessionId: sessionId.substring(0, 8) + '...',
                intent,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'intent-router');
        }
        
        throw mcpError;
    }
}

/**
 * Helper function to redact sensitive information from objects
 * @param {Object} data - The data object to redact
 * @param {string} userId - User ID for logging context (optional)
 * @param {string} sessionId - Session ID for logging context (optional)
 * @param {WeakSet} visited - Set of visited objects to detect circular references
 * @returns {Object} Copy of the object with sensitive fields redacted
 */
function redactSensitiveData(data, userId, sessionId, visited = new WeakSet()) {
    const startTime = Date.now();
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Redacting sensitive data', {
            dataType: typeof data,
            isArray: Array.isArray(data),
            sessionId: sessionId || 'unknown',
            timestamp: new Date().toISOString()
        }, 'intent-router');
    }
    
    try {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        // Check for circular references
        if (visited.has(data)) {
            return '[Circular Reference]';
        }
        
        // Add current object to visited set
        visited.add(data);
        
        // Create a deep copy to avoid modifying the original
        const result = Array.isArray(data) ? [...data] : {...data};
        
        // Fields that should be redacted
        const sensitiveFields = [
            'user', 'email', 'mail', 'address', 'emailAddress', 'password', 'token', 'accessToken',
            'refreshToken', 'content', 'body', 'contentBytes'
        ];
        
        let redactedCount = 0;
        
        // Recursively process the object
        for (const key in result) {
            if (Object.prototype.hasOwnProperty.call(result, key)) {
                // Check if this is a sensitive field
                if (sensitiveFields.includes(key.toLowerCase())) {
                    if (typeof result[key] === 'string') {
                        result[key] = 'REDACTED';
                    } else if (Array.isArray(result[key])) {
                        result[key] = `[${result[key].length} items]`;
                    } else if (typeof result[key] === 'object' && result[key] !== null) {
                        result[key] = '{REDACTED}';
                    }
                    redactedCount++;
                } 
                // Recursively process nested objects
                else if (typeof result[key] === 'object' && result[key] !== null) {
                    result[key] = redactSensitiveData(result[key], userId, sessionId, visited);
                }
            }
        }
        
        const elapsedTime = Date.now() - startTime;
        
        // Pattern 2: User Activity Logs (only if redaction occurred)
        if (redactedCount > 0) {
            if (userId) {
                MonitoringService.info('Sensitive data redacted', {
                    redactedFields: redactedCount,
                    executionTime: elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'intent-router', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Sensitive data redacted with session', {
                    sessionId: sessionId.substring(0, 8) + '...',
                    redactedFields: redactedCount,
                    executionTime: elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'intent-router');
            }
        }
        
        return result;
        
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'intent-router',
            'Error redacting sensitive data',
            'error',
            {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Data redaction failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'intent-router', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Data redaction failed', {
                sessionId: sessionId.substring(0, 8) + '...',
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'intent-router');
        }
        
        // Return original data if redaction fails
        return data;
    }
}

module.exports = {
    routeIntent,
    getModulesForIntent,
    // Export for testing purposes
    redactSensitiveData
};
