/**
 * @fileoverview discover-modules - Dynamically discovers and loads MCP modules from the modules directory.
 * Registers each found module with the ModuleRegistry.
 * Follows async, modular, and testable design.
 */

const fs = require('fs').promises;
const path = require('path');
const moduleRegistry = require('./module-registry');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

/**
 * Discovers and registers all modules in the given directory.
 * Only files ending with .cjs and exporting required module interface are loaded.
 * Files must export an object with id, name, capabilities array, init function, and handleIntent function.
 * @param {string} modulesDir - Absolute path to modules directory
 * @returns {Promise<Array<object>>} Array of registered modules
 * @throws {Object} Standardized error object if directory cannot be read
 */
async function discoverModules(modulesDir) {
    const startTime = Date.now();
    if (MonitoringService) {
        MonitoringService.info('Starting module discovery process', { modulesDir }, 'module');
    } else {
        console.info('[MCP MODULE] Starting module discovery process', { modulesDir });
    }
    
    let files;
    try {
        files = await fs.readdir(modulesDir);
    } catch (error) {
        // Create standardized error with enhanced context
        let mcpError;
        if (ErrorService) {
            mcpError = ErrorService.createError(
                'module',
                'Failed to read modules directory',
                'error',
                { 
                    modulesDir, 
                    errorCode: error.code || 'UNKNOWN',
                    errorMessage: error.message,
                    timestamp: new Date().toISOString()
                }
            );
            if (MonitoringService) {
                MonitoringService.logError(mcpError);
            } else {
                console.error('[MCP MODULE] Failed to read modules directory', mcpError);
            }
        } else {
            // Fallback if ErrorService is not available
            console.error('[MCP MODULE] Failed to read modules directory', {
                modulesDir,
                error: error.message,
                errorCode: error.code || 'UNKNOWN'
            });
            // Create basic error object
            mcpError = {
                category: 'module',
                message: 'Failed to read modules directory',
                severity: 'error',
                context: { modulesDir, error: error.message }
            };
        }
        throw mcpError;
    }
    const registered = [];
    for (const file of files) {
        if (!file.endsWith('.cjs') || file === 'module-registry.cjs' || file === 'discover-modules.cjs') continue;
        
        const modPath = path.join(modulesDir, file);
        let mod;
        
        try {
            mod = require(modPath);
            
            // Must have id, name, capabilities, init, handleIntent
            if (mod && mod.id && mod.name && Array.isArray(mod.capabilities) && 
                typeof mod.init === 'function' && typeof mod.handleIntent === 'function') {
                
                moduleRegistry.registerModule(mod);
                registered.push(mod);
                
                // Log successful module registration
                if (MonitoringService) {
                    MonitoringService.info('Module registered successfully', { 
                        moduleId: mod.id, 
                        moduleName: mod.name,
                        capabilities: mod.capabilities.length,
                        timestamp: new Date().toISOString()
                    }, 'module');
                } else {
                    console.info('[MCP MODULE] Module registered successfully', {
                        moduleId: mod.id,
                        moduleName: mod.name,
                        capabilities: mod.capabilities.length
                    });
                }
            } else {
                // Handle invalid module interface
                if (ErrorService) {
                    const mcpError = ErrorService.createError(
                        'module',
                        'Invalid module interface',
                        'warning',
                        { 
                            file, 
                            path: modPath, 
                            missingProperties: getMissingProperties(mod),
                            timestamp: new Date().toISOString()
                        }
                    );
                    if (MonitoringService) {
                        MonitoringService.logError(mcpError);
                    } else {
                        console.warn('[MCP MODULE] Invalid module interface', {
                            file,
                            path: modPath,
                            missingProperties: getMissingProperties(mod)
                        });
                    }
                } else {
                    console.warn('[MCP MODULE] Invalid module interface', {
                        file,
                        path: modPath,
                        missingProperties: getMissingProperties(mod)
                    });
                }
            }
        } catch (error) {
            // Handle module loading errors
            if (ErrorService) {
                const mcpError = ErrorService.createError(
                    'module',
                    `Failed to load module: ${file}`,
                    'error',
                    { 
                        file, 
                        path: modPath, 
                        errorMessage: error.message,
                        errorStack: error.stack,
                        timestamp: new Date().toISOString()
                    }
                );
                if (MonitoringService) {
                    MonitoringService.logError(mcpError);
                } else {
                    console.error(`[MCP MODULE] Failed to load module: ${file}`, {
                        file,
                        path: modPath,
                        error: error.message
                    });
                }
            } else {
                console.error(`[MCP MODULE] Failed to load module: ${file}`, {
                    file,
                    path: modPath,
                    error: error.message
                });
            }
        }
    }
    
    const elapsedTime = Date.now() - startTime;
    
    // Log completion information
    if (MonitoringService) {
        MonitoringService.info('Module discovery completed', { 
            totalModules: registered.length,
            moduleIds: registered.map(m => m.id),
            elapsedTimeMs: elapsedTime,
            timestamp: new Date().toISOString()
        }, 'module');
        
        // Track performance metric
        MonitoringService.trackMetric('module_discovery_time', elapsedTime, {
            totalModules: registered.length,
            timestamp: new Date().toISOString()
        });
    } else {
        console.info('[MCP MODULE] Module discovery completed', {
            totalModules: registered.length,
            moduleIds: registered.map(m => m.id),
            elapsedTimeMs: elapsedTime
        });
    }
    
    return registered;
}

/**
 * Helper function to identify which required properties are missing from a module.
 * @param {Object} mod - The module object to check
 * @returns {Array<string>} List of missing required properties
 */
function getMissingProperties(mod) {
    const requiredProps = ['id', 'name', 'capabilities', 'init', 'handleIntent'];
    const missing = [];
    
    if (!mod) return requiredProps;
    
    for (const prop of requiredProps) {
        if (prop === 'capabilities') {
            if (!Array.isArray(mod[prop])) missing.push(prop);
        } else if (prop === 'init' || prop === 'handleIntent') {
            if (typeof mod[prop] !== 'function') missing.push(prop);
        } else if (!mod[prop]) {
            missing.push(prop);
        }
    }
    
    return missing;
}

module.exports = { 
    discoverModules,
    // Export for testing purposes
    getMissingProperties
};
