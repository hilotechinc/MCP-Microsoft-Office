/**
 * @fileoverview ModuleRegistry - Manages discovery and lifecycle of MCP modules.
 * Follows MCP modularity, explicit interface, and dependency injection rules.
 */

/**
 * @fileoverview ModuleRegistry - Manages discovery and lifecycle of MCP modules.
 * Supports capability registration and lookup. Aligned with MCP modularity, explicit interface, and dependency injection rules.
 */

class ModuleRegistry {
    constructor() {
        /** @type {Map<string, object>} */
        this.modules = new Map();
        /** @type {Map<string, Set<string>>} */
        this.capabilityMap = new Map(); // capability -> Set of module ids
    }

    /**
     * Registers a module with the registry and its capabilities.
     * @param {object} module - Must have id, name, capabilities, init, handleIntent
     */
    registerModule(module) {
        if (!module || typeof module !== 'object' || !module.id) {
            throw new Error('Invalid module: must have id');
        }
        if (this.modules.has(module.id)) {
            throw new Error(`Module with id '${module.id}' already registered`);
        }
        this.modules.set(module.id, module);
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
     * @returns {object|undefined}
     */
    getModule(id) {
        return this.modules.get(id);
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
    findModulesForIntent(capability) {
        const ids = this.capabilityMap.get(capability);
        if (!ids) return [];
        return Array.from(ids).map(id => this.modules.get(id)).filter(Boolean);
    }

    /**
     * Returns all capabilities registered in the system.
     * @returns {Array<string>}
     */
    listCapabilities() {
        return Array.from(this.capabilityMap.keys());
    }
}

module.exports = new ModuleRegistry();
