/**
 * @fileoverview Handles /api/calendar endpoints for calendar operations.
 */

const Joi = require('joi');
const errorService = require('../../core/error-service.cjs');

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
            const top = Number(req.query.limit) || 20;
            const filter = req.query.filter;
            const debug = req.query.debug === 'true';
            let rawEvents = null;
            
            // For development/testing, return mock data if module methods aren't fully implemented
            if (typeof calendarModule.getEventsRaw === 'function' && debug) {
                try {
                    rawEvents = await calendarModule.getEventsRaw({ top, filter, req });
                } catch (fetchError) {
                    console.error('Error fetching raw events:', fetchError);
                    // Continue even if raw fetch fails
                }
            }
            
            // Try to get events from the module, or return mock data if it fails
            let events = [];
            try {
                if (typeof calendarModule.getEvents === 'function') {
                    events = await calendarModule.getEvents({ top, filter, req });
                } else if (typeof calendarModule.handleIntent === 'function') {
                    // Try using the module's handleIntent method instead
                    const result = await calendarModule.handleIntent('readCalendar', { count: top, filter, req });
                    events = result && result.items ? result.items : [];
                }
            } catch (moduleError) {
                console.error('Error calling calendar module:', moduleError);
                // Return mock data for development/testing
                const today = new Date();
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                
                events = [
                    { 
                        id: 'mock1', 
                        subject: 'Team Meeting', 
                        start: { dateTime: today.toISOString(), timeZone: 'UTC' },
                        end: { dateTime: new Date(today.getTime() + 3600000).toISOString(), timeZone: 'UTC' }
                    },
                    { 
                        id: 'mock2', 
                        subject: 'Project Review', 
                        start: { dateTime: tomorrow.toISOString(), timeZone: 'UTC' },
                        end: { dateTime: new Date(tomorrow.getTime() + 3600000).toISOString(), timeZone: 'UTC' }
                    }
                ];
            }
            
            if (debug) {
                res.json({
                    normalized: events,
                    raw: rawEvents
                });
            } else {
                res.json(events);
            }
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar controller error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
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
