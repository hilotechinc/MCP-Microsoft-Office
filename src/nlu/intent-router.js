/**
 * @fileoverview Intent Router - Maps intents to modules, provides confidence scoring, fallback patterns, and disambiguation.
 * Follows MCP modularity, async, and testable design. Aligned with phase1_architecture.md and project rules.
 */

const moduleRegistry = require('../modules/module-registry');

const INTENT_PATTERNS = [
    { pattern: /what emails/i, intent: 'readMail', confidence: 0.9 },
    { pattern: /unread emails/i, intent: 'getUnreadMail', confidence: 0.9 },
    { pattern: /calendar|event/i, intent: 'getEvents', confidence: 0.8 },
    { pattern: /files|documents/i, intent: 'listFiles', confidence: 0.8 },
    // Add more patterns as needed
];

const IntentRouter = {
    /**
     * Finds modules that can handle a given intent, sorted by confidence.
     * @param {string} intent
     * @param {object} [options]
     * @returns {Array<object>} Array of module objects
     */
    findModulesForIntent(intent, options = {}) {
        const modules = moduleRegistry.findModulesForIntent(intent) || [];
        // Optionally, add scoring or ranking logic
        return modules.map(m => ({ ...m, confidence: 1.0 }));
    },

    /**
     * Matches a query string to a fallback intent using patterns.
     * @param {string} query
     * @returns {string|null} intent if matched, else null
     */
    matchPatterns(query) {
        for (const { pattern, intent, confidence } of INTENT_PATTERNS) {
            if (pattern.test(query)) {
                return { intent, confidence };
            }
        }
        return { intent: null, confidence: 0 };
    },

    /**
     * Disambiguates between multiple possible intents (stub for now).
     * @param {Array<string>} intents
     * @param {object} context
     * @returns {string|null}
     */
    disambiguate(intents, context = {}) {
        // Stub: return highest confidence or ask user
        return intents && intents.length ? intents[0] : null;
    }
};

module.exports = IntentRouter;
