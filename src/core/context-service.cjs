/**
 * @fileoverview ContextService - Manages conversation/session context for MCP.
 * Provides context enrichment, retrieval, update, and reset. Async, modular, and testable.
 * Aligned with phase1_architecture.md and project rules.
 */

const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');

// Log service initialization
MonitoringService.info('Context service initialized', {
    serviceName: 'context-service',
    timestamp: new Date().toISOString()
}, 'context');

class ContextService {
    /**
     * @param {object} storageService - Optional persistent storage
     */
    constructor(storageService) {
        const storageService = require('./storage-service.cjs');
        this.storageService = storageService;
        this._context = {
            conversationHistory: [],
            currentIntent: null,
            currentEntities: {},
            userProfile: null,
            currentTopic: null,
            recentEntities: {},
        };
        
        MonitoringService.info('Context service instance created', {
            hasStorageService: !!this.storageService,
            timestamp: new Date().toISOString()
        }, 'context');
    }

    /**
     * Update context with arbitrary fields (e.g., topic, entities)
     * @param {object} update
     * @returns {Promise<void>}
     */
    async updateContext(update) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Context update started', {
                updateKeys: Object.keys(update || {}),
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            if (!update || typeof update !== 'object') {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'Context update must be an object',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        updateType: typeof update,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            const previousContextSize = JSON.stringify(this._context).length;
            
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
            
            const newContextSize = JSON.stringify(this._context).length;
            const executionTime = Date.now() - startTime;
            
            MonitoringService.trackMetric('context_update_success', executionTime, {
                updateKeys: Object.keys(update).length,
                previousSize: previousContextSize,
                newSize: newContextSize,
                timestamp: new Date().toISOString()
            });
            
            // Track context size for memory monitoring
            MonitoringService.trackMetric('context_size_bytes', newContextSize, {
                operation: 'update',
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('context_update_failure', executionTime, {
                    errorType: error.code || 'validation_error',
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            // Otherwise, wrap in MCP error
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Context update failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    updateKeys: Object.keys(update || {}),
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('context_update_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Get the current context (for LLM prompting, etc)
     * @returns {Promise<object>}
     */
    async getCurrentContext() {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Getting current context', {
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            if (this.storageService && typeof this.storageService.getSetting === 'function') {
                const stored = await this.storageService.getSetting('context');
                if (stored) {
                    this._context = { ...this._context, ...stored };
                }
            }
            
            const context = { ...this._context };
            const contextSize = JSON.stringify(context).length;
            const executionTime = Date.now() - startTime;
            
            MonitoringService.trackMetric('context_get_success', executionTime, {
                contextSize,
                conversationLength: context.conversationHistory?.length || 0,
                hasIntent: !!context.currentIntent,
                hasTopic: !!context.currentTopic,
                timestamp: new Date().toISOString()
            });
            
            return context;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to get current context: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('context_get_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Add a message to the conversation history
     * @param {string} role - 'user' | 'assistant'
     * @param {string} text - Message text
     * @param {object} [meta] - Optional metadata (intent, entities, etc)
     * @returns {Promise<void>}
     */
    async addToConversation(role, text, meta = {}) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Adding conversation entry', {
                role,
                textLength: text?.length || 0,
                metaKeys: Object.keys(meta || {}),
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            if (!role || typeof role !== 'string') {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'Role must be a non-empty string',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        role,
                        roleType: typeof role,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            if (!text || typeof text !== 'string') {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    'Text must be a non-empty string',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        text,
                        textType: typeof text,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            const entry = {
                role,
                text,
                ...meta,
                ts: new Date().toISOString()
            };
            
            const previousHistoryLength = this._context.conversationHistory.length;
            this._context.conversationHistory.push(entry);
            
            if (this.storageService && typeof this.storageService.addHistory === 'function') {
                await this.storageService.addHistory(role, entry);
            }
            
            await this._persistContext();
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('conversation_add_success', executionTime, {
                role,
                textLength: text.length,
                previousLength: previousHistoryLength,
                newLength: this._context.conversationHistory.length,
                timestamp: new Date().toISOString()
            });
            
            MonitoringService.info('Conversation entry added', {
                role,
                textLength: text.length,
                conversationLength: this._context.conversationHistory.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'context');
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('conversation_add_failure', executionTime, {
                    role,
                    errorType: error.code || 'validation_error',
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            // Otherwise, wrap in MCP error
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to add conversation entry: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    role,
                    textLength: text?.length || 0,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('conversation_add_failure', executionTime, {
                role,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Get conversation history (optionally limited)
     * @param {number} [limit]
     * @returns {Promise<Array<object>>}
     */
    async getConversationHistory(limit = 20) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Getting conversation history', {
                limit,
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            let history;
            
            if (this.storageService && typeof this.storageService.getHistory === 'function') {
                history = await this.storageService.getHistory(limit);
            } else {
                history = this._context.conversationHistory.slice(-limit);
            }
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('conversation_history_get_success', executionTime, {
                limit,
                resultCount: history.length,
                usedStorage: !!(this.storageService && typeof this.storageService.getHistory === 'function'),
                timestamp: new Date().toISOString()
            });
            
            return history;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to get conversation history: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    limit,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('conversation_history_get_failure', executionTime, {
                limit,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Reset context (e.g., on user sign-out)
     * @returns {Promise<void>}
     */
    async resetContext() {
        const startTime = Date.now();
        
        try {
            const previousContextSize = JSON.stringify(this._context).length;
            const previousHistoryLength = this._context.conversationHistory.length;
            
            MonitoringService.info('Resetting conversation context', {
                previousContextSize,
                previousHistoryLength,
                timestamp: new Date().toISOString()
            }, 'context');
            
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
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('context_reset_success', executionTime, {
                clearedHistoryLength: previousHistoryLength,
                clearedContextSize: previousContextSize,
                timestamp: new Date().toISOString()
            });
            
            MonitoringService.info('Context reset completed successfully', {
                clearedHistoryLength: previousHistoryLength,
                clearedContextSize: previousContextSize,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'context');
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Context reset failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('context_reset_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
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
        const startTime = Date.now();
        
        try {
            if (this.storageService && typeof this.storageService.setSetting === 'function') {
                const contextSize = JSON.stringify(this._context).length;
                
                await this.storageService.setSetting('context', this._context);
                
                const executionTime = Date.now() - startTime;
                MonitoringService.trackMetric('context_persist_success', executionTime, {
                    contextSize,
                    timestamp: new Date().toISOString()
                });
                
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Context persisted to storage', {
                        contextSize,
                        executionTimeMs: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'context');
                }
            }
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Context persistence failed: ${error.message}`,
                ErrorService.SEVERITIES.WARNING,
                {
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('context_persist_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            // Don't throw here - persistence failure shouldn't break the main operation
        }
    }
}

module.exports = ContextService;
