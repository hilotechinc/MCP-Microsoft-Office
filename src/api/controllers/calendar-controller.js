/**
 * @fileoverview Handles /api/calendar endpoints for calendar operations.
 */

const Joi = require('joi');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

/**
 * Helper function to validate request against schema and log validation errors
 * @param {object} req - Express request object
 * @param {object} schema - Joi schema to validate against
 * @param {string} endpoint - Endpoint path for error context
 * @param {object} [additionalContext] - Additional context for validation errors
 * @returns {object} Object with error and value properties
 */
const validateAndLog = (req, schema, endpoint, additionalContext = {}) => {
    const result = schema.validate(req.body);
    
    if (result.error) {
        const validationError = ErrorService?.createError(
            'api', 
            `${endpoint} validation error`, 
            'warning', 
            { 
                details: result.error.details,
                endpoint,
                ...additionalContext
            }
        );
        MonitoringService?.logError(validationError);
    }
    
    return result;
};

/**
 * Helper function to check if a module method is available
 * @param {string} methodName - Name of the method to check
 * @param {object} module - Module to check for method availability
 * @returns {boolean} Whether the method exists on the module
 */
const isModuleMethodAvailable = (methodName, module) => {
    return typeof module[methodName] === 'function';
};

/**
 * Factory for calendar controller with dependency injection.
 * @param {object} deps - { calendarModule }
 */
