/**
 * @fileoverview Intent Router - Maps intents to modules, provides confidence scoring, fallback patterns, and disambiguation.
 * Follows MCP modularity, async, and testable design. Aligned with phase1_architecture.md and project rules.
 */

const moduleRegistry = require('../modules/module-registry');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

// Log service initialization
MonitoringService.info('Intent Router initialized', {
    serviceName: 'intent-router',
    timestamp: new Date().toISOString()
}, 'nlu');

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
     * @param {string} [userId] - User ID for context
     * @param {string} [sessionId] - Session ID for context
     * @returns {Array<object>} Array of module objects
     */
    findModulesForIntent(intent, options = {}, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Finding modules for intent', {
                method: 'findModulesForIntent',
                intent: intent,
                options: options,
                userId: userId ? userId.substring(0, 20) + '...' : undefined,
                sessionId: sessionId ? sessionId.substring(0, 8) + '...' : undefined,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            if (!intent || typeof intent !== 'string') {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'nlu',
                    'Intent must be a non-empty string',
                    'error',
                    {
                        service: 'intent-router',
                        method: 'findModulesForIntent',
                        intentType: typeof intent,
                        userId: userId,
                        sessionId: sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('Intent validation failed', {
                        error: 'Intent must be a non-empty string',
                        intentType: typeof intent,
                        timestamp: new Date().toISOString()
                    }, 'nlu', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('Intent validation failed', {
                        sessionId: sessionId,
                        error: 'Intent must be a non-empty string',
                        intentType: typeof intent,
                        timestamp: new Date().toISOString()
                    }, 'nlu');
                }
                
                throw mcpError;
            }
            
            const modules = moduleRegistry.findModulesForIntent(intent) || [];
            // Optionally, add scoring or ranking logic
            const result = modules.map(m => ({ ...m, confidence: 1.0 }));
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Modules found for intent successfully', {
                    intent: intent,
                    moduleCount: result.length,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Modules found for intent successfully', {
                    sessionId: sessionId,
                    intent: intent,
                    moduleCount: result.length,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            MonitoringService.trackMetric('intent_router_find_modules_success', executionTime, {
                service: 'intent-router',
                method: 'findModulesForIntent',
                intent: intent,
                moduleCount: result.length,
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            // Pattern 1: Development Debug Logs (success)
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Modules found for intent completed', {
                    intent: intent,
                    moduleCount: result.length,
                    executionTimeMs: executionTime,
                    userId: userId ? userId.substring(0, 20) + '...' : undefined,
                    sessionId: sessionId ? sessionId.substring(0, 8) + '...' : undefined,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('intent_router_find_modules_failure', executionTime, {
                    service: 'intent-router',
                    method: 'findModulesForIntent',
                    intent: intent,
                    errorType: error.code || 'validation_error',
                    userId: userId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'nlu',
                `Failed to find modules for intent: ${error.message}`,
                'error',
                {
                    service: 'intent-router',
                    method: 'findModulesForIntent',
                    intent: intent,
                    stack: error.stack,
                    userId: userId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Failed to find modules for intent', {
                    error: error.message,
                    intent: intent,
                    timestamp: new Date().toISOString()
                }, 'nlu', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Failed to find modules for intent', {
                    sessionId: sessionId,
                    error: error.message,
                    intent: intent,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            MonitoringService.trackMetric('intent_router_find_modules_failure', executionTime, {
                service: 'intent-router',
                method: 'findModulesForIntent',
                intent: intent,
                errorType: error.code || 'unknown',
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    },

    /**
     * Matches a query string to a fallback intent using patterns.
     * @param {string} query
     * @param {string} [userId] - User ID for context
     * @param {string} [sessionId] - Session ID for context
     * @returns {string|null} intent if matched, else null
     */
    matchPatterns(query, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Pattern matching started', {
                method: 'matchPatterns',
                queryLength: query ? query.length : 0,
                queryPreview: query ? query.substring(0, 50) + '...' : undefined,
                userId: userId ? userId.substring(0, 20) + '...' : undefined,
                sessionId: sessionId ? sessionId.substring(0, 8) + '...' : undefined,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            if (!query || typeof query !== 'string') {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'nlu',
                    'Query must be a non-empty string',
                    'error',
                    {
                        service: 'intent-router',
                        method: 'matchPatterns',
                        queryType: typeof query,
                        userId: userId,
                        sessionId: sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('Query validation failed', {
                        error: 'Query must be a non-empty string',
                        queryType: typeof query,
                        timestamp: new Date().toISOString()
                    }, 'nlu', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('Query validation failed', {
                        sessionId: sessionId,
                        error: 'Query must be a non-empty string',
                        queryType: typeof query,
                        timestamp: new Date().toISOString()
                    }, 'nlu');
                }
                
                throw mcpError;
            }
            
            let matchedResult = { intent: null, confidence: 0 };
            
            for (const { pattern, intent, confidence } of INTENT_PATTERNS) {
                if (pattern.test(query)) {
                    matchedResult = { intent, confidence };
                    break;
                }
            }
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Pattern matching completed successfully', {
                    queryLength: query.length,
                    matched: !!matchedResult.intent,
                    matchedIntent: matchedResult.intent,
                    confidence: matchedResult.confidence,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Pattern matching completed successfully', {
                    sessionId: sessionId,
                    queryLength: query.length,
                    matched: !!matchedResult.intent,
                    matchedIntent: matchedResult.intent,
                    confidence: matchedResult.confidence,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            MonitoringService.trackMetric('intent_router_pattern_match_success', executionTime, {
                service: 'intent-router',
                method: 'matchPatterns',
                queryLength: query.length,
                matched: !!matchedResult.intent,
                matchedIntent: matchedResult.intent,
                confidence: matchedResult.confidence,
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            // Pattern 1: Development Debug Logs (success)
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Pattern matching completed', {
                    queryLength: query.length,
                    queryPreview: query.substring(0, 50) + '...',
                    matched: !!matchedResult.intent,
                    matchedIntent: matchedResult.intent,
                    confidence: matchedResult.confidence,
                    executionTimeMs: executionTime,
                    userId: userId ? userId.substring(0, 20) + '...' : undefined,
                    sessionId: sessionId ? sessionId.substring(0, 8) + '...' : undefined,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            return matchedResult;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('intent_router_pattern_match_failure', executionTime, {
                    service: 'intent-router',
                    method: 'matchPatterns',
                    queryLength: query ? query.length : 0,
                    errorType: error.code || 'validation_error',
                    userId: userId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'nlu',
                `Pattern matching failed: ${error.message}`,
                'error',
                {
                    service: 'intent-router',
                    method: 'matchPatterns',
                    queryLength: query ? query.length : 0,
                    stack: error.stack,
                    userId: userId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Pattern matching failed', {
                    error: error.message,
                    queryLength: query ? query.length : 0,
                    timestamp: new Date().toISOString()
                }, 'nlu', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Pattern matching failed', {
                    sessionId: sessionId,
                    error: error.message,
                    queryLength: query ? query.length : 0,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            MonitoringService.trackMetric('intent_router_pattern_match_failure', executionTime, {
                service: 'intent-router',
                method: 'matchPatterns',
                queryLength: query ? query.length : 0,
                errorType: error.code || 'unknown',
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    },

    /**
     * Disambiguates between multiple possible intents (stub for now).
     * @param {Array<string>} intents
     * @param {object} context
     * @param {string} [userId] - User ID for context
     * @param {string} [sessionId] - Session ID for context
     * @returns {string|null}
     */
    disambiguate(intents, context = {}, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Intent disambiguation started', {
                method: 'disambiguate',
                intentCount: intents ? intents.length : 0,
                context: context,
                userId: userId ? userId.substring(0, 20) + '...' : undefined,
                sessionId: sessionId ? sessionId.substring(0, 8) + '...' : undefined,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            if (!Array.isArray(intents)) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'nlu',
                    'Intents must be an array',
                    'error',
                    {
                        service: 'intent-router',
                        method: 'disambiguate',
                        intentsType: typeof intents,
                        userId: userId,
                        sessionId: sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('Intent disambiguation validation failed', {
                        error: 'Intents must be an array',
                        intentsType: typeof intents,
                        timestamp: new Date().toISOString()
                    }, 'nlu', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('Intent disambiguation validation failed', {
                        sessionId: sessionId,
                        error: 'Intents must be an array',
                        intentsType: typeof intents,
                        timestamp: new Date().toISOString()
                    }, 'nlu');
                }
                
                throw mcpError;
            }
            
            // Stub: return highest confidence or ask user
            const result = intents && intents.length ? intents[0] : null;
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Intent disambiguation completed successfully', {
                    intentCount: intents.length,
                    selectedIntent: result,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Intent disambiguation completed successfully', {
                    sessionId: sessionId,
                    intentCount: intents.length,
                    selectedIntent: result,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            MonitoringService.trackMetric('intent_router_disambiguate_success', executionTime, {
                service: 'intent-router',
                method: 'disambiguate',
                intentCount: intents.length,
                selectedIntent: result,
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            // Pattern 1: Development Debug Logs (success)
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Intent disambiguation completed', {
                    intentCount: intents.length,
                    selectedIntent: result,
                    executionTimeMs: executionTime,
                    userId: userId ? userId.substring(0, 20) + '...' : undefined,
                    sessionId: sessionId ? sessionId.substring(0, 8) + '...' : undefined,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('intent_router_disambiguate_failure', executionTime, {
                    service: 'intent-router',
                    method: 'disambiguate',
                    intentCount: intents ? intents.length : 0,
                    errorType: error.code || 'validation_error',
                    userId: userId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'nlu',
                `Intent disambiguation failed: ${error.message}`,
                'error',
                {
                    service: 'intent-router',
                    method: 'disambiguate',
                    intentCount: intents ? intents.length : 0,
                    stack: error.stack,
                    userId: userId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Intent disambiguation failed', {
                    error: error.message,
                    intentCount: intents ? intents.length : 0,
                    timestamp: new Date().toISOString()
                }, 'nlu', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Intent disambiguation failed', {
                    sessionId: sessionId,
                    error: error.message,
                    intentCount: intents ? intents.length : 0,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            MonitoringService.trackMetric('intent_router_disambiguate_failure', executionTime, {
                service: 'intent-router',
                method: 'disambiguate',
                intentCount: intents ? intents.length : 0,
                errorType: error.code || 'unknown',
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }
};

module.exports = IntentRouter;
