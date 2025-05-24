/**
 * @fileoverview NLU Agent - Coordinates natural language understanding for MCP.
 * Pipeline: LLM intent extraction, entity recognition, fallback, context-aware understanding.
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 */

const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

// Log service initialization
MonitoringService.info('NLU Agent initialized', {
    serviceName: 'nlu-agent',
    timestamp: new Date().toISOString()
}, 'nlu');

class NLUAgent {
    /**
     * @param {object} options
     * @param {function} [options.entityRecognizer]
     * @param {object} [options.contextService]
     * @param {object} [options.llmService] - Optional, for test injection
     */
    constructor({ entityRecognizer, contextService, llmService } = {}) {
        this.entityRecognizer = entityRecognizer || defaultEntityRecognizer;
        this.contextService = contextService || null;
        this.llmService = llmService || require('./llm-service');
    }

    /**
     * Main query processing pipeline: extract intent, entities, context.
     * @param {string} query - User input
     * @param {object} context - Optional dialog/session context
     * @returns {Promise<object>} { intent, entities, confidence, context }
     */
    async processQuery(query, context = {}) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('NLU query processing started', {
                method: 'processQuery',
                queryLength: query ? query.length : 0,
                hasContext: !!Object.keys(context).length,
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
                        service: 'nlu-agent',
                        method: 'processQuery',
                        queryType: typeof query,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            let intent, entities, confidence = 0.0;
            
            try {
                // 1. Intent extraction via LLM
                const intentPrompt = `Extract the intent and confidence (0-1) from this query as JSON: ${JSON.stringify({ query })}`;
                const intentResponse = await this.llmService.completePrompt(intentPrompt);
                let parsed;
                try {
                    parsed = JSON.parse(intentResponse.replace(/^.*?({|\[)/s, '$1'));
                    intent = parsed.intent;
                    confidence = parsed.confidence || 0.0;
                } catch (e) {
                    // Fallback: treat as plain intent string
                    intent = intentResponse.trim();
                    confidence = 0.5;
                    
                    MonitoringService.trackMetric('nlu_agent_intent_parse_fallback', 1, {
                        service: 'nlu-agent',
                        method: 'processQuery',
                        parseError: e.message,
                        timestamp: new Date().toISOString()
                    });
                }
                
                // 2. Entity recognition
                entities = await this.entityRecognizer(query);
                
                // 3. Context-aware understanding
                if (this.contextService && typeof this.contextService.enrich === 'function') {
                    context = await this.contextService.enrich(context, { intent, entities });
                }
                
                const result = { intent, entities, confidence, context };
                
                const executionTime = Date.now() - startTime;
                MonitoringService.trackMetric('nlu_agent_process_query_success', executionTime, {
                    service: 'nlu-agent',
                    method: 'processQuery',
                    queryLength: query.length,
                    extractedIntent: intent,
                    confidence: confidence,
                    entitiesCount: Object.keys(entities).length,
                    timestamp: new Date().toISOString()
                });
                
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('NLU query processing completed', {
                        queryLength: query.length,
                        extractedIntent: intent,
                        confidence: confidence,
                        entitiesCount: Object.keys(entities).length,
                        executionTimeMs: executionTime,
                        timestamp: new Date().toISOString()
                    }, 'nlu');
                }
                
                return result;
            } catch (processingError) {
                // Fallback mechanism for processing errors
                const fallbackResult = { intent: null, entities: {}, confidence: 0.0, context, error: processingError.message };
                
                const executionTime = Date.now() - startTime;
                MonitoringService.trackMetric('nlu_agent_process_query_fallback', executionTime, {
                    service: 'nlu-agent',
                    method: 'processQuery',
                    queryLength: query.length,
                    errorType: processingError.code || 'unknown',
                    timestamp: new Date().toISOString()
                });
                
                MonitoringService.logError(ErrorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    `NLU processing failed, using fallback: ${processingError.message}`,
                    ErrorService.SEVERITIES.WARNING,
                    {
                        service: 'nlu-agent',
                        method: 'processQuery',
                        queryLength: query.length,
                        fallbackResult: fallbackResult,
                        timestamp: new Date().toISOString()
                    }
                ));
                
                return fallbackResult;
            }
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('nlu_agent_process_query_failure', executionTime, {
                    service: 'nlu-agent',
                    method: 'processQuery',
                    queryLength: query ? query.length : 0,
                    errorType: error.code || 'validation_error',
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `NLU query processing failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'nlu-agent',
                    method: 'processQuery',
                    queryLength: query ? query.length : 0,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('nlu_agent_process_query_failure', executionTime, {
                service: 'nlu-agent',
                method: 'processQuery',
                queryLength: query ? query.length : 0,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }
}

/**
 * Default entity recognizer (simple regex-based, replace with LLM or NER for prod)
 * @param {string} query
 * @returns {Promise<object>} entities
 */
async function defaultEntityRecognizer(query) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Entity recognition started', {
            method: 'defaultEntityRecognizer',
            queryLength: query ? query.length : 0,
            timestamp: new Date().toISOString()
        }, 'nlu');
    }
    
    try {
        if (!query || typeof query !== 'string') {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.VALIDATION,
                'Query must be a non-empty string for entity recognition',
                ErrorService.SEVERITIES.WARNING,
                {
                    service: 'nlu-agent',
                    method: 'defaultEntityRecognizer',
                    queryType: typeof query,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            throw mcpError;
        }
        
        // Example: extract email, date, number, etc.
        const entities = {};
        const emailMatch = query.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
        if (emailMatch) entities.email = emailMatch[0];
        const dateMatch = query.match(/\b(\d{4}-\d{2}-\d{2})\b/);
        if (dateMatch) entities.date = dateMatch[1];
        const numberMatch = query.match(/\b\d+\b/);
        if (numberMatch) entities.number = numberMatch[0];
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('nlu_agent_entity_recognition_success', executionTime, {
            service: 'nlu-agent',
            method: 'defaultEntityRecognizer',
            queryLength: query.length,
            entitiesFound: Object.keys(entities).length,
            entityTypes: Object.keys(entities),
            timestamp: new Date().toISOString()
        });
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Entity recognition completed', {
                queryLength: query.length,
                entitiesFound: Object.keys(entities).length,
                entityTypes: Object.keys(entities),
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        return entities;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // If it's already an MCP error, just track metrics and rethrow
        if (error.category) {
            MonitoringService.trackMetric('nlu_agent_entity_recognition_failure', executionTime, {
                service: 'nlu-agent',
                method: 'defaultEntityRecognizer',
                queryLength: query ? query.length : 0,
                errorType: error.code || 'validation_error',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `Entity recognition failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                service: 'nlu-agent',
                method: 'defaultEntityRecognizer',
                queryLength: query ? query.length : 0,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('nlu_agent_entity_recognition_failure', executionTime, {
            service: 'nlu-agent',
            method: 'defaultEntityRecognizer',
            queryLength: query ? query.length : 0,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

module.exports = NLUAgent;
