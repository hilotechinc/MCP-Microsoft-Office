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
 * @returns {Promise<any>} Result from the module's handleIntent
 * @throws {Object} Standardized error object if no module supports the intent or other errors occur
 */
async function routeIntent(intent, entities = {}, context = {}) {
    const startTime = Date.now();
    
    // Redact potentially sensitive data from entities and context
    const safeEntities = redactSensitiveData(entities);
    const safeContext = redactSensitiveData(context);
    
    // Log intent routing attempt
    MonitoringService?.debug('Routing intent', { 
        intent, 
        entities: safeEntities,
        context: safeContext,
        timestamp: new Date().toISOString()
    }, 'module') || console.debug(`[MCP MODULE] Routing intent: ${intent}`);
    
    try {
        const candidates = moduleRegistry.findModulesForIntent(intent);
        
        if (!candidates.length) {
            // Create standardized error for unsupported intent
            const error = ErrorService?.createError(
                'module',
                `No module found for intent: ${intent}`,
                'error',
                { 
                    intent,
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'module',
                message: `No module found for intent: ${intent}`,
                severity: 'error',
                context: { intent, timestamp: new Date().toISOString() }
            };
            
            MonitoringService?.logError(error) || 
                console.error(`[MCP MODULE] No module found for intent: ${intent}`);
            
            throw error;
        }
        
        // Prioritize first registered module for now (could extend to all, or priority-based)
        const mod = candidates[0];
        
        if (typeof mod.handleIntent !== 'function') {
            // Create standardized error for invalid module
            const error = ErrorService?.createError(
                'module',
                `Module ${mod.id} missing handleIntent`,
                'error',
                { 
                    moduleId: mod.id,
                    moduleName: mod.name,
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'module',
                message: `Module ${mod.id} missing handleIntent`,
                severity: 'error',
                context: { moduleId: mod.id, timestamp: new Date().toISOString() }
            };
            
            MonitoringService?.logError(error) || 
                console.error(`[MCP MODULE] Module ${mod.id} missing handleIntent`);
            
            throw error;
        }
        
        // Log successful module selection
        MonitoringService?.info('Selected module for intent', { 
            intent,
            moduleId: mod.id,
            moduleName: mod.name,
            timestamp: new Date().toISOString()
        }, 'module');
        
        // Execute the intent handler
        const result = await mod.handleIntent(intent, entities, context);
        
        // Track performance metric
        const elapsedTime = Date.now() - startTime;
        
        // Log successful intent handling and track metrics
        MonitoringService?.trackMetric('intent_routing_time', elapsedTime, {
            intent,
            moduleId: mod.id,
            success: true,
            timestamp: new Date().toISOString()
        });
        
        MonitoringService?.info('Successfully handled intent', { 
            intent,
            moduleId: mod.id,
            elapsedTimeMs: elapsedTime,
            timestamp: new Date().toISOString()
        }, 'module');
        
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
        // Track performance metric for failed intent routing
        const elapsedTime = Date.now() - startTime;
        
        MonitoringService?.trackMetric('intent_routing_time', elapsedTime, {
            intent,
            success: false,
            errorType: error.category || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // If this is not already a standardized error, create one
        if (!error.category) {
            const standardError = ErrorService?.createError(
                'module',
                `Error handling intent: ${intent}`,
                'error',
                { 
                    intent,
                    originalError: error.message,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'module',
                message: `Error handling intent: ${intent}`,
                severity: 'error',
                context: { 
                    intent, 
                    originalError: error.message,
                    timestamp: new Date().toISOString()
                }
            };
            
            MonitoringService?.logError(standardError) || 
                console.error(`[MCP MODULE] Error handling intent: ${intent}`, error.message);
            
            throw standardError;
        }
        
        // Log the standardized error
        MonitoringService?.logError(error) || 
            console.error(`[MCP MODULE] Error handling intent: ${intent}`, error.message);
        
        // Re-throw the original error if it's already standardized
        throw error;
    }
}

/**
 * Finds all modules that can handle a given intent.
 * Logs the search process and results.
 * @param {string} intent - The intent/capability to find modules for
 * @returns {Array<object>} Modules supporting the intent
 */
function getModulesForIntent(intent) {
    // Log the intent query
    MonitoringService?.debug('Finding modules for intent', { 
        intent, 
        timestamp: new Date().toISOString() 
    }, 'module') || console.debug(`[MCP MODULE] Finding modules for intent: ${intent}`);
    
    const modules = moduleRegistry.findModulesForIntent(intent);
    
    // Log the result
    MonitoringService?.info('Found modules for intent', { 
        intent, 
        count: modules.length,
        moduleIds: modules.map(m => m.id),
        timestamp: new Date().toISOString()
    }, 'module') || console.info(`[MCP MODULE] Found ${modules.length} modules for intent: ${intent}`);
    
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
}

/**
 * Helper function to redact sensitive information from objects
 * @param {Object} data - The data object to redact
 * @param {WeakSet} visited - Set of visited objects to detect circular references
 * @returns {Object} Copy of the object with sensitive fields redacted
 */
function redactSensitiveData(data, visited = new WeakSet()) {
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
            } 
            // Recursively process nested objects
            else if (typeof result[key] === 'object' && result[key] !== null) {
                result[key] = redactSensitiveData(result[key], visited);
            }
        }
    }
    
    return result;
}

module.exports = {
    routeIntent,
    getModulesForIntent,
    // Export for testing purposes
    redactSensitiveData
};
