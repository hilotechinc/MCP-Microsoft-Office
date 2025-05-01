/**
 * @fileoverview ModuleRegistry - Manages discovery and lifecycle of MCP modules.
 * Follows MCP modularity, explicit interface, and dependency injection rules.
 */

/**
 * @fileoverview ModuleRegistry - Manages discovery and lifecycle of MCP modules.
 * Supports capability registration and lookup. Aligned with MCP modularity, explicit interface, and dependency injection rules.
 */

class ModuleRegistry {
    // TODO: [constructor] Accept logger via DI; track registration timestamps. (LOW) - Implemented
    constructor(options = {}) {
        this.logger = options.logger || console; // Default to console if no logger provided
        /** @type {Map<string, object>} */
        this.modules = new Map();
        /** @type {Map<string, Set<string>>} */
        this.capabilityMap = new Map(); // capability -> Set of module ids
        /** @type {Map<string, Date>} */
        this.registrationTimestamps = new Map(); // module.id -> registration time
    }

    /**
     * Registers a module with the registry and its capabilities.
     * @param {object} module - Must have id, name, capabilities, init, handleIntent
     */
    // TODO: [registerModule] Validate module interface contract (MEDIUM) - Implemented (basic validation)
    registerModule(module) {
        if (!module || typeof module !== 'object' || !module.id) {
            this.logger.error('ModuleRegistry.registerModule: Invalid module object or missing ID.', { moduleObject: module });
            throw new Error('Invalid module: must have id');
        }
        if (this.modules.has(module.id)) {
            this.logger.error(`ModuleRegistry.registerModule: Module with ID '${module.id}' already registered.`);
            throw new Error(`Module with id '${module.id}' already registered`);
        }

        // Validate interface contract
        const requiredProps = {
            id: 'string',
            name: 'string',
            capabilities: 'array', // Technically should check if it's Array.isArray
            init: 'function',
            handleIntent: 'function'
        };
        const optionalProps = {
            priority: 'number' // Added for future sorting
        };

        for (const prop in requiredProps) {
            if (typeof module[prop] !== requiredProps[prop] && !(prop === 'capabilities' && Array.isArray(module[prop]))) {
                const errorMsg = `ModuleRegistry.registerModule: Module '${module.id}' missing or invalid required property '${prop}'. Expected type '${requiredProps[prop]}'.`;
                this.logger.error(errorMsg, { module });
                throw new Error(errorMsg);
            }
        }
        for (const prop in optionalProps) {
            if (module.hasOwnProperty(prop) && typeof module[prop] !== optionalProps[prop]) {
                this.logger.warn(`ModuleRegistry.registerModule: Module '${module.id}' has optional property '${prop}' with incorrect type. Expected '${optionalProps[prop]}'.`, { module });
                // Do not throw, but log warning
            }
        }

        // Store a normalized module object (future: perhaps copy props selectively)
        const moduleToStore = { ...module, priority: module.priority || 0 }; // Default priority 0

        this.modules.set(module.id, moduleToStore);
        this.registrationTimestamps.set(module.id, new Date()); // Track registration time
        // Register capabilities
        if (Array.isArray(module.capabilities)) {
            for (const cap of module.capabilities) {
                if (!this.capabilityMap.has(cap)) this.capabilityMap.set(cap, new Set());
                this.capabilityMap.get(cap).add(module.id);
            }
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
        const { strict = false } = options;
        const module = this.modules.get(id);

        if (!module && strict) {
            const errorMsg = `ModuleRegistry.getModule: Module with ID '${id}' not found (strict mode enabled).`;
            this.logger.error(errorMsg);
            throw new Error(errorMsg);
        }

        return module; // Returns the module or undefined if not found and strict is false
    }

    /**
     * Returns all registered modules.
     * @returns {Array<object>}
     */
    getAllModules() {
        return Array.from(this.modules.values());
    }

    /**
     * Finds all modules that support a given capability/intent.
     * @param {string} capability
     * @returns {Array<object>} Modules supporting the capability
     */
    // TODO: [findModulesForIntent] Return by priority when multiple modules share capability (LOW) - Implemented
    findModulesForIntent(capability) {
        const ids = this.capabilityMap.get(capability);
        if (!ids || ids.size === 0) {
            this.logger.debug(`findModulesForIntent: No modules found for capability '${capability}'.`); // Use debug level
            return [];
        }

        // Retrieve modules and filter out any potential nulls if an ID somehow exists without a module
        const modules = Array.from(ids)
            .map(id => this.modules.get(id))
            .filter(Boolean);

        // Sort by priority (descending). Modules without priority have default 0.
        modules.sort((a, b) => (b.priority || 0) - (a.priority || 0));

        this.logger.debug(`findModulesForIntent: Found ${modules.length} module(s) for capability '${capability}', sorted by priority.`, { capability, moduleIds: modules.map(m => m.id) });
        return modules;
    }

    /**
     * Returns all capabilities registered in the system.
     * @returns {Array<string>}
     */
    // TODO: [listCapabilities] Alphabetically sort output (LOW) - Implemented
    listCapabilities() {
        // Get keys and sort them alphabetically
        return Array.from(this.capabilityMap.keys()).sort();
    }

    // TODO: [getRegistrationInfo] New method to return module registration timestamp. (LOW) - Implemented
    /**
     * Gets registration information for a specific module.
     * @param {string} moduleId - The ID of the module.
     * @returns {object|null} An object containing registration info (like timestamp) or null if not found.
     */
    getRegistrationInfo(moduleId) {
        const registrationTime = this.registrationTimestamps.get(moduleId);
        if (!registrationTime) {
            this.logger.warn(`getRegistrationInfo: No registration timestamp found for module ID '${moduleId}'.`);
            return null;
        }
        return {
            registrationTime: registrationTime
            // Add other info like state here in the future
        };
    }
}

module.exports = new ModuleRegistry();
