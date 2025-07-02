/**
 * @fileoverview init-modules - Initializes all discovered MCP modules with dependency injection.
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 * Implements proper dependency injection to avoid circular dependencies.
 */

const moduleRegistry = require('./module-registry.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');
const StorageService = require('../core/storage-service.cjs');
const { databaseFactory } = require('../core/database-factory.cjs');
const graphService = require('../graph/graph-service.cjs');

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
    
    // Initialize database factory first
    try {
        MonitoringService?.info('Initializing database factory...', {}, 'database');
        const config = {
            DB_TYPE: 'sqlite',
            DB_PATH: './data/mcp.sqlite'
        };
        await databaseFactory.init(config);
        MonitoringService?.info('Database factory initialized successfully', {
            databaseType: config.DB_TYPE,
            timestamp: new Date().toISOString()
        }, 'database');
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.STORAGE,
            `Failed to initialize database factory: ${error.message}`,
            ErrorService.SEVERITIES.CRITICAL,
            {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService?.logError(mcpError);
        throw mcpError;
    }
    
    // Initialize storage service after database factory
    try {
        MonitoringService?.info('Initializing storage service...', {}, 'storage');
        await StorageService.init();
        MonitoringService?.info('Storage service initialized successfully', {
            timestamp: new Date().toISOString()
        }, 'storage');
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.STORAGE,
            `Failed to initialize storage service: ${error.message}`,
            ErrorService.SEVERITIES.CRITICAL,
            {
                error: error.message,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService?.logError(mcpError);
        throw mcpError;
    }
    
    // Set up dependency injection between core services to avoid circular references
    // This is critical to prevent infinite error loops
    if (ErrorService && MonitoringService) {
        // Set the logging service in the error service
        ErrorService.setLoggingService(MonitoringService);
    }
    
    // Ensure all core services are available in the services object
    const enrichedServices = {
        ...services,
        errorService: ErrorService,
        monitoringService: MonitoringService,
        storageService: StorageService,
        databaseFactory: databaseFactory,
        graphService: graphService
    };
    
    // Log initialization start
    if (MonitoringService) {
        // Use helper function to redact sensitive information
        const safeServicesInfo = redactSensitiveServiceInfo(enrichedServices);
        
        MonitoringService.info('Starting module initialization process', { 
            moduleCount: moduleRegistry.getAllModules().length,
            servicesProvided: safeServicesInfo
        }, 'module');
    } else {
        // Use helper function to redact sensitive information for fallback logging
        const safeServicesInfo = redactSensitiveServiceInfo(enrichedServices);
        
        console.info('[MCP MODULE] Starting module initialization process', JSON.stringify({ 
            moduleCount: moduleRegistry.getAllModules().length,
            servicesProvided: safeServicesInfo
        }));
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
                
                // Use the enriched services object with proper dependency injection
                const instance = await mod.init(enrichedServices);
                
                // Replace the module in the registry with the initialized instance
                moduleRegistry.modules.set(mod.id, instance);
                initialized.push(instance);
                
                // Generate a trace ID for this module initialization
                const initTraceId = `module-init-${mod.id}-${Date.now()}`;
                
                // Log successful initialization
                if (MonitoringService) {
                    MonitoringService.info('Module initialized successfully', { 
                        moduleId: mod.id, 
                        moduleName: mod.name,
                        capabilities: Array.isArray(instance.capabilities) ? instance.capabilities : []
                    }, 'module', initTraceId);
                } else {
                    console.info(`[MCP MODULE] Module initialized successfully: ${mod.id}`);
                }
            } catch (error) {
                // Log initialization error but continue with other modules
                if (ErrorService && MonitoringService) {
                    // Generate a trace ID for this error
                    const errorTraceId = `module-init-error-${mod.id}-${Date.now()}`;
                    
                    // Create standardized error
                    const mcpError = ErrorService.createError(
                        'module',
                        `Failed to initialize module: ${mod.id}`,
                        'error',
                        { 
                            moduleId: mod.id, 
                            moduleName: mod.name,
                            error: error.message,
                            stack: error.stack
                        },
                        errorTraceId
                    );
                    
                    // Log the error with the monitoring service
                    MonitoringService.logError(mcpError);
                } else {
                    console.error(`[MCP MODULE] Failed to initialize module: ${mod.id}`, JSON.stringify({
                        error: error.message
                    }));
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
        console.info('[MCP MODULE] Module initialization completed', JSON.stringify({
            totalModules: modules.length,
            initializedCount: initialized.length,
            moduleIds: initialized.map(m => m.id),
            elapsedTimeMs: elapsedTime
        }));
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
