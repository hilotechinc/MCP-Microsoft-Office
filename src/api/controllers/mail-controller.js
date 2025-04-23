/**
 * @fileoverview Handles /api/mail endpoints for mail operations.
 */

const Joi = require('joi');
const errorService = require('../../core/error-service');

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
            const messages = await mailModule.getInbox({
                top: Number(req.query.limit) || 20,
                filter: req.query.filter
            });
            res.json(messages);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            res.status(500).json({ error: 'Internal error' });
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
