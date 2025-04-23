/**
 * @fileoverview discover-modules - Dynamically discovers and loads MCP modules from the modules directory.
 * Registers each found module with the ModuleRegistry.
 * Follows async, modular, and testable design.
 */

const fs = require('fs').promises;
const path = require('path');
const moduleRegistry = require('./module-registry');

/**
 * Discovers and registers all modules in the given directory.
 * Only files ending with .js and exporting required module interface are loaded.
 * @param {string} modulesDir - Absolute path to modules directory
 * @returns {Promise<Array<object>>} Array of registered modules
 */
async function discoverModules(modulesDir) {
    const files = await fs.readdir(modulesDir);
    const registered = [];
    for (const file of files) {
        if (!file.endsWith('.js') || file === 'module-registry.js' || file === 'discover-modules.js') continue;
        const modPath = path.join(modulesDir, file);
        const mod = require(modPath);
        // Must have id, name, capabilities, init, handleIntent
        if (mod && mod.id && mod.name && Array.isArray(mod.capabilities) && typeof mod.init === 'function' && typeof mod.handleIntent === 'function') {
            moduleRegistry.registerModule(mod);
            registered.push(mod);
        }
    }
    return registered;
}

module.exports = { discoverModules };
