/**
 * @fileoverview Handles /api/query endpoint for natural language queries.
 */

const Joi = require('joi');

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
            // NLU pipeline
            const nluResult = await nluAgent.processQuery({ query: value.query });
            // Update context
            await contextService.updateContext({
                currentIntent: nluResult.intent,
                currentEntities: nluResult.entities
            });
            const ctx = await contextService.getCurrentContext();
            res.json({ response: nluResult, context: ctx });
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            res.status(500).json({ error: 'Internal error' });
        }
    }
});
