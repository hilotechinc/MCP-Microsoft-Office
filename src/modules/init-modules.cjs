/**
 * @fileoverview init-modules - Initializes all discovered MCP modules with dependency injection.
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 */

const moduleRegistry = require('./module-registry');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

/**
 * Initializes all registered modules with provided dependencies/services.
 * Calls each module's init(services) and replaces the module in the registry with the initialized instance.
 * Handles errors during initialization and logs them appropriately.
 * Tracks performance metrics for the initialization process.
 * @param {object} services - Dependency/service registry to inject
 * @returns {Promise<Array<object>>} Array of successfully initialized modules
 * @throws {Object} Will not throw errors from individual module initialization failures
 */
async function initializeModules(services = {}) {
    const startTime = Date.now();
    
    // Log initialization start
    if (MonitoringService) {
        // Use helper function to redact sensitive information
        const safeServicesInfo = redactSensitiveServiceInfo(services);
        
        MonitoringService.info('Starting module initialization process', { 
            moduleCount: moduleRegistry.getAllModules().length,
            servicesProvided: safeServicesInfo
        }, 'module');
    } else {
        // Use helper function to redact sensitive information for fallback logging
        const safeServicesInfo = redactSensitiveServiceInfo(services);
        
        console.info('[MCP MODULE] Starting module initialization process', { 
            moduleCount: moduleRegistry.getAllModules().length,
            servicesProvided: safeServicesInfo
        });
    }
    
    const modules = moduleRegistry.getAllModules();
    const initialized = [];
    for (const mod of modules) {
        if (typeof mod.init === 'function') {
            try {
                // Log module initialization attempt
                if (MonitoringService) {
                    MonitoringService.debug('Initializing module', { 
                        moduleId: mod.id, 
                        moduleName: mod.name
                    }, 'module');
                }
                
                const instance = await mod.init(services);
                
                // Replace the module in the registry with the initialized instance
                moduleRegistry.modules.set(mod.id, instance);
                initialized.push(instance);
                
                // Log successful initialization
                if (MonitoringService) {
                    MonitoringService.info('Module initialized successfully', { 
                        moduleId: mod.id, 
                        moduleName: mod.name,
                        capabilities: Array.isArray(mod.capabilities) ? mod.capabilities.length : 0,
                        timestamp: new Date().toISOString()
                    }, 'module');
                } else {
                    console.info(`[MCP MODULE] Module initialized successfully: ${mod.id}`);
                }
            } catch (error) {
                // Handle module initialization errors
                if (ErrorService) {
                    const mcpError = ErrorService.createError(
                        'module',
                        `Failed to initialize module: ${mod.id}`,
                        'error',
                        { 
                            moduleId: mod.id, 
                            moduleName: mod.name,
                            errorMessage: error.message,
                            errorStack: error.stack,
                            timestamp: new Date().toISOString()
                        }
                    );
                    if (MonitoringService) {
                        MonitoringService.logError(mcpError);
                    } else {
                        console.error(`[MCP MODULE] Failed to initialize module: ${mod.id}`, {
                            error: error.message
                        });
                    }
                } else {
                    console.error(`[MCP MODULE] Failed to initialize module: ${mod.id}`, {
                        error: error.message
                    });
                }
            }
        } else {
            // Log warning for modules without init function
            if (MonitoringService) {
                MonitoringService.warn(`Module missing init function`, {
                    moduleId: mod.id || 'unknown',
                    moduleName: mod.name || 'unknown',
                    timestamp: new Date().toISOString()
                }, 'module');
            } else {
                console.warn(`[MCP MODULE] Module missing init function: ${mod.id || 'unknown'}`);
            }
        }
    }
    
    const elapsedTime = Date.now() - startTime;
    
    // Log completion information
    if (MonitoringService) {
        const completionData = { 
            totalModules: modules.length,
            initializedCount: initialized.length,
            moduleIds: initialized.map(m => m.id),
            elapsedTimeMs: elapsedTime,
            timestamp: new Date().toISOString()
        };
        
        MonitoringService.info('Module initialization completed', completionData, 'module');
        
        // Track performance metric
        MonitoringService.trackMetric('module_initialization_time', elapsedTime, {
            totalModules: modules.length,
            initializedCount: initialized.length,
            timestamp: new Date().toISOString()
        });
        
        // Emit event for real-time UI updates if logEmitter is available
        try {
            if (MonitoringService.logEmitter && typeof MonitoringService.logEmitter.emit === 'function') {
                MonitoringService.logEmitter.emit('moduleInitialized', {
                    event: 'moduleInitialized',
                    data: completionData,
                    timestamp: new Date().toISOString()
                });
            }
        } catch (error) {
            // Silently fail if emitter is not available or fails
            // This is non-critical functionality
        }
    } else {
        console.info('[MCP MODULE] Module initialization completed', {
            totalModules: modules.length,
            initializedCount: initialized.length,
            moduleIds: initialized.map(m => m.id),
            elapsedTimeMs: elapsedTime
        });
    }
    
    return initialized;
}

/**
 * Helper function to redact sensitive information from service keys
 * @param {Object} services - The services object to redact
 * @returns {Array<string>} Array of service keys with sensitive ones redacted
 */
function redactSensitiveServiceInfo(services) {
    return Object.keys(services).map(key => {
        // Redact any keys that might contain sensitive information
        if (key.toLowerCase().includes('token') || 
            key.toLowerCase().includes('secret') || 
            key.toLowerCase().includes('password') || 
            key.toLowerCase().includes('auth')) {
            return `${key}: [REDACTED]`;
        }
        return key;
    });
}

module.exports = { 
    initializeModules,
    // Export for testing purposes
    redactSensitiveServiceInfo
};
