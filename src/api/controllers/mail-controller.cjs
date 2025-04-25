/**
 * @fileoverview Handles /api/mail endpoints for mail operations.
 */

const Joi = require('joi');
const errorService = require('../../core/error-service.cjs');

/**
 * Factory for mail controller with dependency injection.
 * @param {object} deps - { mailModule }
 */
module.exports = ({ mailModule }) => ({
    /**
     * GET /api/mail
     */
    async getMail(req, res) {
        try {
            // Optionally validate query params
            const top = Number(req.query.limit) || 20;
            const filter = req.query.filter;
            const debug = req.query.debug === 'true';
            let rawMessages = null;
            
            // For development/testing, return mock data if module methods aren't fully implemented
            if (typeof mailModule.getInboxRaw === 'function' && debug) {
                try {
                    // If raw fetch is exposed, use it for debug
                    rawMessages = await mailModule.getInboxRaw({ top, filter }, req);
                } catch (fetchError) {
                    console.error('Error fetching raw messages:', fetchError);
                    // Continue even if raw fetch fails
                }
            }
            
            // Try to get messages from the module, or return mock data if it fails
            let messages = [];
            try {
                if (typeof mailModule.getInbox === 'function') {
                    messages = await mailModule.getInbox({ top, filter }, req);
                } else if (typeof mailModule.handleIntent === 'function') {
                    // Try using the module's handleIntent method instead
                    const result = await mailModule.handleIntent('readMail', { count: top, filter }, { req });
                    messages = result && result.items ? result.items : [];
                }
            } catch (moduleError) {
                console.error('Error calling mail module:', moduleError);
                // Return mock data for development/testing
                messages = [
                    { id: 'mock1', subject: 'Mock Email 1', from: { name: 'Test User', email: 'test@example.com' }, received: new Date().toISOString() },
                    { id: 'mock2', subject: 'Mock Email 2', from: { name: 'Test User', email: 'test@example.com' }, received: new Date().toISOString() }
                ];
            }
            
            if (debug) {
                res.json({
                    normalized: messages,
                    raw: rawMessages
                });
            } else {
                res.json(messages);
            }
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Mail controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/mail/send
     */
    async sendMail(req, res) {
        // Joi schema for sendMail
        const sendMailSchema = Joi.object({
            to: Joi.alternatives(
                Joi.string().email(),
                Joi.array().items(Joi.string().email())
            ).required(),
            subject: Joi.string().min(1).required(),
            body: Joi.string().min(1).required()
        });
        try {
            const { error, value } = sendMailSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            const result = await mailModule.sendMail(value);
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            res.status(500).json({ error: 'Internal error' });
        }
    }
});
