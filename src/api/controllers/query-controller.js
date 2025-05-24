/**
 * @fileoverview Handles /api/query endpoint for natural language queries.
 */

const Joi = require('joi');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

/**
 * Helper function to validate request and log validation errors
 * @param {object} req - Express request object
 * @param {object} schema - Joi schema to validate against
 * @param {string} endpoint - Endpoint name for error context
 * @param {object} [additionalContext] - Additional context for validation errors
 * @returns {object} Object with error and value properties
 */
const validateAndLog = (req, schema, endpoint, additionalContext = {}) => {
    const result = schema.validate(req.body);
    
    if (result.error) {
        const validationError = ErrorService.createError(
            ErrorService.CATEGORIES.API,
            `${endpoint} validation error`,
            ErrorService.SEVERITIES.WARNING,
            { 
                details: result.error.details,
                endpoint,
                ...additionalContext
            }
        );
        // Note: Error service automatically handles logging via events
    }
    
    return result;
};

const querySchema = Joi.object({
    query: Joi.string().min(2).required()
});

/**
 * Factory for query controller with dependency injection.
 * @param {object} deps - { nluAgent, contextService, errorService }
 */
module.exports = ({ nluAgent, contextService, errorService }) => ({
    /**
     * POST /api/query
     * @param {express.Request} req
     * @param {express.Response} res
     */
    async handleQuery(req, res) {
        const startTime = Date.now();
        try {
            // Log request
            MonitoringService.info(`Processing ${req.method} ${req.path}`, {
                method: req.method,
                path: req.path,
                body: req.body,
                ip: req.ip
            }, 'nlu');
            
            // Validate request using helper function
            const { error, value } = validateAndLog(req, querySchema, 'handleQuery');
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Try to use the NLU agent if available, otherwise provide mock data
            let nluResult;
            let ctx = {};
            
            try {
                if (typeof nluAgent.processQuery === 'function') {
                    MonitoringService.info('Processing query with NLU agent', {
                        query: value.query,
                        queryLength: value.query.length
                    }, 'nlu');
                    
                    // NLU pipeline
                    nluResult = await nluAgent.processQuery({ query: value.query });
                    
                    // Update context if contextService is available
                    if (contextService && typeof contextService.updateContext === 'function') {
                        await contextService.updateContext({
                            currentIntent: nluResult.intent,
                            currentEntities: nluResult.entities
                        });
                        ctx = await contextService.getCurrentContext();
                    }
                } else {
                    // Provide mock NLU result for testing
                    MonitoringService.info('Using mock NLU result for query', {
                        query: value.query,
                        mockMode: true
                    }, 'nlu');
                    
                    // Simple intent detection based on keywords
                    let intent = 'unknown';
                    let entities = {};
                    
                    if (value.query.toLowerCase().includes('email') || 
                        value.query.toLowerCase().includes('mail')) {
                        intent = 'readMail';
                        entities = { count: 5 };
                    } else if (value.query.toLowerCase().includes('calendar') || 
                             value.query.toLowerCase().includes('event') || 
                             value.query.toLowerCase().includes('meeting')) {
                        intent = 'readCalendar';
                        entities = { count: 3 };
                    } else if (value.query.toLowerCase().includes('file') || 
                             value.query.toLowerCase().includes('document')) {
                        intent = 'listFiles';
                        entities = {};
                    }
                    
                    nluResult = {
                        intent,
                        entities,
                        confidence: 0.85,
                        query: value.query
                    };
                    
                    // Mock context
                    ctx = {
                        currentIntent: intent,
                        currentEntities: entities,
                        sessionId: 'mock-session',
                        timestamp: new Date().toISOString()
                    };
                }
            } catch (nluError) {
                const error = ErrorService.createError(
                    ErrorService.CATEGORIES.NLU,
                    'Error processing NLU query',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        error: nluError.message, 
                        stack: nluError.stack,
                        operation: 'processQuery',
                        query: value.query
                    }
                );
                
                // Provide fallback mock response
                nluResult = {
                    intent: 'unknown',
                    entities: {},
                    confidence: 0.5,
                    query: value.query,
                    error: nluError.message
                };
                
                ctx = {
                    currentIntent: 'unknown',
                    timestamp: new Date().toISOString()
                };
            }
            
            // Track performance
            const duration = Date.now() - startTime;
            MonitoringService.trackMetric('nlu.handleQuery.duration', duration, {
                intent: nluResult.intent,
                confidence: nluResult.confidence,
                queryLength: value.query.length,
                success: true
            });
            
            res.json({ response: nluResult, context: ctx });
        } catch (err) {
            // Track error metrics
            const duration = Date.now() - startTime;
            MonitoringService.trackMetric('nlu.handleQuery.error', 1, {
                errorMessage: err.message,
                duration,
                success: false
            });
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API,
                'Error in handleQuery',
                ErrorService.SEVERITIES.ERROR,
                { 
                    stack: err.stack,
                    operation: 'handleQuery',
                    error: err.message
                }
            );
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    }
});
