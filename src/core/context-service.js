/**
 * @fileoverview ContextService - Manages conversation/session context for MCP.
 * Provides context enrichment, retrieval, update, and reset. Async, modular, and testable.
 * Aligned with phase1_architecture.md and project rules.
 */

class ContextService {
    /**
     * @param {object} storageService - Optional persistent storage
     */
    constructor(storageService) {
        this.storageService = storageService;
        this._context = {
            conversationHistory: [],
            currentIntent: null,
            currentEntities: {},
            userProfile: null,
            currentTopic: null,
            recentEntities: {},
        };
    }

    /**
     * Update context with arbitrary fields (e.g., topic, entities)
     * @param {object} update
     * @returns {Promise<void>}
     */
    async updateContext(update) {
        // Merge update into context
        if (update.currentEntities) {
            // Track recent entities across turns
            this._context.recentEntities = this._mergeEntities(this._context.recentEntities, update.currentEntities);
        }
        if (update.currentTopic) {
            this._context.currentTopic = update.currentTopic;
        } else if (update.currentIntent) {
            // Simple topic detection: use intent as topic if topic not provided
            this._context.currentTopic = this._detectTopic(update.currentIntent);
        }
        Object.assign(this._context, update);
        await this._persistContext();
    }

    /**
     * Get the current context (for LLM prompting, etc)
     * @returns {Promise<object>}
     */
    async getCurrentContext() {
        if (this.storageService && typeof this.storageService.getSetting === 'function') {
            const stored = await this.storageService.getSetting('context');
            if (stored) this._context = { ...this._context, ...stored };
        }
        return { ...this._context };
    }

    /**
     * Add a message to the conversation history
     * @param {string} role - 'user' | 'assistant'
     * @param {string} text - Message text
     * @param {object} [meta] - Optional metadata (intent, entities, etc)
     * @returns {Promise<void>}
     */
    async addToConversation(role, text, meta = {}) {
        const entry = {
            role,
            text,
            ...meta,
            ts: new Date().toISOString()
        };
        this._context.conversationHistory.push(entry);
        if (this.storageService && typeof this.storageService.addHistory === 'function') {
            await this.storageService.addHistory(role, entry);
        }
        await this._persistContext();
    }

    /**
     * Get conversation history (optionally limited)
     * @param {number} [limit]
     * @returns {Promise<Array<object>>}
     */
    async getConversationHistory(limit = 20) {
        if (this.storageService && typeof this.storageService.getHistory === 'function') {
            return await this.storageService.getHistory(limit);
        }
        return this._context.conversationHistory.slice(-limit);
    }

    /**
     * Reset context (e.g., on user sign-out)
     * @returns {Promise<void>}
     */
    async resetContext() {
        this._context = {
            conversationHistory: [],
            currentIntent: null,
            currentEntities: {},
            userProfile: null,
            currentTopic: null,
            recentEntities: {},
        };
        if (this.storageService && typeof this.storageService.clearConversationHistory === 'function') {
            await this.storageService.clearConversationHistory();
        }
        await this._persistContext();
    }

    /**
     * Merge entities across turns for recentEntities
     * @private
     */
    _mergeEntities(prev, next) {
        const merged = { ...prev };
        for (const [key, value] of Object.entries(next)) {
            if (!merged[key]) merged[key] = [];
            if (Array.isArray(value)) {
                merged[key] = [...merged[key], ...value];
            } else {
                merged[key].push(value);
            }
        }
        // Deduplicate
        for (const key in merged) {
            merged[key] = Array.from(new Set(merged[key].map(v => JSON.stringify(v)))).map(v => JSON.parse(v));
        }
        return merged;
    }

    /**
     * Simple topic detection from intent
     * @private
     */
    _detectTopic(intent) {
        if (!intent) return null;
        if (/mail|email/i.test(intent)) return 'emails';
        if (/calendar|event/i.test(intent)) return 'calendar';
        if (/file|document/i.test(intent)) return 'files';
        return intent;
    }

    /**
     * Persist context to storage
     * @private
     */
    async _persistContext() {
        if (this.storageService && typeof this.storageService.setSetting === 'function') {
            await this.storageService.setSetting('context', this._context);
        }
    }
}

module.exports = ContextService;
