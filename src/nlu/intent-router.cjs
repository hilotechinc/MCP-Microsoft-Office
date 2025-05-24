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
     * @returns {Array<object>} Array of module objects
     */
    findModulesForIntent(intent, options = {}) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Finding modules for intent', {
                method: 'findModulesForIntent',
                intent: intent,
                options: options,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            if (!intent || typeof intent !== 'string') {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'Intent must be a non-empty string',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        service: 'intent-router',
                        method: 'findModulesForIntent',
                        intentType: typeof intent,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            const modules = moduleRegistry.findModulesForIntent(intent) || [];
            // Optionally, add scoring or ranking logic
            const result = modules.map(m => ({ ...m, confidence: 1.0 }));
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('intent_router_find_modules_success', executionTime, {
                service: 'intent-router',
                method: 'findModulesForIntent',
                intent: intent,
                moduleCount: result.length,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Modules found for intent', {
                    intent: intent,
                    moduleCount: result.length,
                    executionTimeMs: executionTime,
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
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to find modules for intent: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'intent-router',
                    method: 'findModulesForIntent',
                    intent: intent,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('intent_router_find_modules_failure', executionTime, {
                service: 'intent-router',
                method: 'findModulesForIntent',
                intent: intent,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    },

    /**
     * Matches a query string to a fallback intent using patterns.
     * @param {string} query
     * @returns {string|null} intent if matched, else null
     */
    matchPatterns(query) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Pattern matching started', {
                method: 'matchPatterns',
                queryLength: query ? query.length : 0,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            if (!query || typeof query !== 'string') {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'Query must be a non-empty string',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        service: 'intent-router',
                        method: 'matchPatterns',
                        queryType: typeof query,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
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
            MonitoringService.trackMetric('intent_router_pattern_match_success', executionTime, {
                service: 'intent-router',
                method: 'matchPatterns',
                queryLength: query.length,
                matched: !!matchedResult.intent,
                matchedIntent: matchedResult.intent,
                confidence: matchedResult.confidence,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Pattern matching completed', {
                    queryLength: query.length,
                    matched: !!matchedResult.intent,
                    matchedIntent: matchedResult.intent,
                    confidence: matchedResult.confidence,
                    executionTimeMs: executionTime,
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
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Pattern matching failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'intent-router',
                    method: 'matchPatterns',
                    queryLength: query ? query.length : 0,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('intent_router_pattern_match_failure', executionTime, {
                service: 'intent-router',
                method: 'matchPatterns',
                queryLength: query ? query.length : 0,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    },

    /**
     * Disambiguates between multiple possible intents (stub for now).
     * @param {Array<string>} intents
     * @param {object} context
     * @returns {string|null}
     */
    disambiguate(intents, context = {}) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Intent disambiguation started', {
                method: 'disambiguate',
                intentCount: intents ? intents.length : 0,
                context: context,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            if (!Array.isArray(intents)) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'Intents must be an array',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        service: 'intent-router',
                        method: 'disambiguate',
                        intentsType: typeof intents,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            // Stub: return highest confidence or ask user
            const result = intents && intents.length ? intents[0] : null;
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('intent_router_disambiguate_success', executionTime, {
                service: 'intent-router',
                method: 'disambiguate',
                intentCount: intents.length,
                selectedIntent: result,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Intent disambiguation completed', {
                    intentCount: intents.length,
                    selectedIntent: result,
                    executionTimeMs: executionTime,
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
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Intent disambiguation failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'intent-router',
                    method: 'disambiguate',
                    intentCount: intents ? intents.length : 0,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('intent_router_disambiguate_failure', executionTime, {
                service: 'intent-router',
                method: 'disambiguate',
                intentCount: intents ? intents.length : 0,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }
};

module.exports = IntentRouter;
