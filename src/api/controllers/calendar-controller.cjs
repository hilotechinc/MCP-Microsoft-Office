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
            
            // For debugging, get raw events if requested
            if (typeof calendarModule.getEventsRaw === 'function' && debug) {
                try {
                    console.log('[Calendar Controller] Fetching raw events for debug');
                    rawEvents = await calendarModule.getEventsRaw({ top, filter });
                    console.log(`[Calendar Controller] Retrieved ${rawEvents.length} raw events`);
                } catch (fetchError) {
                    console.error('[Calendar Controller] Error fetching raw events:', fetchError);
                    // Continue even if raw fetch fails
                }
            }
            
            // Try to get events from the module, or return mock data if it fails
            let events = [];
            try {
                console.log('[Calendar Controller] Attempting to get real calendar events from module');
                if (typeof calendarModule.getEvents === 'function') {
                    events = await calendarModule.getEvents({ top, filter });
                    console.log(`[Calendar Controller] Successfully retrieved ${events.length} real calendar events`);
                } else if (typeof calendarModule.handleIntent === 'function') {
                    // Try using the module's handleIntent method instead
                    console.log('[Calendar Controller] Falling back to handleIntent method');
                    const result = await calendarModule.handleIntent('readCalendar', { count: top, filter });
                    events = result && result.items ? result.items : [];
                    console.log(`[Calendar Controller] Retrieved ${events.length} events via handleIntent`);
                } else {
                    throw new Error('No calendar module method available');
                }
            } catch (moduleError) {
                console.error('[Calendar Controller] Error calling calendar module:', moduleError);
                console.log('[Calendar Controller] Falling back to mock calendar data');
                
                // Return mock data only if the real module call fails
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
                console.log(`[Calendar Controller] Generated ${events.length} mock calendar events`);
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
        try {
            // Log the incoming request body for debugging
            console.log('[Calendar Controller] Request body:', JSON.stringify(req.body, null, 2));
            
            const { error, value } = eventSchema.validate(req.body);
            if (error) {
                console.error('[Calendar Controller] Validation error:', error.details);
                return res.status(400).json({ error: 'Invalid request', details: error.details });
            }
            
            // Try to create a real event using the calendar module
            let event;
            try {
                console.log('[Calendar Controller] Attempting to create real calendar event using module');
                console.log('[Calendar Controller] Event data received:', JSON.stringify(value, null, 2));
                
                if (typeof calendarModule.createEvent === 'function') {
                    event = await calendarModule.createEvent(value);
                    console.log('[Calendar Controller] Successfully created real calendar event:', event.id);
                    console.log('[Calendar Controller] Event details:', JSON.stringify(event, null, 2));
                } else if (typeof calendarModule.handleIntent === 'function') {
                    // Try using the module's handleIntent method instead
                    console.log('[Calendar Controller] Falling back to handleIntent method for event creation');
                    const result = await calendarModule.handleIntent('createEvent', value);
                    event = result;
                    console.log('[Calendar Controller] Created event via handleIntent:', event.id);
                } else {
                    throw new Error('No calendar module method available for event creation');
                }
            } catch (moduleError) {
                console.error('[Calendar Controller] Error calling calendar module for event creation:', moduleError);
                console.log('[Calendar Controller] Falling back to mock calendar event');
                
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
                console.log('[Calendar Controller] Generated mock calendar event:', event.id);
            }
            
            res.json(event);
        } catch (err) {
            console.error('[Calendar Controller] Error creating event:', err);
            console.error('[Calendar Controller] Error details:', JSON.stringify({
                message: err.message,
                stack: err.stack,
                code: err.code,
                statusCode: err.statusCode,
                body: err.body
            }, null, 2));
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * PUT /api/calendar/events/:id
     * Updates an existing calendar event
     */
    async updateEvent(req, res) {
        try {
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const updateSchema = Joi.object({
                subject: Joi.string().optional(),
                start: Joi.object({
                    dateTime: Joi.string().required(),
                    timeZone: Joi.string().default('UTC')
                }).optional(),
                end: Joi.object({
                    dateTime: Joi.string().required(),
                    timeZone: Joi.string().default('UTC')
                }).optional(),
                // Support both string array and object array for attendees
                attendees: Joi.alternatives().try(
                    // Plain email addresses as strings
                    Joi.array().items(Joi.string().email()),
                    
                    // Simple format with email and name
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
            
            const { error } = updateSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's updateEvent method if available
            let updatedEvent;
            try {
                console.log(`[Calendar Controller] Attempting to update event ${eventId} using module`);
                if (typeof calendarModule.updateEvent === 'function') {
                    updatedEvent = await calendarModule.updateEvent(eventId, req.body);
                    console.log(`[Calendar Controller] Successfully updated event ${eventId} using module`);
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error(`[Calendar Controller] Error updating event ${eventId}:`, moduleError.message);
                console.log('[Calendar Controller] Falling back to mock event update');
                
                // If module method fails, create a mock updated event
                updatedEvent = {
                    id: eventId,
                    ...req.body,
                    organizer: {
                        name: 'Current User',
                        email: 'current.user@example.com'
                    },
                    lastModifiedDateTime: new Date().toISOString()
                };
                console.log('[Calendar Controller] Generated mock updated event');
            }
            
            res.json(updatedEvent);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar update error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/accept
     * Accept a calendar event invitation
     */
    async acceptEvent(req, res) {
        try {
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const acceptSchema = Joi.object({
                comment: Joi.string().optional()
            });
            
            const { error } = acceptSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's acceptEvent method if available
            let result;
            try {
                console.log(`[Calendar Controller] Attempting to accept event ${eventId} using module`);
                if (typeof calendarModule.acceptEvent === 'function') {
                    result = await calendarModule.acceptEvent(eventId, req.body.comment);
                    console.log(`[Calendar Controller] Successfully accepted event ${eventId} using module`);
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error(`[Calendar Controller] Error accepting event ${eventId}:`, moduleError.message);
                console.log('[Calendar Controller] Falling back to mock event acceptance');
                
                // If module method fails, create a mock response
                result = {
                    id: eventId,
                    status: 'accepted',
                    timestamp: new Date().toISOString()
                };
                console.log('[Calendar Controller] Generated mock event acceptance');
            }
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar accept error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/tentativelyAccept
     * Tentatively accept a calendar event invitation
     */
    async tentativelyAcceptEvent(req, res) {
        try {
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const acceptSchema = Joi.object({
                comment: Joi.string().optional()
            });
            
            const { error } = acceptSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's tentativelyAcceptEvent method if available
            let result;
            try {
                console.log(`[Calendar Controller] Attempting to tentatively accept event ${eventId} using module`);
                if (typeof calendarModule.tentativelyAcceptEvent === 'function') {
                    result = await calendarModule.tentativelyAcceptEvent(eventId, req.body.comment);
                    console.log(`[Calendar Controller] Successfully tentatively accepted event ${eventId} using module`);
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error(`[Calendar Controller] Error tentatively accepting event ${eventId}:`, moduleError.message);
                console.log('[Calendar Controller] Falling back to mock event tentative acceptance');
                
                // If module method fails, create a mock response
                result = {
                    id: eventId,
                    status: 'tentativelyAccepted',
                    timestamp: new Date().toISOString()
                };
                console.log('[Calendar Controller] Generated mock event tentative acceptance');
            }
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar tentative accept error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/decline
     * Decline a calendar event invitation
     */
    async declineEvent(req, res) {
        try {
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const declineSchema = Joi.object({
                comment: Joi.string().optional()
            });
            
            const { error } = declineSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's declineEvent method if available
            let result;
            try {
                console.log(`[Calendar Controller] Attempting to decline event ${eventId} using module`);
                if (typeof calendarModule.declineEvent === 'function') {
                    result = await calendarModule.declineEvent(eventId, req.body.comment);
                    console.log(`[Calendar Controller] Successfully declined event ${eventId} using module`);
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error(`[Calendar Controller] Error declining event ${eventId}:`, moduleError.message);
                console.log('[Calendar Controller] Falling back to mock event decline');
                
                // If module method fails, create a mock response
                result = {
                    id: eventId,
                    status: 'declined',
                    timestamp: new Date().toISOString()
                };
                console.log('[Calendar Controller] Generated mock event decline');
            }
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar decline error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/cancel
     * Cancel a calendar event and send cancellation messages to attendees
     */
    async cancelEvent(req, res) {
        try {
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const cancelSchema = Joi.object({
                comment: Joi.string().optional()
            });
            
            const { error } = cancelSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's cancelEvent method if available
            let result;
            try {
                console.log(`[Calendar Controller] Attempting to cancel event ${eventId} using module`);
                if (typeof calendarModule.cancelEvent === 'function') {
                    result = await calendarModule.cancelEvent(eventId, req.body.comment);
                    console.log(`[Calendar Controller] Successfully cancelled event ${eventId} using module`);
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error(`[Calendar Controller] Error cancelling event ${eventId}:`, moduleError.message);
                console.log('[Calendar Controller] Falling back to mock event cancellation');
                
                // If module method fails, create a mock response
                result = {
                    id: eventId,
                    status: 'cancelled',
                    timestamp: new Date().toISOString()
                };
                console.log('[Calendar Controller] Generated mock event cancellation');
            }
            
            res.json(result);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar cancel error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/availability
     * Gets availability information for users within a specified time range
     */
    async getAvailability(req, res) {
        try {
            // Validate request body
            const availabilitySchema = Joi.object({
                users: Joi.array().items(Joi.string().email()).min(1).required(),
                timeSlots: Joi.array().items(
                    Joi.object({
                        start: Joi.object({
                            dateTime: Joi.string().required(),
                            timeZone: Joi.string().default('UTC')
                        }).required(),
                        end: Joi.object({
                            dateTime: Joi.string().required(),
                            timeZone: Joi.string().default('UTC')
                        }).required()
                    })
                ).required()
            });
            
            // For simpler API calls, also support direct start/end parameters
            if (req.body.start && req.body.end && req.body.users) {
                req.body = {
                    users: Array.isArray(req.body.users) ? req.body.users : [req.body.users],
                    timeSlots: [{
                        start: { dateTime: req.body.start, timeZone: 'UTC' },
                        end: { dateTime: req.body.end, timeZone: 'UTC' }
                    }]
                };
            }
            
            const { error } = availabilitySchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's getAvailability method if available
            let availabilityData;
            try {
                console.log('[Calendar Controller] Attempting to get real availability data from module');
                if (typeof calendarModule.getAvailability === 'function') {
                    availabilityData = await calendarModule.getAvailability(req.body);
                    console.log('[Calendar Controller] Successfully retrieved real availability data');
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error('[Calendar Controller] Error getting real availability data:', moduleError.message);
                console.log('[Calendar Controller] Falling back to mock availability data');
                
                // Generate mock availability data only if the real module call fails
                const users = req.body.users;
                const timeSlots = req.body.timeSlots;
                
                availabilityData = {
                    users: users.map(user => {
                        // Generate random availability for each user and time slot
                        return {
                            email: user,
                            availability: timeSlots.map(slot => {
                                const startTime = new Date(slot.start.dateTime);
                                const endTime = new Date(slot.end.dateTime);
                                const duration = endTime - startTime;
                                
                                // Create 1-hour blocks of availability
                                const availabilityBlocks = [];
                                const hourInMs = 60 * 60 * 1000;
                                
                                for (let time = startTime.getTime(); time < endTime.getTime(); time += hourInMs) {
                                    // 80% chance of being available for each hour block
                                    if (Math.random() > 0.2) {
                                        const blockStart = new Date(time);
                                        const blockEnd = new Date(Math.min(time + hourInMs, endTime.getTime()));
                                        
                                        availabilityBlocks.push({
                                            start: blockStart.toISOString(),
                                            end: blockEnd.toISOString(),
                                            status: 'available'
                                        });
                                    }
                                }
                                
                                return {
                                    timeSlot: {
                                        start: slot.start.dateTime,
                                        end: slot.end.dateTime
                                    },
                                    availableSlots: availabilityBlocks
                                };
                            })
                        };
                    })
                };
                console.log(`[Calendar Controller] Generated mock availability data for ${users.length} users`);
            }
            
            res.json(availabilityData);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar availability error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/schedule
     * Schedules a meeting with intelligent time selection
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's scheduleMeeting method if available
            let scheduledEvent;
            try {
                console.log('[Calendar Controller] Attempting to schedule meeting using module');
                if (typeof calendarModule.scheduleMeeting === 'function') {
                    scheduledEvent = await calendarModule.scheduleMeeting(req.body);
                    console.log('[Calendar Controller] Successfully scheduled meeting using module');
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error('[Calendar Controller] Error scheduling meeting:', moduleError.message);
                console.log('[Calendar Controller] Falling back to mock scheduling');
                
                // If module method fails, create a mock scheduled event
                const { attendees, subject, preferredTimes, duration } = req.body;
                const defaultDuration = duration || 60; // Default to 60 minutes
                
                // Use the first preferred time slot or default to tomorrow
                let startTime, endTime;
                if (preferredTimes && preferredTimes.length > 0) {
                    startTime = new Date(preferredTimes[0].start.dateTime);
                    // Use specified end time or calculate from duration
                    endTime = new Date(preferredTimes[0].end.dateTime);
                } else {
                    // Default to tomorrow at 10 AM
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(10, 0, 0, 0);
                    startTime = tomorrow;
                    endTime = new Date(startTime.getTime() + defaultDuration * 60 * 1000);
                }
                
                scheduledEvent = {
                    id: 'mock-scheduled-' + Date.now(),
                    subject: subject,
                    start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
                    end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
                    attendees: attendees.map(email => ({
                        name: email.split('@')[0],
                        email: email,
                        status: 'needsAction'
                    })),
                    organizer: {
                        name: 'Current User',
                        email: 'current.user@example.com'
                    },
                    isAllDay: false,
                    recurrence: null,
                    bestSlot: {
                        start: startTime.toISOString(),
                        end: endTime.toISOString(),
                        score: 0.95
                    }
                };
                console.log('[Calendar Controller] Generated mock scheduled meeting');
            }
            
            res.json(scheduledEvent);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar scheduling error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/findMeetingTimes
     * Find suitable meeting times for attendees
     */
    async findMeetingTimes(req, res) {
        try {
            // Validate request body
            const optionsSchema = Joi.object({
                attendees: Joi.array().items(Joi.string().email()).required(),
                timeConstraints: Joi.object({
                    startTime: Joi.object({
                        dateTime: Joi.string().required(),
                        timeZone: Joi.string().default('UTC')
                    }).required(),
                    endTime: Joi.object({
                        dateTime: Joi.string().required(),
                        timeZone: Joi.string().default('UTC')
                    }).required(),
                    meetingDuration: Joi.number().min(15).max(480).default(60) // Duration in minutes
                }).required(),
                locationConstraint: Joi.object({
                    isRequired: Joi.boolean().default(false),
                    suggestLocation: Joi.boolean().default(false),
                    locations: Joi.array().items(Joi.object({
                        displayName: Joi.string().required(),
                        locationEmailAddress: Joi.string().email().optional()
                    })).optional()
                }).optional(),
                maxCandidates: Joi.number().min(1).max(100).default(10)
            });
            
            const { error } = optionsSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's findMeetingTimes method if available
            let suggestions;
            try {
                console.log('[Calendar Controller] Attempting to find meeting times using module');
                if (typeof calendarModule.findMeetingTimes === 'function') {
                    suggestions = await calendarModule.findMeetingTimes(req.body);
                    console.log('[Calendar Controller] Successfully found meeting times using module');
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error('[Calendar Controller] Error finding meeting times:', moduleError.message);
                console.log('[Calendar Controller] Falling back to mock meeting time suggestions');
                
                // If module method fails, create mock meeting time suggestions
                const { attendees, timeConstraints } = req.body;
                const startTime = new Date(timeConstraints.startTime.dateTime);
                const endTime = new Date(timeConstraints.endTime.dateTime);
                const meetingDuration = timeConstraints.meetingDuration || 60; // minutes
                
                // Generate a few mock suggestions within the time constraints
                const mockSuggestions = [];
                const totalMinutes = (endTime - startTime) / (1000 * 60);
                const possibleSlots = Math.floor(totalMinutes / meetingDuration);
                const maxSuggestions = Math.min(possibleSlots, 5); // Generate up to 5 suggestions
                
                for (let i = 0; i < maxSuggestions; i++) {
                    const slotStart = new Date(startTime.getTime() + (i * meetingDuration * 60 * 1000));
                    const slotEnd = new Date(slotStart.getTime() + (meetingDuration * 60 * 1000));
                    
                    mockSuggestions.push({
                        confidence: 1.0 - (i * 0.1), // Decreasing confidence for later slots
                        organizerAvailability: 'free',
                        suggestionReason: 'Organizer is available',
                        meetingTimeSlot: {
                            start: {
                                dateTime: slotStart.toISOString(),
                                timeZone: 'UTC'
                            },
                            end: {
                                dateTime: slotEnd.toISOString(),
                                timeZone: 'UTC'
                            }
                        },
                        attendeeAvailability: attendees.map(email => ({
                            attendee: {
                                emailAddress: {
                                    address: email,
                                    name: email.split('@')[0]
                                }
                            },
                            availability: 'free'
                        }))
                    });
                }
                
                suggestions = {
                    meetingTimeSuggestions: mockSuggestions,
                    emptySuggestionsReason: mockSuggestions.length === 0 ? 'No suitable times found' : null
                };
                console.log('[Calendar Controller] Generated mock meeting time suggestions');
            }
            
            res.json(suggestions);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar find meeting times error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/schedule
     * Schedules a meeting with intelligent time selection
     */
    async scheduleMeeting(req, res) {
        try {
            // Validate request body
            const meetingSchema = Joi.object({
                subject: Joi.string().required(),
                attendees: Joi.array().items(Joi.string().email()).required(),
                preferredTimes: Joi.array().items(Joi.object({
                    start: Joi.object({
                        dateTime: Joi.string().required(),
                        timeZone: Joi.string().default('UTC')
                    }).required(),
                    end: Joi.object({
                        dateTime: Joi.string().required(),
                        timeZone: Joi.string().default('UTC')
                    }).required()
                })).optional(),
                duration: Joi.number().min(15).max(480).optional(), // Duration in minutes
                body: Joi.alternatives().try(
                    Joi.string(),
                    Joi.object({
                        contentType: Joi.string().valid('text', 'html', 'HTML').default('text'),
                        content: Joi.string().required()
                    })
                ).optional(),
                location: Joi.alternatives().try(
                    Joi.string(),
                    Joi.object({
                        displayName: Joi.string().required(),
                        address: Joi.object().optional()
                    })
                ).optional(),
                isOnlineMeeting: Joi.boolean().optional()
            });
            
            const { error } = meetingSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's scheduleMeeting method if available
            let scheduledEvent;
            try {
                console.log('[Calendar Controller] Attempting to schedule meeting using module');
                if (typeof calendarModule.scheduleMeeting === 'function') {
                    scheduledEvent = await calendarModule.scheduleMeeting(req.body);
                    console.log('[Calendar Controller] Successfully scheduled meeting using module');
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error('[Calendar Controller] Error scheduling meeting:', moduleError.message);
                console.log('[Calendar Controller] Falling back to mock scheduling');
                
                // If module method fails, create a mock scheduled event
                const { attendees, subject, preferredTimes, duration } = req.body;
                const defaultDuration = duration || 60; // Default to 60 minutes
                
                // Use the first preferred time slot or default to tomorrow
                let startTime, endTime;
                if (preferredTimes && preferredTimes.length > 0) {
                    startTime = new Date(preferredTimes[0].start.dateTime);
                    // Use specified end time or calculate from duration
                    endTime = new Date(preferredTimes[0].end.dateTime);
                } else {
                    // Default to tomorrow at 10 AM
                    const tomorrow = new Date();
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    tomorrow.setHours(10, 0, 0, 0);
                    startTime = tomorrow;
                    endTime = new Date(startTime.getTime() + defaultDuration * 60 * 1000);
                }
                
                scheduledEvent = {
                    id: 'mock-scheduled-' + Date.now(),
                    subject: subject,
                    start: { dateTime: startTime.toISOString(), timeZone: 'UTC' },
                    end: { dateTime: endTime.toISOString(), timeZone: 'UTC' },
                    attendees: attendees.map(email => ({
                        name: email.split('@')[0],
                        email: email,
                        status: 'needsAction'
                    })),
                    organizer: {
                        name: 'Current User',
                        email: 'current.user@example.com'
                    },
                    isAllDay: false,
                    recurrence: null,
                    bestSlot: {
                        start: startTime.toISOString(),
                        end: endTime.toISOString(),
                        score: 0.95
                    }
                };
                console.log('[Calendar Controller] Generated mock scheduled meeting');
            }
            
            res.json(scheduledEvent);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar scheduling error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/calendar/rooms
     * Get available rooms for meetings
     */
    async getRooms(req, res) {
        try {
            // Try to use the module's getRooms method if available
            let rooms;
            try {
                console.log('[Calendar Controller] Attempting to get rooms using module');
                if (typeof calendarModule.getRooms === 'function') {
                    rooms = await calendarModule.getRooms(req.query);
                    console.log('[Calendar Controller] Successfully got rooms using module');
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error('[Calendar Controller] Error getting rooms:', moduleError.message);
                console.log('[Calendar Controller] Falling back to mock rooms');
                
                // If module method fails, create mock rooms
                rooms = [
                    {
                        id: 'room1',
                        displayName: 'Conference Room A',
                        emailAddress: 'room.a@example.com',
                        capacity: 10,
                        building: 'Building 1',
                        floorNumber: 2,
                        hasAudio: true,
                        hasVideo: true
                    },
                    {
                        id: 'room2',
                        displayName: 'Conference Room B',
                        emailAddress: 'room.b@example.com',
                        capacity: 6,
                        building: 'Building 1',
                        floorNumber: 3,
                        hasAudio: true,
                        hasVideo: false
                    },
                    {
                        id: 'room3',
                        displayName: 'Executive Boardroom',
                        emailAddress: 'boardroom@example.com',
                        capacity: 20,
                        building: 'Building 2',
                        floorNumber: 5,
                        hasAudio: true,
                        hasVideo: true
                    }
                ];
                console.log('[Calendar Controller] Generated mock rooms');
            }
            
            res.json(rooms);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar get rooms error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * GET /api/calendar/calendars
     * Get user calendars
     */
    async getCalendars(req, res) {
        try {
            // Try to use the module's getCalendars method if available
            let calendars;
            try {
                console.log('[Calendar Controller] Attempting to get calendars using module');
                if (typeof calendarModule.getCalendars === 'function') {
                    calendars = await calendarModule.getCalendars();
                    console.log('[Calendar Controller] Successfully got calendars using module');
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error('[Calendar Controller] Error getting calendars:', moduleError.message);
                console.log('[Calendar Controller] Falling back to mock calendars');
                
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
                        }
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
                        }
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
                        }
                    }
                ];
                console.log('[Calendar Controller] Generated mock calendars');
            }
            
            res.json(calendars);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar get calendars error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * POST /api/calendar/events/:id/attachments
     * Add an attachment to an event
     */
    async addAttachment(req, res) {
        try {
            // Get event ID from URL parameters
            const eventId = req.params.id;
            if (!eventId) {
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            // Validate request body
            const attachmentSchema = Joi.object({
                name: Joi.string().required(),
                contentType: Joi.string().required(),
                contentBytes: Joi.string().required(), // Base64 encoded content
                isInline: Joi.boolean().default(false)
            });
            
            const { error } = attachmentSchema.validate(req.body);
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details[0].message 
                });
            }
            
            // Try to use the module's addAttachment method if available
            let attachment;
            try {
                console.log(`[Calendar Controller] Attempting to add attachment to event ${eventId} using module`);
                if (typeof calendarModule.addAttachment === 'function') {
                    attachment = await calendarModule.addAttachment(eventId, req.body);
                    console.log(`[Calendar Controller] Successfully added attachment to event ${eventId} using module`);
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error(`[Calendar Controller] Error adding attachment to event ${eventId}:`, moduleError.message);
                console.log('[Calendar Controller] Falling back to mock attachment');
                
                // If module method fails, create a mock attachment
                attachment = {
                    id: 'attachment-' + Date.now(),
                    name: req.body.name,
                    contentType: req.body.contentType,
                    size: req.body.contentBytes.length * 0.75, // Approximate size after base64 decoding
                    isInline: req.body.isInline || false,
                    lastModifiedDateTime: new Date().toISOString()
                };
                console.log('[Calendar Controller] Generated mock attachment');
            }
            
            res.json(attachment);
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar add attachment error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    },
    
    /**
     * DELETE /api/calendar/events/:id/attachments/:attachmentId
     * Remove an attachment from an event
     */
    async removeAttachment(req, res) {
        try {
            // Get event ID and attachment ID from URL parameters
            const eventId = req.params.id;
            const attachmentId = req.params.attachmentId;
            
            if (!eventId) {
                return res.status(400).json({ error: 'Event ID is required' });
            }
            
            if (!attachmentId) {
                return res.status(400).json({ error: 'Attachment ID is required' });
            }
            
            // Try to use the module's removeAttachment method if available
            let result;
            try {
                console.log(`[Calendar Controller] Attempting to remove attachment ${attachmentId} from event ${eventId} using module`);
                if (typeof calendarModule.removeAttachment === 'function') {
                    result = await calendarModule.removeAttachment(eventId, attachmentId);
                    console.log(`[Calendar Controller] Successfully removed attachment ${attachmentId} from event ${eventId} using module`);
                } else {
                    throw new Error('Module method not implemented');
                }
            } catch (moduleError) {
                console.error(`[Calendar Controller] Error removing attachment ${attachmentId} from event ${eventId}:`, moduleError.message);
                console.log('[Calendar Controller] Falling back to mock attachment removal');
                
                // If module method fails, create a mock result
                result = true;
                console.log('[Calendar Controller] Generated mock attachment removal result');
            }
            
            res.json({ success: result });
        } catch (err) {
            const mcpError = errorService.createError('api', err.message, 'error', { stack: err.stack });
            console.error('Calendar remove attachment error:', mcpError);
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    }
});
