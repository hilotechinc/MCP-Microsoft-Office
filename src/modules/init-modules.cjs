/**
 * @fileoverview init-modules - Initializes all discovered MCP modules with dependency injection.
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 */

const moduleRegistry = require('./module-registry');

/**
 * Initializes all registered modules with provided dependencies/services.
 * Calls each module's init(services) and replaces the module in the registry with the initialized instance.
 * @param {object} services - Dependency/service registry to inject
 * @returns {Promise<Array<object>>} Array of initialized modules
 */
async function initializeModules(services = {}) {
    const modules = moduleRegistry.getAllModules();
    const initialized = [];
    for (const mod of modules) {
        if (typeof mod.init === 'function') {
            const instance = await mod.init(services);
            // Replace the module in the registry with the initialized instance
            moduleRegistry.modules.set(mod.id, instance);
            initialized.push(instance);
        }
    }
    return initialized;
}

module.exports = { initializeModules };
