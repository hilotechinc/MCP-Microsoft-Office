/**
 * @fileoverview intent-router - Routes intents to the appropriate MCP module(s) based on capability.
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 */

const moduleRegistry = require('./module-registry');

/**
 * Routes an intent to the first capable module.
 * @param {string} intent - The intent/capability to route
 * @param {object} entities - Intent entities (optional)
 * @param {object} context - Context for the intent (optional)
 * @returns {Promise<any>} Result from the module's handleIntent
 * @throws {Error} If no module supports the intent
 */
async function routeIntent(intent, entities = {}, context = {}) {
    const candidates = moduleRegistry.findModulesForIntent(intent);
    if (!candidates.length) {
        throw new Error(`No module found for intent: ${intent}`);
    }
    // Prioritize first registered module for now (could extend to all, or priority-based)
    const mod = candidates[0];
    if (typeof mod.handleIntent !== 'function') {
        throw new Error(`Module ${mod.id} missing handleIntent`);
    }
    return await mod.handleIntent(intent, entities, context);
}

/**
 * Finds all modules that can handle a given intent.
 * @param {string} intent
 * @returns {Array<object>} Modules supporting the intent
 */
function getModulesForIntent(intent) {
    return moduleRegistry.findModulesForIntent(intent);
}

module.exports = {
    routeIntent,
    getModulesForIntent
};
