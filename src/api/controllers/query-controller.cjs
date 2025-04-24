/**
 * @fileoverview Handles /api/query endpoint for natural language queries.
 */

const Joi = require('joi');
const errorService = require('../../core/error-service.cjs');

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
        try {
            const { error, value } = querySchema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Try to use the NLU agent if available, otherwise provide mock data
            let nluResult;
            let ctx = {};
            
            try {
                if (typeof nluAgent.processQuery === 'function') {
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
                    console.log('Using mock NLU result for query:', value.query);
                    
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
                console.error('Error processing NLU query:', nluError);
                
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
            
            res.json({ response: nluResult, context: ctx });
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Query controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    }
});
