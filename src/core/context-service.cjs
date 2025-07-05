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
     * @param {string} userId - Optional user ID for multi-user context isolation
     * @param {object} storageService - Optional persistent storage
     */
    constructor(userId = null, storageService) {
        const storageService = require('./storage-service.cjs');
        this.storageService = storageService;
        this.userId = userId; // Store user ID for multi-user context isolation
        this._context = {
            conversationHistory: [],
            currentIntent: null,
            currentEntities: {},
            userProfile: null,
            currentTopic: null,
            recentEntities: {},
            userId: userId, // Include userId in context state
        };
        
        MonitoringService.info('Context service instance created', {
            hasStorageService: !!this.storageService,
            userId: userId,
            timestamp: new Date().toISOString()
        }, 'context');
    }

    /**
     * Update context with arbitrary fields (e.g., topic, entities)
     * @param {object} update
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<void>}
     */
    async updateContext(update, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing context update request', {
                updateKeys: Object.keys(update || {}),
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            if (!update || typeof update !== 'object') {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'context',
                    'Context update must be an object',
                    'warning',
                    {
                        updateType: typeof update,
                        userId,
                        sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('Context update validation failed', {
                        error: 'Invalid update object',
                        updateType: typeof update,
                        timestamp: new Date().toISOString()
                    }, 'context', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('Context update validation failed', {
                        sessionId,
                        error: 'Invalid update object',
                        updateType: typeof update,
                        timestamp: new Date().toISOString()
                    }, 'context');
                }
                
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
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Context updated successfully', {
                    updateKeys: Object.keys(update).length,
                    previousSize: previousContextSize,
                    newSize: newContextSize,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Context updated with session', {
                    sessionId,
                    updateKeys: Object.keys(update).length,
                    previousSize: previousContextSize,
                    newSize: newContextSize,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
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
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'context',
                `Context update failed: ${error.message}`,
                'error',
                {
                    updateKeys: Object.keys(update || {}),
                    stack: error.stack,
                    userId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Context update failed', {
                    error: error.message,
                    updateKeys: Object.keys(update || {}),
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Context update failed', {
                    sessionId,
                    error: error.message,
                    updateKeys: Object.keys(update || {}),
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
            MonitoringService.trackMetric('context_update_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Get the current context (for LLM prompting, etc)
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<object>}
     */
    async getCurrentContext(userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing get current context request', {
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            if (this.storageService && typeof this.storageService.getSetting === 'function') {
                const contextKey = this.userId ? `user:${this.userId}:context` : 'context';
                const stored = await this.storageService.getSetting(contextKey);
                if (stored) {
                    this._context = { ...this._context, ...stored };
                }
            }
            
            const context = { ...this._context };
            const contextSize = JSON.stringify(context).length;
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Context retrieved successfully', {
                    contextSize,
                    conversationLength: context.conversationHistory?.length || 0,
                    hasIntent: !!context.currentIntent,
                    hasTopic: !!context.currentTopic,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Context retrieved with session', {
                    sessionId,
                    contextSize,
                    conversationLength: context.conversationHistory?.length || 0,
                    hasIntent: !!context.currentIntent,
                    hasTopic: !!context.currentTopic,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
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
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'context',
                `Failed to get current context: ${error.message}`,
                'error',
                {
                    stack: error.stack,
                    userId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Context retrieval failed', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Context retrieval failed', {
                    sessionId,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
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
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<void>}
     */
    async addToConversation(role, text, meta = {}, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing add conversation entry request', {
                role,
                textLength: text?.length || 0,
                metaKeys: Object.keys(meta || {}),
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            if (!role || typeof role !== 'string') {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'context',
                    'Role must be a non-empty string',
                    'warning',
                    {
                        role,
                        roleType: typeof role,
                        userId,
                        sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('Conversation entry validation failed', {
                        error: 'Invalid role parameter',
                        role,
                        roleType: typeof role,
                        timestamp: new Date().toISOString()
                    }, 'context', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('Conversation entry validation failed', {
                        sessionId,
                        error: 'Invalid role parameter',
                        role,
                        roleType: typeof role,
                        timestamp: new Date().toISOString()
                    }, 'context');
                }
                
                throw mcpError;
            }
            
            if (!text || typeof text !== 'string') {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'context',
                    'Text must be a non-empty string',
                    'warning',
                    {
                        text,
                        textType: typeof text,
                        userId,
                        sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('Conversation entry validation failed', {
                        error: 'Invalid text parameter',
                        textType: typeof text,
                        timestamp: new Date().toISOString()
                    }, 'context', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('Conversation entry validation failed', {
                        sessionId,
                        error: 'Invalid text parameter',
                        textType: typeof text,
                        timestamp: new Date().toISOString()
                    }, 'context');
                }
                
                throw mcpError;
            }
            
            const entry = {
                role,
                text,
                ...meta,
                userId: this.userId, // Include userId for multi-user isolation
                ts: new Date().toISOString()
            };
            
            const previousHistoryLength = this._context.conversationHistory.length;
            this._context.conversationHistory.push(entry);
            
            if (this.storageService && typeof this.storageService.addHistory === 'function') {
                // Pass userId to storage service for user-specific history
                await this.storageService.addHistory(role, entry, this.userId);
            }
            
            await this._persistContext();
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Conversation entry added successfully', {
                    role,
                    textLength: text.length,
                    previousLength: previousHistoryLength,
                    newLength: this._context.conversationHistory.length,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Conversation entry added with session', {
                    sessionId,
                    role,
                    textLength: text.length,
                    previousLength: previousHistoryLength,
                    newLength: this._context.conversationHistory.length,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
            MonitoringService.trackMetric('conversation_add_success', executionTime, {
                role,
                textLength: text.length,
                previousLength: previousHistoryLength,
                newLength: this._context.conversationHistory.length,
                timestamp: new Date().toISOString()
            });
            
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
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'context',
                `Failed to add conversation entry: ${error.message}`,
                'error',
                {
                    role,
                    textLength: text?.length || 0,
                    stack: error.stack,
                    userId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Conversation entry addition failed', {
                    error: error.message,
                    role,
                    textLength: text?.length || 0,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Conversation entry addition failed', {
                    sessionId,
                    error: error.message,
                    role,
                    textLength: text?.length || 0,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
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
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<Array<object>>}
     */
    async getConversationHistory(limit = 20, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing get conversation history request', {
                limit,
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            let history;
            
            if (this.storageService && typeof this.storageService.getHistory === 'function') {
                history = await this.storageService.getHistory(limit, this.userId);
            } else {
                history = this._context.conversationHistory.slice(-limit);
            }
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Conversation history retrieved successfully', {
                    limit,
                    resultCount: history.length,
                    usedStorage: !!(this.storageService && typeof this.storageService.getHistory === 'function'),
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Conversation history retrieved with session', {
                    sessionId,
                    limit,
                    resultCount: history.length,
                    usedStorage: !!(this.storageService && typeof this.storageService.getHistory === 'function'),
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
            MonitoringService.trackMetric('conversation_history_get_success', executionTime, {
                limit,
                resultCount: history.length,
                usedStorage: !!(this.storageService && typeof this.storageService.getHistory === 'function'),
                timestamp: new Date().toISOString()
            });
            
            return history;
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'context',
                `Failed to get conversation history: ${error.message}`,
                'error',
                {
                    limit,
                    stack: error.stack,
                    userId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Conversation history retrieval failed', {
                    error: error.message,
                    limit,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Conversation history retrieval failed', {
                    sessionId,
                    error: error.message,
                    limit,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
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
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<void>}
     */
    async resetContext(userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing context reset request', {
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }, 'context');
        }
        
        try {
            const previousContextSize = JSON.stringify(this._context).length;
            const previousHistoryLength = this._context.conversationHistory.length;
            
            this._context = {
                conversationHistory: [],
                currentIntent: null,
                currentEntities: {},
                userProfile: null,
                currentTopic: null,
                recentEntities: {},
                userId: this.userId, // Preserve userId on reset
            };
            
            if (this.storageService && typeof this.storageService.clearConversationHistory === 'function') {
                await this.storageService.clearConversationHistory(this.userId);
            }
            
            await this._persistContext();
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Context reset completed successfully', {
                    clearedHistoryLength: previousHistoryLength,
                    clearedContextSize: previousContextSize,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Context reset completed with session', {
                    sessionId,
                    clearedHistoryLength: previousHistoryLength,
                    clearedContextSize: previousContextSize,
                    duration: executionTime,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
            MonitoringService.trackMetric('context_reset_success', executionTime, {
                clearedHistoryLength: previousHistoryLength,
                clearedContextSize: previousContextSize,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'context',
                `Context reset failed: ${error.message}`,
                'error',
                {
                    stack: error.stack,
                    userId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Context reset failed', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'context', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Context reset failed', {
                    sessionId,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'context');
            }
            
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
                
                // Use user-specific context key for multi-user isolation
                const contextKey = this.userId ? `user:${this.userId}:context` : 'context';
                await this.storageService.setSetting(contextKey, this._context, this.userId);
                
                const executionTime = Date.now() - startTime;
                MonitoringService.trackMetric('context_persist_success', executionTime, {
                    contextSize,
                    userId: this.userId,
                    timestamp: new Date().toISOString()
                });
                
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Context persisted to storage', {
                        contextSize,
                        userId: this.userId,
                        contextKey,
                        executionTimeMs: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'context');
                }
            }
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                'context',
                `Context persistence failed: ${error.message}`,
                'warning',
                {
                    userId: this.userId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('context_persist_failure', executionTime, {
                userId: this.userId,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            // Don't throw here - persistence failure shouldn't break the main operation
        }
    }
}

module.exports = ContextService;
