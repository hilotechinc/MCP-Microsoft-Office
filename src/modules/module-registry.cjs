/**
 * @fileoverview ModuleRegistry - Manages discovery and lifecycle of MCP modules.
 * Follows MCP modularity, explicit interface, and dependency injection rules.
 * Implements standardized logging and error handling via MonitoringService and ErrorService.
 */

const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

class ModuleRegistry {
    // TODO: [constructor] Accept logger via DI; track registration timestamps. (LOW) - Implemented
    constructor(options = {}) {
        // No longer using this.logger property - direct MonitoringService calls with fallbacks
        
        /** @type {Map<string, object>} */
        this.modules = new Map();
        /** @type {Map<string, Set<string>>} */
        this.capabilityMap = new Map(); // capability -> Set of module ids
        /** @type {Map<string, Date>} */
        this.registrationTimestamps = new Map(); // module.id -> registration time
        
        // Log initialization with proper optional chaining and fallback
        MonitoringService?.info('ModuleRegistry initialized', { 
            timestamp: new Date().toISOString() 
        }, 'module') || 
            console.info('[MCP MODULE] ModuleRegistry initialized');
    }

    /**
     * Registers a module with the registry and its capabilities.
     * @param {object} module - Must have id, name, capabilities, init, handleIntent
     */
    // TODO: [registerModule] Validate module interface contract (MEDIUM) - Implemented (basic validation)
    registerModule(module) {
        const startTime = Date.now();
        
        // Validate module object
        if (!module || typeof module !== 'object' || !module.id) {
            const error = ErrorService?.createError(
                'module',
                'Invalid module object or missing ID',
                'error',
                { 
                    moduleId: module?.id || 'unknown',
                    moduleType: typeof module,
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'module',
                message: 'Invalid module object or missing ID',
                severity: 'error',
                context: { moduleType: typeof module }
            };
            
            MonitoringService?.logError(error) || 
                console.error('[MCP MODULE] Invalid module object or missing ID');
            
            throw error;
        }
        
        // Check for duplicate module ID
        if (this.modules.has(module.id)) {
            const error = ErrorService?.createError(
                'module',
                `Module with ID '${module.id}' already registered`,
                'error',
                { 
                    moduleId: module.id,
                    moduleName: module.name,
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'module',
                message: `Module with ID '${module.id}' already registered`,
                severity: 'error',
                context: { moduleId: module.id }
            };
            
            MonitoringService?.logError(error) || 
                console.error(`[MCP MODULE] Module with ID '${module.id}' already registered`);
            
            throw error;
        }

        // Validate interface contract
        const requiredProps = {
            id: 'string',
            name: 'string',
            capabilities: 'array',
            init: 'function',
            handleIntent: 'function'
        };
        const optionalProps = {
            priority: 'number' // Added for future sorting
        };

        // Check required properties
        for (const prop in requiredProps) {
            if (typeof module[prop] !== requiredProps[prop] && !(prop === 'capabilities' && Array.isArray(module[prop]))) {
                const error = ErrorService?.createError(
                    'module',
                    `Module '${module.id}' missing or invalid required property '${prop}'`,
                    'error',
                    { 
                        moduleId: module.id,
                        moduleName: module.name,
                        property: prop,
                        expectedType: requiredProps[prop],
                        actualType: Array.isArray(module[prop]) ? 'array' : typeof module[prop],
                        timestamp: new Date().toISOString()
                    }
                ) || {
                    category: 'module',
                    message: `Module '${module.id}' missing or invalid required property '${prop}'`,
                    severity: 'error',
                    context: { 
                        moduleId: module.id, 
                        property: prop,
                        expectedType: requiredProps[prop]
                    }
                };
                
                MonitoringService?.logError(error) || 
                    console.error(`[MCP MODULE] Module '${module.id}' missing or invalid required property '${prop}'`);
                
                throw error;
            }
        }
        
        // Check optional properties
        for (const prop in optionalProps) {
            if (module.hasOwnProperty(prop) && typeof module[prop] !== optionalProps[prop]) {
                MonitoringService?.warn(`Module has optional property with incorrect type`, { 
                    moduleId: module.id,
                    moduleName: module.name,
                    property: prop,
                    expectedType: optionalProps[prop],
                    actualType: typeof module[prop],
                    timestamp: new Date().toISOString()
                }, 'module') || 
                    console.warn(`[MCP MODULE] Module '${module.id}' has optional property '${prop}' with incorrect type`);
            }
        }

        // Store a normalized module object
        const moduleToStore = { ...module, priority: module.priority || 0 }; // Default priority 0

        // Register the module
        this.modules.set(module.id, moduleToStore);
        this.registrationTimestamps.set(module.id, new Date());
        
        // Register capabilities
        if (Array.isArray(module.capabilities)) {
            for (const cap of module.capabilities) {
                if (!this.capabilityMap.has(cap)) this.capabilityMap.set(cap, new Set());
                this.capabilityMap.get(cap).add(module.id);
            }
        }
        
        // Log successful registration
        MonitoringService?.info('Module registered successfully', { 
            moduleId: module.id,
            moduleName: module.name,
            capabilities: Array.isArray(module.capabilities) ? module.capabilities.length : 0,
            timestamp: new Date().toISOString()
        }, 'module') || 
            console.info(`[MCP MODULE] Module '${module.id}' registered successfully`);
        
        // Track performance metric
        const elapsedTime = Date.now() - startTime;
        MonitoringService?.trackMetric('module_registration_time', elapsedTime, {
            moduleId: module.id,
            timestamp: new Date().toISOString()
        });
        
        // Emit event for real-time UI updates if logEmitter is available
        try {
            if (MonitoringService?.logEmitter && typeof MonitoringService.logEmitter.emit === 'function') {
                MonitoringService.logEmitter.emit('moduleRegistered', {
                    event: 'moduleRegistered',
                    data: {
                        moduleId: module.id,
                        moduleName: module.name,
                        capabilities: Array.isArray(module.capabilities) ? module.capabilities : []
                    },
                    timestamp: new Date().toISOString()
                });
            }
        } catch (emitError) {
            // Silently fail if emitter is not available or fails
            // This is non-critical functionality
        }
    }

    /**
     * Returns a registered module by id.
     * @param {string} id
     * @param {object} [options] - Optional settings.
     * @param {boolean} [options.strict=false] - Throw an error if the module is not found.
     * @returns {object|undefined}
     */
    // TODO: [getModule] Throw if not found when strict flag true (LOW) - Implemented
    getModule(id, options = {}) {
        const startTime = Date.now();
        const { strict = false } = options;
        
        // Log the request
        MonitoringService?.debug('Getting module by ID', { 
            moduleId: id, 
            strict,
            timestamp: new Date().toISOString()
        }, 'module');
        
        const module = this.modules.get(id);

        if (!module && strict) {
            // Create standardized error for module not found
            const error = ErrorService?.createError(
                'module',
                `Module with ID '${id}' not found (strict mode enabled)`,
                'error',
                { 
                    moduleId: id,
                    strict,
                    timestamp: new Date().toISOString()
                }
            ) || {
                category: 'module',
                message: `Module with ID '${id}' not found (strict mode enabled)`,
                severity: 'error',
                context: { moduleId: id, strict }
            };
            
            MonitoringService?.logError(error) || 
                console.error(`[MCP MODULE] Module with ID '${id}' not found (strict mode enabled)`);
            
            throw error;
        }
        
        // Log the result
        if (module) {
            MonitoringService?.debug('Module found', { 
                moduleId: id, 
                moduleName: module.name,
                timestamp: new Date().toISOString()
            }, 'module');
        } else {
            MonitoringService?.debug('Module not found', { 
                moduleId: id, 
                strict: false, // If we got here, strict must be false
                timestamp: new Date().toISOString()
            }, 'module');
        }
        
        // Track performance metric
        const elapsedTime = Date.now() - startTime;
        MonitoringService?.trackMetric('module_lookup_time', elapsedTime, {
            moduleId: id,
            found: !!module,
            timestamp: new Date().toISOString()
        });
        
        return module; // Returns the module or undefined if not found and strict is false
    }

    /**
     * Returns all registered modules.
     * @returns {Array<object>}
     */
    getAllModules() {
        const modules = Array.from(this.modules.values());
        
        // Log the request and result
        MonitoringService?.debug('Getting all modules', { 
            count: modules.length,
            moduleIds: modules.map(m => m.id),
            timestamp: new Date().toISOString()
        }, 'module') || 
            console.debug(`[MCP MODULE] Getting all modules (${modules.length})`);
        
        return modules;
    }

    /**
     * Finds all modules that support a given capability/intent.
     * @param {string} capability
     * @returns {Array<object>} Modules supporting the capability
     */
    // TODO: [findModulesForIntent] Return by priority when multiple modules share capability (LOW) - Implemented
    findModulesForIntent(capability) {
        const startTime = Date.now();
        
        // Log the request
        MonitoringService?.debug('Finding modules for intent', { 
            intent: capability,
            timestamp: new Date().toISOString()
        }, 'module');
        
        const ids = this.capabilityMap.get(capability);
        if (!ids || ids.size === 0) {
            // Log no modules found
            MonitoringService?.info('No modules found for intent', { 
                intent: capability,
                timestamp: new Date().toISOString()
            }, 'module') || 
                console.info(`[MCP MODULE] No modules found for intent: ${capability}`);
            
            // Track performance metric
            const elapsedTime = Date.now() - startTime;
            MonitoringService?.trackMetric('intent_lookup_time', elapsedTime, {
                intent: capability,
                found: false,
                count: 0,
                timestamp: new Date().toISOString()
            });
            
            return [];
        }

        // Retrieve modules and filter out any potential nulls if an ID somehow exists without a module
        const modules = Array.from(ids)
            .map(id => this.modules.get(id))
            .filter(Boolean);

        // Sort by priority (descending). Modules without priority have default 0.
        modules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        // Log the result
        MonitoringService?.info('Found modules for intent', { 
            intent: capability,
            count: modules.length,
            moduleIds: modules.map(m => m.id),
            timestamp: new Date().toISOString()
        }, 'module') || 
            console.info(`[MCP MODULE] Found ${modules.length} module(s) for intent: ${capability}`);
        
        // Track performance metric
        const elapsedTime = Date.now() - startTime;
        MonitoringService?.trackMetric('intent_lookup_time', elapsedTime, {
            intent: capability,
            found: true,
            count: modules.length,
            timestamp: new Date().toISOString()
        });
        
        // Emit event for real-time UI updates if logEmitter is available
        try {
            if (MonitoringService?.logEmitter && typeof MonitoringService.logEmitter.emit === 'function') {
                MonitoringService.logEmitter.emit('modulesFoundForIntent', {
                    event: 'modulesFoundForIntent',
                    data: {
                        intent: capability,
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
     * Returns all capabilities registered in the system.
     * @returns {Array<string>}
     */
    // TODO: [listCapabilities] Alphabetically sort output (LOW) - Implemented
    listCapabilities() {
        // Get keys and sort them alphabetically
        const capabilities = Array.from(this.capabilityMap.keys()).sort();
        
        // Log the request and result
        MonitoringService?.debug('Listing all capabilities', { 
            count: capabilities.length,
            capabilities,
            timestamp: new Date().toISOString()
        }, 'module') || 
            console.debug(`[MCP MODULE] Listing all capabilities (${capabilities.length})`);
        
        return capabilities;
    }

    // TODO: [getRegistrationInfo] New method to return module registration timestamp. (LOW) - Implemented
    /**
     * Gets registration information for a specific module.
     * @param {string} moduleId - The ID of the module.
     * @returns {object|null} An object containing registration info (like timestamp) or null if not found.
     */
    getRegistrationInfo(moduleId) {
        // Log the request
        MonitoringService?.debug('Getting module registration info', { 
            moduleId,
            timestamp: new Date().toISOString()
        }, 'module');
        
        const registrationTime = this.registrationTimestamps.get(moduleId);
        if (!registrationTime) {
            // Log warning for module not found
            MonitoringService?.warn('No registration timestamp found', { 
                moduleId,
                timestamp: new Date().toISOString()
            }, 'module') || 
                console.warn(`[MCP MODULE] No registration timestamp found for module ID '${moduleId}'`);
            
            return null;
        }
        
        const registrationInfo = {
            registrationTime: registrationTime
            // Add other info like state here in the future
        };
        
        // Log the result
        MonitoringService?.debug('Retrieved module registration timestamp', { 
            moduleId,
            registeredAt: registrationTime,
            timestamp: new Date().toISOString()
        }, 'module') || 
            console.debug(`[MCP MODULE] Retrieved registration timestamp for module '${moduleId}'`);
        
        return registrationInfo;
    }
}

module.exports = new ModuleRegistry();