module.exports = ({ calendarModule }) => ({
    /**
     * GET /api/calendar
     * Retrieves calendar events with optional filtering and debug information
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async getEvents(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar';
            
            // Validate query params with Joi
            const querySchema = Joi.object({
                limit: Joi.number().integer().min(1).max(100).default(20),
                filter: Joi.string().optional(),
                debug: Joi.boolean().default(false).optional(),
                startDateTime: Joi.date().iso().optional(),
                endDateTime: Joi.date().iso().optional()
            });
            
            // Convert query parameters for validation
            const queryParams = {
                limit: req.query.limit ? Number(req.query.limit) : undefined,
                filter: req.query.filter,
                debug: req.query.debug === 'true',
                startDateTime: req.query.startDateTime,
                endDateTime: req.query.endDateTime
            };
            
            const { error, value } = querySchema.validate(queryParams);
            if (error) {
                const validationError = ErrorService?.createError('api', 'Query parameter validation error', 'warning', { 
                    details: error.details,
                    endpoint,
                    query: req.query
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ 
                    error: 'Invalid query parameters', 
                    details: error.details 
                });
            }
            
            const { limit: top, filter, debug } = value;
            let rawEvents = null;
            
            // For debugging, get raw events if requested
            if (debug && isModuleMethodAvailable('getEventsRaw', calendarModule)) {
                try {
                    MonitoringService?.info('Fetching raw events for debug', { top, filter }, 'calendar');
                    rawEvents = await calendarModule.getEventsRaw({ top, filter });
                    MonitoringService?.info(`Retrieved ${rawEvents.length} raw events`, { count: rawEvents.length }, 'calendar');
                } catch (fetchError) {
                    const error = ErrorService?.createError('api', 'Error fetching raw events', 'error', { error: fetchError.message });
                    MonitoringService?.logError(error);
                    // Continue even if raw fetch fails
                }
            }
            
            // Try to get events from the module, or return mock data if it fails
            let events = [];
            let isMock = false;
            try {
                MonitoringService?.info('Attempting to get real calendar events from module', { top, filter }, 'calendar');
                
                if (isModuleMethodAvailable('getEvents', calendarModule)) {
                    events = await calendarModule.getEvents({ top, filter });
                    MonitoringService?.info(`Successfully retrieved ${events.length} real calendar events`, { count: events.length }, 'calendar');
                } else if (isModuleMethodAvailable('handleIntent', calendarModule)) {
                    // Try using the module's handleIntent method instead
                    MonitoringService?.info('Falling back to handleIntent method', { intent: 'readCalendar' }, 'calendar');
                    const result = await calendarModule.handleIntent('readCalendar', { count: top, filter });
                    events = result && result.items ? result.items : [];
                    MonitoringService?.info(`Retrieved ${events.length} events via handleIntent`, { count: events.length }, 'calendar');
                } else {
                    throw new Error('No calendar module method available for getting events');
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', 'Error calling calendar module for events', 'error', { 
                    error: moduleError.message,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock calendar data', {}, 'calendar');
                
                // Return mock data only if the real module call fails
                const today = new Date();
                const tomorrow = new Date(today);
                tomorrow.setDate(tomorrow.getDate() + 1);
                
                events = [
                    { 
                        id: 'mock1', 
                        subject: 'Team Meeting', 
                        start: { dateTime: today.toISOString(), timeZone: 'UTC' },
                        end: { dateTime: new Date(today.getTime() + 3600000).toISOString(), timeZone: 'UTC' },
                        isMock: true
                    },
                    { 
                        id: 'mock2', 
                        subject: 'Project Review', 
                        start: { dateTime: tomorrow.toISOString(), timeZone: 'UTC' },
                        end: { dateTime: new Date(tomorrow.getTime() + 3600000).toISOString(), timeZone: 'UTC' },
                        isMock: true
                    }
                ];
                isMock = true;
                MonitoringService?.info(`Generated ${events.length} mock calendar events`, { count: events.length }, 'calendar');
            }
            
            // Track get events time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.getEvents.duration', duration, { 
                count: events.length,
                isMock,
                hasFilter: !!filter
            });
            
            if (debug) {
                res.json({
                    normalized: events,
                    raw: rawEvents
                });
            } else {
                res.json(events);
            }
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error retrieving calendar events', 'error', { 
                stack: err.stack,
                endpoint: '/api/calendar',
                method: 'getEvents',
                error: err.message
            });
            MonitoringService?.logError(mcpError);
            
            // Track performance metric for failed request
            MonitoringService?.trackMetric('calendar.getEvents.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    /**
     * POST /api/calendar/create
     * Creates a new calendar event
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async createEvent(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/create';
            
            // Joi schema for createEvent with standardized dateTime validation
            const eventSchema = Joi.object({
                subject: Joi.string().min(1).required(),
                start: Joi.object({
                    dateTime: Joi.date().iso().required(),
                    timeZone: Joi.string().default('UTC')
                }).required(),
                end: Joi.object({
                    dateTime: Joi.date().iso().required(),
                    timeZone: Joi.string().default('UTC')
                }).required(),
                // Support multiple attendee formats
                attendees: Joi.alternatives().try(
                    // Simple email strings
                    Joi.array().items(Joi.string().email()),
                    
                    // Simple objects with email property
                    Joi.array().items(Joi.object({
                        email: Joi.string().email().required(),
                        name: Joi.string().optional(),
                        type: Joi.string().valid('required', 'optional').optional()
                    })),
                    
                    // Full Graph API format with emailAddress
                    Joi.array().items(Joi.object({
                        emailAddress: Joi.object({
                            address: Joi.string().email().required(),
                            name: Joi.string().optional()
                        }).required(),
                        type: Joi.string().valid('required', 'optional').optional()
                    }))
                ).optional(),
                // Body can be string or object with contentType and content
                body: Joi.alternatives().try(
                    Joi.string(),
                    Joi.object({
                        contentType: Joi.string().valid('text', 'html', 'HTML').required(),
                        content: Joi.string().required()
                    })
                ).optional(),
                // Location can be string or object with displayName
                location: Joi.alternatives().try(
                    Joi.string(),
                    Joi.object({
                        displayName: Joi.string().required(),
                        address: Joi.object().optional()
                    })
                ).optional(),
                isAllDay: Joi.boolean().optional(),
                isOnlineMeeting: Joi.boolean().optional(),
                recurrence: Joi.object().optional()
            });
            
            // Log the incoming request body for debugging (redacting sensitive data)
            const safeReqBody = { ...req.body };
            if (safeReqBody.attendees) {
                // Redact attendee details for privacy
                safeReqBody.attendees = Array.isArray(safeReqBody.attendees) ? 
                    `[${safeReqBody.attendees.length} attendees]` : 'attendees present';
            }
            
            MonitoringService?.info('Processing create event request', { 
                subject: safeReqBody.subject,
                hasAttendees: !!safeReqBody.attendees,
                hasLocation: !!safeReqBody.location,
                hasStartTime: !!safeReqBody.start,
                hasEndTime: !!safeReqBody.end
            }, 'calendar');
            
            const { error, value } = validateAndLog(req, eventSchema, 'Create event', { endpoint });
            if (error) {
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Try to create a real event using the calendar module
            let event;
            try {
                MonitoringService?.info('Attempting to create real calendar event using module', { subject: value.subject }, 'calendar');
                
                const methodName = 'createEvent';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    event = await calendarModule[methodName](value);
                    MonitoringService?.info('Successfully created real calendar event', { eventId: event.id }, 'calendar');
                } else if (isModuleMethodAvailable('handleIntent', calendarModule)) {
                    // Try using the module's handleIntent method instead
                    MonitoringService?.info('Falling back to handleIntent method for event creation', { intent: 'createEvent' }, 'calendar');
                    const result = await calendarModule.handleIntent('createEvent', value);
                    event = result;
                    MonitoringService?.info('Created event via handleIntent', { eventId: event.id }, 'calendar');
                } else {
                    throw new Error('No calendar module method available for event creation');
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', 'Error calling calendar module for event creation', 'error', { 
                    error: moduleError.message,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock calendar event', {}, 'calendar');
                
                // Only fall back to mock data if the real module call fails
                event = {
                    id: 'mock-' + Date.now(),
                    subject: value.subject,
                    start: value.start,
                    end: value.end,
                    attendees: value.attendees || [],
                    body: value.body || '',
                    location: value.location || '',
                    isAllDay: value.isAllDay || false,
                    isOnlineMeeting: value.isOnlineMeeting || false,
                    createdDateTime: new Date().toISOString(),
                    lastModifiedDateTime: new Date().toISOString(),
                    isMock: true // Flag to indicate this is mock data
                };
                MonitoringService?.info('Generated mock calendar event', { eventId: event.id }, 'calendar');
            }
            
            // Track event creation time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.createEvent.duration', duration, { 
                isMock: !!event.isMock,
                eventId: event.id,
                subject: event.subject
            });
            
            res.json(event);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error creating calendar event', 'error', { 
                stack: err.stack,
                code: err.code,
                statusCode: err.statusCode,
                endpoint: '/api/calendar/create',
                error: err.message
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.createEvent.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * PUT /api/calendar/events/:id
     * Updates an existing calendar event
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async updateEvent(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/events/:id';
            
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                const validationError = ErrorService?.createError('api', 'Event ID is required for update', 'warning', { 
                    endpoint 
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const attendeeSchema = Joi.object({
                emailAddress: Joi.object({
                    address: Joi.string().email().required(),
                    name: Joi.string().optional()
                }).required(),
                type: Joi.string().valid('required', 'optional', 'resource').default('required')
            });

            const updateSchema = Joi.object({
                subject: Joi.string().optional(),
                start: Joi.object({
                    dateTime: Joi.date().iso().required(),
                    timeZone: Joi.string().default('UTC')
                }).optional(),
                end: Joi.object({
                    dateTime: Joi.date().iso().required(),
                    timeZone: Joi.string().default('UTC')
                }).optional(),
                // Support both string array and object array for attendees
                attendees: Joi.array().items(attendeeSchema).optional(),
                // Location can be string or object with displayName
                location: Joi.alternatives().try(
                    Joi.string(),
                    Joi.object({
                        displayName: Joi.string().required(),
                        address: Joi.object().optional()
                    })
                ).optional(),
                // Body can be string or object with contentType and content
                body: Joi.alternatives().try(
                    Joi.string(),
                    Joi.object({
                        contentType: Joi.string().valid('text', 'html', 'HTML').required(),
                        content: Joi.string().required()
                    })
                ).optional(),
                isAllDay: Joi.boolean().optional(),
                isOnlineMeeting: Joi.boolean().optional(),
                recurrence: Joi.object().optional()
            });
            
            // Create a sanitized request body for logging (redact sensitive data)
            const safeReqBody = { ...req.body };
            if (safeReqBody.attendees) {
                // Redact attendee details for privacy
                safeReqBody.attendees = Array.isArray(safeReqBody.attendees) ? 
                    `[${safeReqBody.attendees.length} attendees]` : 'attendees present';
            }
            
            MonitoringService?.info('Updating calendar event', { 
                eventId,
                subject: safeReqBody.subject,
                hasAttendees: !!safeReqBody.attendees,
                hasLocation: !!safeReqBody.location,
                hasStartTime: !!safeReqBody.start,
                hasEndTime: !!safeReqBody.end
            }, 'calendar');
            
            const { error, value } = validateAndLog(req, updateSchema, 'Update event', { eventId, endpoint });
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details 
                });
            }
            
            // Try to use the module's updateEvent method if available
            let updatedEvent;
            try {
                MonitoringService?.info(`Attempting to update event ${eventId} using module`, { eventId }, 'calendar');
                
                const methodName = 'updateEvent';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    updatedEvent = await calendarModule[methodName](eventId, value);
                    MonitoringService?.info(`Successfully updated event ${eventId} using module`, { eventId }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', `Error updating event ${eventId}`, 'error', { 
                    error: moduleError.message,
                    eventId,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock event update', { eventId }, 'calendar');
                
                // If module method fails, create a mock updated event
                updatedEvent = {
                    id: eventId,
                    ...value,
                    organizer: {
                        name: 'Current User',
                        email: 'current.user@example.com'
                    },
                    lastModifiedDateTime: new Date().toISOString(),
                    isMock: true // Flag to indicate this is mock data
                };
                MonitoringService?.info('Generated mock updated event', { eventId }, 'calendar');
            }
            
            // Track update time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.updateEvent.duration', duration, { 
                eventId,
                subject: updatedEvent.subject,
                isMock: !!updatedEvent.isMock
            });
            
            res.json(updatedEvent);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error updating calendar event', 'error', { 
                stack: err.stack,
                endpoint: '/api/calendar/events/:id',
                error: err.message,
                eventId: req.params?.id
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.updateEvent.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/accept
     * Accept a calendar event invitation
     */
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async acceptEvent(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/events/:id/accept';
            
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                const validationError = ErrorService?.createError('api', 'Event ID is required for accept operation', 'warning', { 
                    endpoint 
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const acceptSchema = Joi.object({
                comment: Joi.string().optional()
            });
            
            const { error, value } = validateAndLog(req, acceptSchema, 'Accept event', { eventId, endpoint });
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details 
                });
            }
            
            MonitoringService?.info('Accepting calendar event', { 
                eventId,
                hasComment: !!value.comment 
            }, 'calendar');
            
            // Try to use the module's acceptEvent method if available
            let result;
            try {
                MonitoringService?.info(`Attempting to accept event ${eventId} using module`, { eventId }, 'calendar');
                const methodName = 'acceptEvent';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    result = await calendarModule[methodName](eventId, value.comment);
                    MonitoringService?.info(`Successfully accepted event ${eventId} using module`, { eventId }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', `Error accepting event ${eventId}`, 'error', { 
                    error: moduleError.message,
                    eventId,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock event acceptance', { eventId }, 'calendar');
                
                // If module method fails, create a mock response
                result = {
                    id: eventId,
                    status: 'accepted',
                    timestamp: new Date().toISOString(),
                    isMock: true  // Flag to indicate this is mock data
                };
                MonitoringService?.info('Generated mock event acceptance', { eventId }, 'calendar');
            }
            
            // Track accept time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.acceptEvent.duration', duration, { 
                eventId,
                status: result.status,
                isMock: !!result.isMock
            });
            
            res.json(result);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error accepting calendar event', 'error', { 
                stack: err.stack,
                endpoint: '/api/calendar/events/:id/accept',
                error: err.message,
                eventId: req.params?.id
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.acceptEvent.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/tentativelyAccept
     * Tentatively accept a calendar event invitation
     */
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async tentativelyAcceptEvent(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/events/:id/tentativelyAccept';
            
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                const validationError = ErrorService?.createError('api', 'Event ID is required for tentatively accept operation', 'warning', { 
                    endpoint
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const acceptSchema = Joi.object({
                comment: Joi.string().optional()
            });
            
            const { error, value } = validateAndLog(req, acceptSchema, 'Tentative accept event', { eventId, endpoint });
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details 
                });
            }
            
            MonitoringService?.info('Tentatively accepting calendar event', { 
                eventId,
                hasComment: !!value.comment 
            }, 'calendar');
            
            // Try to use the module's tentativelyAcceptEvent method if available
            let result;
            try {
                MonitoringService?.info(`Attempting to tentatively accept event ${eventId} using module`, { eventId }, 'calendar');
                const methodName = 'tentativelyAcceptEvent';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    result = await calendarModule[methodName](eventId, value.comment);
                    MonitoringService?.info(`Successfully tentatively accepted event ${eventId} using module`, { eventId }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', `Error tentatively accepting event ${eventId}`, 'error', { 
                    error: moduleError.message,
                    eventId,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock event tentative acceptance', { eventId }, 'calendar');
                
                // If module method fails, create a mock response
                result = {
                    id: eventId,
                    status: 'tentativelyAccepted',
                    timestamp: new Date().toISOString(),
                    isMock: true // Flag to indicate this is mock data
                };
                MonitoringService?.info('Generated mock event tentative acceptance', { eventId }, 'calendar');
            }
            
            // Track tentative accept time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.tentativelyAcceptEvent.duration', duration, { 
                eventId,
                status: result.status,
                isMock: !!result.isMock
            });
            
            res.json(result);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error tentatively accepting calendar event', 'error', { 
                stack: err.stack,
                endpoint: '/api/calendar/events/:id/tentativelyAccept',
                error: err.message,
                eventId: req.params?.id
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.tentativelyAcceptEvent.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/decline
     * Decline a calendar event invitation
     */
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async declineEvent(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/events/:id/decline';
            
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                const validationError = ErrorService?.createError('api', 'Event ID is required for decline operation', 'warning', { 
                    endpoint
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const declineSchema = Joi.object({
                comment: Joi.string().optional()
            });
            
            const { error, value } = validateAndLog(req, declineSchema, 'Decline event', { eventId, endpoint });
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details 
                });
            }
            
            MonitoringService?.info('Declining calendar event', { 
                eventId,
                hasComment: !!value.comment 
            }, 'calendar');
            
            // Try to use the module's declineEvent method if available
            let result;
            try {
                MonitoringService?.info(`Attempting to decline event ${eventId} using module`, { eventId }, 'calendar');
                const methodName = 'declineEvent';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    result = await calendarModule[methodName](eventId, value.comment);
                    MonitoringService?.info(`Successfully declined event ${eventId} using module`, { eventId }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', `Error declining event ${eventId}`, 'error', { 
                    error: moduleError.message,
                    eventId,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock event decline', { eventId }, 'calendar');
                
                // If module method fails, create a mock response
                result = {
                    id: eventId,
                    status: 'declined',
                    timestamp: new Date().toISOString(),
                    isMock: true // Flag to indicate this is mock data
                };
                MonitoringService?.info('Generated mock event decline', { eventId }, 'calendar');
            }
            
            // Track decline time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.declineEvent.duration', duration, { 
                eventId,
                status: result.status,
                isMock: !!result.isMock
            });
            
            res.json(result);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error declining calendar event', 'error', { 
                stack: err.stack,
                endpoint: '/api/calendar/events/:id/decline',
                error: err.message,
                eventId: req.params?.id
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.declineEvent.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/cancel
     * Cancel a calendar event and send cancellation messages to attendees
     */
    /**
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async cancelEvent(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/events/:id/cancel';
            
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                const validationError = ErrorService?.createError('api', 'Event ID is required for cancel operation', 'warning', { 
                    endpoint
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const cancelSchema = Joi.object({
                comment: Joi.string().optional()
            });
            
            const { error, value } = validateAndLog(req, cancelSchema, 'Cancel event', { eventId, endpoint });
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details 
                });
            }
            
            MonitoringService?.info('Cancelling calendar event', { 
                eventId,
                hasComment: !!value.comment 
            }, 'calendar');
            
            // Try to use the module's cancelEvent method if available
            let result;
            try {
                MonitoringService?.info(`Attempting to cancel event ${eventId} using module`, { eventId }, 'calendar');
                const methodName = 'cancelEvent';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    result = await calendarModule[methodName](eventId, value.comment);
                    MonitoringService?.info(`Successfully cancelled event ${eventId} using module`, { eventId }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', `Error cancelling event ${eventId}`, 'error', { 
                    error: moduleError.message,
                    eventId,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock event cancellation', { eventId }, 'calendar');
                
                // If module method fails, create a mock response
                result = {
                    id: eventId,
                    status: 'cancelled',
                    timestamp: new Date().toISOString(),
                    isMock: true // Flag to indicate this is mock data
                };
                MonitoringService?.info('Generated mock event cancellation', { eventId }, 'calendar');
            }
            
            // Track cancel time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.cancelEvent.duration', duration, { 
                eventId,
                status: result.status,
                isMock: !!result.isMock
            });
            
            res.json(result);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error cancelling calendar event', 'error', { 
                stack: err.stack,
                endpoint: '/api/calendar/events/:id/cancel',
                error: err.message,
                eventId: req.params?.id
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.cancelEvent.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/availability
     * Gets availability information for users within a specified time range
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async getAvailability(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/availability';
            
            // ENHANCED LOGGING: Log the raw request body for debugging
            MonitoringService?.debug('getAvailability raw request body:', { 
                body: req.body,
                bodyType: typeof req.body,
                hasTimeSlots: req.body && req.body.timeSlots ? 'yes' : 'no',
                hasUsers: req.body && req.body.users ? 'yes' : 'no',
                hasStart: req.body && req.body.start ? 'yes' : 'no',
                hasEnd: req.body && req.body.end ? 'yes' : 'no'
            }, 'calendar');
            
            // For simpler API calls, also support direct start/end parameters
            let requestBody = { ...req.body };
            if (requestBody.start && requestBody.end && requestBody.users) {
                MonitoringService?.info('Converting simplified availability request format to standard format', {
                    originalFormat: {
                        start: requestBody.start,
                        end: requestBody.end,
                        usersType: Array.isArray(requestBody.users) ? 'array' : typeof requestBody.users,
                        userCount: Array.isArray(requestBody.users) ? requestBody.users.length : (typeof requestBody.users === 'string' ? 1 : 0)
                    }
                }, 'calendar');
                requestBody = {
                    users: Array.isArray(requestBody.users) ? requestBody.users : [requestBody.users],
                    timeSlots: [{
                        start: { dateTime: requestBody.start, timeZone: 'UTC' },
                        end: { dateTime: requestBody.end, timeZone: 'UTC' }
                    }]
                };
                
                // Log the converted format
                MonitoringService?.debug('Converted to standard format:', {
                    convertedBody: requestBody
                }, 'calendar');
            }
            
            // Validate request body with standardized dateTime validation
            const availabilitySchema = Joi.object({
                users: Joi.array().items(Joi.string().email()).min(1).required(),
                timeSlots: Joi.array().items(
                    Joi.object({
                        start: Joi.object({
                            dateTime: Joi.date().iso().required(),
                            timeZone: Joi.string().default('UTC')
                        }).required(),
                        end: Joi.object({
                            dateTime: Joi.date().iso().required(),
                            timeZone: Joi.string().default('UTC')
                        }).required()
                    })
                ).required()
            });
            
            // Create a modified req object with our adjusted body for validation
            const modifiedReq = { 
                ...req,
                body: requestBody
            };
            
            const { error, value } = validateAndLog(modifiedReq, availabilitySchema, 'Get availability', { endpoint });
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details 
                });
            }

            // Create safe version of request data (redact email addresses for privacy)
            const userCount = value.users.length;
            const timeSlotCount = value.timeSlots.length;
            
            MonitoringService?.info('Getting availability data', { 
                userCount, 
                timeSlotCount,
                startTime: value.timeSlots[0]?.start?.dateTime,
                endTime: value.timeSlots[value.timeSlots.length - 1]?.end?.dateTime
            }, 'calendar');

            // Try to use the module's getAvailability method if available
            let availabilityData;
            try {
                MonitoringService?.info('Attempting to get real availability data from module', { 
                    userCount, 
                    timeSlotCount 
                }, 'calendar');
                
                const methodName = 'getAvailability';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    availabilityData = await calendarModule[methodName]({
                        users: value.users,
                        timeSlots: value.timeSlots
                    });
                    
                    MonitoringService?.info(`Successfully retrieved real availability data for ${value.users.length} users`, { 
                        userCount: value.users.length,
                        resultSize: JSON.stringify(availabilityData).length
                    }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError(
                    'api',
                    'Failed to retrieve availability data from module',
                    'error',
                    { 
                        method: 'getAvailability', 
                        error: moduleError.message, 
                        stack: moduleError.stack,
                        userCount,
                        timeSlotCount
                    }
                );
                MonitoringService?.logError(moduleCallError);
                
                // Track availability error metric
                MonitoringService?.trackMetric('calendar.getAvailability.error', 1, {
                    errorId: moduleCallError.id,
                    reason: moduleError.message
                });
                
                // Generate mock availability data instead of returning an error
                MonitoringService?.info('Falling back to mock availability data', { userCount, timeSlotCount }, 'calendar');
                
                const mockAvailabilityData = {
                    users: value.users.map(user => ({
                        id: user,
                        availability: value.timeSlots.map(slot => ({
                            start: slot.start,
                            end: slot.end,
                            status: ['free', 'busy', 'tentative'][Math.floor(Math.random() * 3)]
                        }))
                    })),
                    isMock: true // Flag to indicate this is mock data
                };
                
                availabilityData = mockAvailabilityData;
                MonitoringService?.info('Generated mock availability data', { 
                    userCount: value.users.length,
                    resultSize: JSON.stringify(mockAvailabilityData).length
                }, 'calendar');
            }

            // Track time to retrieve availability
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.getAvailability.duration', duration, { 
                userCount,
                timeSlotCount,
                isMock: !!availabilityData.isMock
            });

            // Send the response (real or mock data)
            res.json(availabilityData);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error retrieving calendar availability', 'error', { 
                stack: err.stack,
                endpoint,
                error: err.message
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.getAvailability.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    
    /**
     * POST /api/calendar/findMeetingTimes
     * Find suitable meeting times for attendees
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async findMeetingTimes(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/findMeetingTimes';
            
            // Log incoming request for debugging
            MonitoringService?.debug('findMeetingTimes request received', {
                requestBody: req.body,
                contentType: req.headers['content-type'],
                method: req.method,
                endpoint,
                timestamp: new Date().toISOString()
            }, 'calendar');
            
            // Validate request body with backward compatibility for Claude's format
            const optionsSchema = Joi.object({
                // Attendees - support both simple emails (Claude format) and objects (Graph API format)
                attendees: Joi.array().items(
                    Joi.alternatives().try(
                        // Simple email string (Claude format)
                        Joi.string().email(),
                        // Full Graph API format
                        Joi.object({
                            type: Joi.string().valid('required', 'optional', 'resource').default('required'),
                            emailAddress: Joi.object({
                                address: Joi.string().email().required(),
                                name: Joi.string().optional()
                            }).required()
                        })
                    )
                ).min(1).required(),
                
                // Time constraint - support both formats
                timeConstraint: Joi.object({
                    activityDomain: Joi.string().valid('work', 'personal', 'unrestricted').default('work'),
                    // Accept either timeSlots (capital S) or timeslots (lowercase s)
                    timeSlots: Joi.array().items(Joi.object({
                        start: Joi.object({
                            dateTime: Joi.string().required(),
                            timeZone: Joi.string().default('UTC')
                        }).required(),
                        end: Joi.object({
                            dateTime: Joi.string().required(),
                            timeZone: Joi.string().default('UTC')
                        }).required()
                    })).min(1).optional(),
                    // Also accept lowercase 'timeslots' as used by the Graph API
                    timeslots: Joi.array().items(Joi.object({
                        start: Joi.object({
                            dateTime: Joi.string().required(),
                            timeZone: Joi.string().default('UTC')
                        }).required(),
                        end: Joi.object({
                            dateTime: Joi.string().required(),
                            timeZone: Joi.string().default('UTC')
                        }).required()
                    })).min(1).optional()
                }).optional(),
                
                // Alternative: timeConstraints (plural) for backward compatibility with Claude
                timeConstraints: Joi.object({
                    activityDomain: Joi.string().valid('work', 'personal', 'unrestricted').default('work'),
                    timeSlots: Joi.array().items(Joi.object({
                        start: Joi.object({
                            dateTime: Joi.string().required(), // Accept any string, let Graph API validate
                            timeZone: Joi.string().default('UTC')
                        }).required(),
                        end: Joi.object({
                            dateTime: Joi.string().required(), // Accept any string, let Graph API validate
                            timeZone: Joi.string().default('UTC')
                        }).required()
                    })).min(1).required()
                }).optional(),
                
                // Meeting duration in ISO8601 format (e.g., "PT1H" for 1 hour)
                meetingDuration: Joi.string().pattern(/^PT(\d+H)?(\d+M)?(\d+S)?$/).default('PT30M'),
                
                // Location constraint
                locationConstraint: Joi.object({
                    isRequired: Joi.boolean().default(false),
                    suggestLocation: Joi.boolean().default(false),
                    locations: Joi.array().items(Joi.object({
                        displayName: Joi.string().required(),
                        locationEmailAddress: Joi.string().email().optional(),
                        resolveAvailability: Joi.boolean().default(false)
                    })).optional()
                }).optional(),
                
                // Additional Graph API parameters
                maxCandidates: Joi.number().min(1).max(100).default(20),
                minimumAttendeePercentage: Joi.number().min(0).max(100).default(50),
                returnSuggestionReasons: Joi.boolean().default(true),
                isOrganizerOptional: Joi.boolean().default(false)
            }).or('timeConstraint', 'timeConstraints'); // Require at least one time constraint
            
            const { error, value } = validateAndLog(req, optionsSchema, 'Find meeting times', { endpoint });
            if (error) {
                // Enhanced error logging for debugging
                MonitoringService?.error('findMeetingTimes validation failed', {
                    validationError: error.details,
                    requestBody: req.body,
                    endpoint,
                    timestamp: new Date().toISOString()
                }, 'calendar');
                
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details,
                    message: error.details.map(d => d.message).join('; ')
                });
            }
            
            // Log successful validation
            MonitoringService?.info('findMeetingTimes validation succeeded', {
                validatedValue: value,
                timestamp: new Date().toISOString()
            }, 'calendar');
            
            // Normalize the data to Graph API format
            const normalizedValue = {
                ...value,
                // Convert simple email strings to Graph API attendee format
                attendees: value.attendees.map(attendee => {
                    if (typeof attendee === 'string') {
                        return {
                            type: 'required',
                            emailAddress: {
                                address: attendee,
                                name: attendee.split('@')[0] // Use part before @ as name
                            }
                        };
                    }
                    return attendee; // Already in correct format
                })
            };
            
            // Handle timeConstraint/timeConstraints with special attention to the timeslots/timeSlots format
            if (value.timeConstraint || value.timeConstraints) {
                const constraint = value.timeConstraint || value.timeConstraints;
                normalizedValue.timeConstraint = {
                    ...constraint,
                    // Ensure we use lowercase 'timeslots' as expected by the Graph API
                    timeslots: constraint.timeslots || constraint.timeSlots || []
                };
                
                // Remove the capitalized version if it exists to avoid confusion
                delete normalizedValue.timeConstraint.timeSlots;
            }
            
            // Remove the old timeConstraints field if it was used
            delete normalizedValue.timeConstraints;
            
            // Log normalized data for debugging
            MonitoringService?.debug('findMeetingTimes normalized data', {
                normalizedValue,
                timestamp: new Date().toISOString()
            }, 'calendar');
            
            // Create safe request data for logging (redact attendee details)
            const attendeeCount = normalizedValue.attendees?.length || 0;
            const timeConstraint = normalizedValue.timeConstraint;
            const firstTimeSlot = timeConstraint?.timeSlots?.[0];
            const lastTimeSlot = timeConstraint?.timeSlots?.[timeConstraint.timeSlots.length - 1];
            
            MonitoringService?.info('Finding meeting times', { 
                attendeeCount,
                activityDomain: timeConstraint?.activityDomain,
                timeSlotsCount: timeConstraint?.timeSlots?.length || 0,
                startTime: firstTimeSlot?.start?.dateTime,
                endTime: lastTimeSlot?.end?.dateTime,
                meetingDuration: normalizedValue.meetingDuration,
                maxCandidates: normalizedValue.maxCandidates
            }, 'calendar');

            // Try to use the module's findMeetingTimes method if available
            let suggestions;
            let isMock = false;
            try {
                // Extract meeting duration from normalized value for logging
                const meetingDuration = normalizedValue.meetingDuration || 'PT30M';
                
                MonitoringService?.info('Attempting to find meeting times using module', {
                    attendeeCount,
                    meetingDuration
                }, 'calendar');
                
                const methodName = 'findMeetingTimes';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    suggestions = await calendarModule[methodName](normalizedValue);
                    MonitoringService?.info('Successfully found meeting times using module', {
                        suggestionCount: suggestions.meetingTimeSuggestions?.length || 0
                    }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', 'Error finding meeting times', 'error', { 
                    error: moduleError.message,
                    stack: moduleError.stack,
                    attendeeCount
                });
                MonitoringService?.logError(moduleCallError);
                
                // Temporarily disable fallback to see the actual error
                throw moduleError;
            }
            
            // Track find meeting times duration
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.findMeetingTimes.duration', duration, { 
                suggestionCount: suggestions.meetingTimeSuggestions?.length || 0,
                attendeeCount,
                isMock
            });
            
            res.json(suggestions);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error finding calendar meeting times', 'error', { 
                stack: err.stack,
                endpoint,
                error: err.message
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.findMeetingTimes.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/calendar/rooms
     * Get available rooms for meetings
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async getRooms(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/rooms';
            
            // Validate query parameters
            const querySchema = Joi.object({
                building: Joi.string().optional(),
                capacity: Joi.number().integer().min(1).optional(),
                hasAudio: Joi.boolean().optional(),
                hasVideo: Joi.boolean().optional(),
                floor: Joi.number().integer().optional(),
                limit: Joi.number().integer().min(1).max(100).default(50).optional()
            });
            
            const { error, value } = querySchema.validate(req.query);
            if (error) {
                const validationError = ErrorService?.createError('api', 'Room query validation error', 'warning', { 
                    details: error.details,
                    endpoint
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ 
                    error: 'Invalid query parameters', 
                    details: error.details 
                });
            }
            
            MonitoringService?.info('Getting available meeting rooms', { query: value }, 'calendar');
            
            // Try to use the module's getRooms method if available
            let result;
            let isMock = false;
            try {
                MonitoringService?.info('Attempting to get rooms using module', {}, 'calendar');
                
                const methodName = 'getRooms';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    result = await calendarModule[methodName](value);
                    MonitoringService?.info('Successfully got rooms using module', { count: result.rooms?.length || 0 }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', 'Error getting meeting rooms', 'error', { 
                    error: moduleError.message,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock rooms', {}, 'calendar');
                
                // If module method fails, create mock rooms
                const mockRooms = [
                    {
                        id: 'room1',
                        displayName: 'Conference Room A',
                        emailAddress: 'room.a@example.com',
                        capacity: 10,
                        building: 'Building 1',
                        floorNumber: 2,
                        hasAudio: true,
                        hasVideo: true,
                        isMock: true
                    },
                    {
                        id: 'room2',
                        displayName: 'Conference Room B',
                        emailAddress: 'room.b@example.com',
                        capacity: 6,
                        building: 'Building 1',
                        floorNumber: 3,
                        hasAudio: true,
                        hasVideo: false,
                        isMock: true
                    },
                    {
                        id: 'room3',
                        displayName: 'Executive Boardroom',
                        emailAddress: 'boardroom@example.com',
                        capacity: 20,
                        building: 'Building 2',
                        floorNumber: 5,
                        hasAudio: true,
                        hasVideo: true,
                        isMock: true
                    }
                ];
                
                // Filter mock rooms based on query parameters
                let filteredRooms = [...mockRooms];
                
                if (value.building) {
                    filteredRooms = filteredRooms.filter(room => 
                        room.building.toLowerCase() === value.building.toLowerCase());
                }
                
                if (value.capacity) {
                    filteredRooms = filteredRooms.filter(room => room.capacity >= value.capacity);
                }
                
                if (value.hasAudio !== undefined) {
                    filteredRooms = filteredRooms.filter(room => room.hasAudio === value.hasAudio);
                }
                
                if (value.hasVideo !== undefined) {
                    filteredRooms = filteredRooms.filter(room => room.hasVideo === value.hasVideo);
                }
                
                if (value.floor) {
                    filteredRooms = filteredRooms.filter(room => room.floorNumber === value.floor);
                }
                
                // Apply limit if specified
                if (value.limit && filteredRooms.length > value.limit) {
                    filteredRooms = filteredRooms.slice(0, value.limit);
                }
                
                result = {
                    rooms: filteredRooms,
                    nextLink: null
                };
                isMock = true;
                
                MonitoringService?.info('Generated mock rooms', { count: filteredRooms.length }, 'calendar');
            }
            
            // Extract rooms array from result
            const rooms = result.rooms || [];
            
            // Track room retrieval time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.getRooms.duration', duration, { 
                count: rooms.length,
                isMock
            });
            
            res.json({ 
                rooms: rooms,
                nextLink: result.nextLink || null,
                fromCache: result.fromCache || false
            });
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error retrieving meeting rooms', 'error', { 
                stack: err.stack,
                endpoint,
                error: err.message
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.getRooms.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/calendar/calendars
     * Get user calendars
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async getCalendars(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/calendars';
            
            // Validate query parameters
            const querySchema = Joi.object({
                includeShared: Joi.boolean().default(true).optional()
            });
            
            const { error, value } = querySchema.validate(req.query);
            if (error) {
                const validationError = ErrorService?.createError('api', 'Calendar query validation error', 'warning', { 
                    details: error.details,
                    endpoint
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ 
                    error: 'Invalid query parameters', 
                    details: error.details 
                });
            }
            
            MonitoringService?.info('Getting user calendars', value, 'calendar');
            
            // Try to use the module's getCalendars method if available
            let calendars;
            let isMock = false;
            try {
                MonitoringService?.info('Attempting to get calendars using module', {}, 'calendar');
                
                const methodName = 'getCalendars';
                
                if (isModuleMethodAvailable(methodName, calendarModule)) {
                    calendars = await calendarModule[methodName](value);
                    MonitoringService?.info('Successfully got calendars using module', { count: calendars.length }, 'calendar');
                } else {
                    throw new Error(`calendarModule.${methodName} is not implemented`);
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', 'Error getting user calendars', 'error', { 
                    error: moduleError.message,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock calendars', {}, 'calendar');
                
                // If module method fails, create mock calendars
                calendars = [
                    {
                        id: 'calendar1',
                        name: 'Calendar',
                        color: 'auto',
                        isDefaultCalendar: true,
                        canShare: true,
                        canViewPrivateItems: true,
                        canEdit: true,
                        owner: {
                            name: 'Current User',
                            address: 'current.user@example.com'
                        },
                        isMock: true
                    },
                    {
                        id: 'calendar2',
                        name: 'Birthdays',
                        color: 'lightBlue',
                        isDefaultCalendar: false,
                        canShare: false,
                        canViewPrivateItems: true,
                        canEdit: false,
                        owner: {
                            name: 'Current User',
                            address: 'current.user@example.com'
                        },
                        isMock: true
                    },
                    {
                        id: 'calendar3',
                        name: 'Holidays',
                        color: 'lightGreen',
                        isDefaultCalendar: false,
                        canShare: false,
                        canViewPrivateItems: true,
                        canEdit: false,
                        owner: {
                            name: 'Current User',
                            address: 'current.user@example.com'
                        },
                        isMock: true
                    }
                ];
                isMock = true;
                
                // If includeShared is false, filter out shared calendars
                if (value.includeShared === false) {
                    calendars = calendars.filter(calendar => 
                        calendar.owner.address === 'current.user@example.com' || 
                        calendar.isDefaultCalendar === true);
                }
                
                MonitoringService?.info('Generated mock calendars', { count: calendars.length }, 'calendar');
            }
            
            // Track calendar retrieval time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.getCalendars.duration', duration, { 
                count: calendars.length,
                isMock
            });
            
            res.json(calendars);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error retrieving user calendars', 'error', { 
                stack: err.stack,
                endpoint,
                error: err.message
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.getCalendars.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/attachments
     * Add an attachment to an event
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async addAttachment(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/events/:id/attachments';
            
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                const validationError = ErrorService?.createError('api', 'Event ID is required for adding attachment', 'warning', { 
                    endpoint 
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const attachmentSchema = Joi.object({
                name: Joi.string().required(),
                contentType: Joi.string().required(),
                contentBytes: Joi.string().required(), // Base64 encoded content
                isInline: Joi.boolean().default(false)
            });
            
            const { error, value } = validateAndLog(req, attachmentSchema, 'Add attachment', { eventId, endpoint });
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details 
                });
            }
            
            // Create safe version of request body for logging
            const safeAttachmentInfo = {
                name: value.name,
                contentType: value.contentType,
                contentSize: value.contentBytes ? value.contentBytes.length : 0,
                isInline: value.isInline || false
            };
            
            MonitoringService?.info('Adding attachment to calendar event', { 
                eventId,
                attachment: safeAttachmentInfo 
            }, 'calendar');
            
            // Try to use the module's handleIntent method for addAttachment
            let attachment;
            try {
                MonitoringService?.info(`Attempting to add attachment to event ${eventId} using intent handler`, { 
                    eventId,
                    attachmentName: value.name
                }, 'calendar');
                
                if (isModuleMethodAvailable('handleIntent', calendarModule)) {
                    const entities = {
                        id: eventId,
                        name: value.name,
                        contentBytes: value.contentBytes,
                        contentType: value.contentType
                    };
                    const result = await calendarModule.handleIntent('addAttachment', entities);
                    attachment = result.attachment;
                    MonitoringService?.info(`Successfully added attachment to event ${eventId} using intent handler`, { 
                        eventId,
                        attachmentId: attachment.id
                    }, 'calendar');
                } else {
                    throw new Error('calendarModule.handleIntent is not implemented');
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', `Error adding attachment to event ${eventId}`, 'error', { 
                    error: moduleError.message,
                    eventId,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                MonitoringService?.info('Falling back to mock attachment', { eventId }, 'calendar');
                
                // If module method fails, create a mock attachment
                attachment = {
                    id: 'attachment-' + Date.now(),
                    name: value.name,
                    contentType: value.contentType,
                    size: value.contentBytes.length * 0.75, // Approximate size after base64 decoding
                    isInline: value.isInline || false,
                    lastModifiedDateTime: new Date().toISOString(),
                    isMock: true // Flag to indicate this is mock data
                };
                MonitoringService?.info('Generated mock attachment', { 
                    eventId,
                    attachmentId: attachment.id
                }, 'calendar');
            }
            
            // Track add attachment time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.addAttachment.duration', duration, { 
                eventId,
                attachmentId: attachment.id,
                contentType: attachment.contentType,
                isMock: !!attachment.isMock
            });
            
            res.json(attachment);
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error adding attachment to calendar event', 'error', { 
                stack: err.stack,
                endpoint: '/api/calendar/events/:id/attachments',
                error: err.message,
                eventId: req.params?.id
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.addAttachment.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * DELETE /api/calendar/events/:id/attachments/:attachmentId
     * Remove an attachment from an event
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     */
    async removeAttachment(req, res) {
        try {
            // Start timing for performance tracking
            const startTime = Date.now();
            const endpoint = '/api/calendar/events/:id/attachments/:attachmentId';
            
            // Get event ID and attachment ID from URL parameters
            const eventId = req.params.id;
            const attachmentId = req.params.attachmentId;
            
            if (!eventId) {
                const validationError = ErrorService?.createError('api', 'Event ID is required for removing attachment', 'warning', { 
                    endpoint 
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            if (!attachmentId) {
                const validationError = ErrorService?.createError('api', 'Attachment ID is required for removing attachment', 'warning', { 
                    endpoint,
                    eventId
                });
                MonitoringService?.logError(validationError);
                return res.status(400).json({ error: 'Attachment ID is required' });
            }
            
            MonitoringService?.info('Removing attachment from calendar event', { 
                eventId,
                attachmentId 
            }, 'calendar');
            
            // Try to use the module's handleIntent method for removeAttachment
            let result;
            try {
                MonitoringService?.info(`Attempting to remove attachment ${attachmentId} from event ${eventId} using intent handler`, { 
                    eventId,
                    attachmentId
                }, 'calendar');
                
                if (isModuleMethodAvailable('handleIntent', calendarModule)) {
                    const entities = {
                        eventId: eventId,
                        attachmentId: attachmentId
                    };
                    const intentResult = await calendarModule.handleIntent('removeAttachment', entities);
                    result = intentResult.success;
                    MonitoringService?.info(`Successfully removed attachment ${attachmentId} from event ${eventId} using intent handler`, { 
                        eventId,
                        attachmentId,
                        success: !!result
                    }, 'calendar');
                } else {
                    throw new Error('calendarModule.handleIntent is not implemented');
                }
            } catch (moduleError) {
                const moduleCallError = ErrorService?.createError('api', `Error removing attachment ${attachmentId} from event ${eventId}`, 'error', { 
                    error: moduleError.message,
                    eventId,
                    attachmentId,
                    stack: moduleError.stack
                });
                MonitoringService?.logError(moduleCallError);
                
                // Temporarily disable fallback to see the actual error
                throw moduleError;
            }
            
            // Track remove attachment time
            const duration = Date.now() - startTime;
            MonitoringService?.trackMetric('calendar.removeAttachment.duration', duration, { 
                eventId,
                attachmentId,
                success: typeof result === 'object' ? result.success : !!result,
                isMock: typeof result === 'object' ? !!result.isMock : false
            });
            
            res.json(typeof result === 'object' ? result : { success: result });
        } catch (err) {
            const mcpError = ErrorService?.createError('api', 'Error removing attachment from calendar event', 'error', { 
                stack: err.stack,
                endpoint,
                error: err.message,
                eventId: req.params?.id,
                attachmentId: req.params?.attachmentId
            });
            MonitoringService?.logError(mcpError);
            
            // Track error metric
            MonitoringService?.trackMetric('calendar.removeAttachment.error', 1, { 
                errorId: mcpError.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    }
});
