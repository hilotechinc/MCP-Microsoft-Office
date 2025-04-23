/**
 * @fileoverview Handles /api/calendar endpoints for calendar operations.
 */

const Joi = require('joi');
const errorService = require('../../core/error-service');

/**
 * Factory for calendar controller with dependency injection.
 * @param {object} deps - { calendarModule }
 */
module.exports = ({ calendarModule }) => ({
    /**
     * GET /api/calendar
     */
    async getEvents(req, res) {
        try {
            // Optionally validate query params
            const events = await calendarModule.getEvents({
                top: Number(req.query.limit) || 20,
                filter: req.query.filter
            });
            res.json(events);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            res.status(500).json({ error: 'Internal error' });
        }
    },
    /**
     * POST /api/calendar/create
     */
    async createEvent(req, res) {
        // Joi schema for createEvent
        const eventSchema = Joi.object({
            subject: Joi.string().min(1).required(),
            start: Joi.object({
                dateTime: Joi.date().iso().required(),
                timeZone: Joi.string().default('UTC')
            }).required(),
            end: Joi.object({
                dateTime: Joi.date().iso().required(),
                timeZone: Joi.string().default('UTC')
            }).required()
        });
        try {
            const { error, value } = eventSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            const result = await calendarModule.createEvent(value);
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            res.status(500).json({ error: 'Internal error' });
        }
    }
});
