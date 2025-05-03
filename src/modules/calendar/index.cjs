/**
 * @fileoverview MCP Calendar Module - Handles calendar-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system and phase1_architecture.md.
 */

const Joi = require('joi');
const { normalizeEvent } = require('../../graph/normalizers.cjs');
const moment = require('moment'); // For duration calculations

const CALENDAR_CAPABILITIES = [
    'getEvents',
    'createEvent',
    'updateEvent',
    'getAvailability',
    'scheduleMeeting',
    'acceptEvent',
    'tentativelyAcceptEvent',
    'declineEvent',
    'cancelEvent',
    'findMeetingTimes',
    'getRooms',
    'getCalendars',
    'addAttachment',
    'removeAttachment'
];

// --- Attachment Constants and Schema ---
const MAX_ATTACHMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB
const ALLOWED_ATTACHMENT_TYPES = new Set([
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',     // .xlsx
    'application/vnd.openxmlformats-officedocument.presentationml.presentation', // .pptx
    'text/plain',
    'image/jpeg',
    'image/png',
    'image/gif'
]);

const attachmentSchema = Joi.object({
    name: Joi.string().required(),
    contentType: Joi.string().custom((value, helpers) => {
        if (!ALLOWED_ATTACHMENT_TYPES.has(value)) {
            return helpers.error('attachment.invalidType', { value });
        }
        return value;
    }).required(),
    contentBytes: Joi.string().base64().required().max(MAX_ATTACHMENT_SIZE_BYTES).messages({
        'string.max': `Attachment size exceeds the limit of ${MAX_ATTACHMENT_SIZE_BYTES / 1024 / 1024} MB.`,
        'any.required': 'Attachment contentBytes are required.',
        'string.base64': 'Attachment contentBytes must be a valid base64 string.'
    }),
    // Ensure '@odata.type' is correctly set if required by Graph API
    '@odata.type': Joi.string().valid('#microsoft.graph.fileAttachment').default('#microsoft.graph.fileAttachment')
}).required().messages({
    'attachment.invalidType': 'Attachment content type \"{#value}\" is not allowed.'
});
// --- End Attachment Constants and Schema ---

const CalendarModule = {
    /**
     * Fetch raw calendar events from Graph for debugging (no normalization)
     * @param {object} options
     * @returns {Promise<object[]>}
     */
    async getEventsRaw(options = {}) {
        // TODO: [getEventsRaw] Restrict to admin/debug mode (LOW)
        if (process.env.NODE_ENV === 'production') {
            // TODO: Use a centralized ErrorService or specific error type
            throw new Error('getEventsRaw is only available in non-production environments.');
        }

        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getEventsRaw !== 'function') {
            throw new Error('GraphService.getEventsRaw not implemented');
        }
        return await graphService.getEventsRaw(options);
    },
    
    /**
     * Fetch calendar events from Graph and normalize them
     * @param {object} options
     * @returns {Promise<object[]>}
     */
    async getEvents(options = {}) {
        // TODO: [getEvents] Pass req.user to service for caching (MEDIUM)
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getEvents !== 'function') {
            throw new Error('GraphService.getEvents not implemented');
        }
        
        // Extract user context if available in options.req for the service layer (e.g., caching)
        const userContext = options.req && options.req.user ? { user: options.req.user } : {};
        
        // Pass original options along with extracted user context
        return await graphService.getEvents({ ...options, ...userContext });
    },
    
    /**
     * Creates a calendar event using the Graph Service.
     * This function is exposed as a capability and called by handleIntent.
     *
     * @param {object} eventData - The event data.
     * @param {string} eventData.subject - The subject of the event.
     * @param {object} eventData.start - The start time of the event.
     * @param {string} eventData.start.dateTime - The date and time in ISO 8601 format (e.g., '2025-04-30T12:00:00').
     * @param {string} eventData.start.timeZone - The time zone (e.g., 'America/Los_Angeles', 'UTC').
     * @param {object} eventData.end - The end time of the event.
     * @param {string} eventData.end.dateTime - The date and time in ISO 8601 format.
     * @param {string} eventData.end.timeZone - The time zone.
     * @param {Array<object>} [eventData.attendees] - Optional. Array of attendees.
     * @param {object} eventData.attendees[].emailAddress - Attendee email address.
     * @param {string} eventData.attendees[].emailAddress.address - The email address.
     * @param {string} [eventData.attendees[].emailAddress.name] - Optional. Attendee name.
     * @param {string} [eventData.attendees[].type="required"] - Attendee type ('required', 'optional', 'resource'). Defaults to 'required'.
     * @param {object} [eventData.body] - Optional. The body of the event.
     * @param {string} [eventData.body.contentType="HTML"] - Content type ('HTML' or 'text').
     * @param {string} eventData.body.content - The content of the body.
     * @param {boolean} [eventData.isOnlineMeeting=false] - Optional. Whether the event is an online meeting.
     * @param {object} [req] - Optional Express request object, potentially containing user context.
     * @returns {Promise<object>} The *normalized* created event object.
     * @throws {Error} If the Graph Service fails to create the event.
     */
    async createEvent(eventData, req) {
        // TODO: [createEvent] Ensure attendees resolve + return normalized (HIGH)
        
        try {
            // Delegate directly to the graph service function that handles attendees
            // This ensures the capability accurately reflects what `handleIntent` does.
            const graphService = this.services?.graphService;
            
            if (!graphService) {
                throw new Error('Graph service not available');
            }
            
            let finalEventData = { ...eventData };

            // 1. Resolve attendee names if attendees are provided
            if (Array.isArray(finalEventData.attendees) && finalEventData.attendees.length > 0) {
                if (typeof graphService.resolveAttendeeNames !== 'function') {
                    throw new Error('GraphService.resolveAttendeeNames not implemented');
                }
                console.log(`Resolving ${finalEventData.attendees.length} attendees...`);
                const resolvedAttendees = await graphService.resolveAttendeeNames(finalEventData.attendees);
                finalEventData.attendees = resolvedAttendees;
                console.log('Attendees resolved.');
            }

            // 2. Create the event via the service
            const createdEvent = await graphService.createEvent(finalEventData);
            console.log('Event created successfully by graphService:', createdEvent.id);

            // 3. Normalize the result before returning
            return normalizeEvent(createdEvent);
            
        } catch (error) {
            // Access services via this.services
            const errorService = this.services?.errorService;
            const monitoringService = this.services?.monitoringService;

            // Check if services are available before calling
            if (errorService && monitoringService) {
                const mcpError = errorService.createError(
                  'calendar_module',
                  `Failed to create event via module: ${error.message}`,
                  'error',
                  { originalError: error.stack, eventData }
                );
                monitoringService.logError(mcpError);
                throw mcpError; // Re-throw the structured error
            } else {
                // Fallback if services are not available (should not happen in normal operation)
                console.error('ErrorService or MonitoringService not available in CalendarModule.createEvent');
                throw new Error(`Failed to create event via module (logging services unavailable): ${error.message}`);
            }
        }
    },
    
    /**
     * Update an existing calendar event after validating input and checking ownership.
     * @param {string} eventId - ID of the event to update.
     * @param {object} updates - Updated event data. Should contain at least one updateable field.
     * @param {object} [req] - Optional Express request object containing user context (`req.user`).
     * @returns {Promise<object>} Normalized updated event object.
     * @throws {Error} If validation fails, user is not authorized, or service fails.
     */
    async updateEvent(eventId, updates, req) {
        // TODO: [updateEvent] Validate updates + enforce ownership (MEDIUM)
        const { graphService, errorService, monitoringService } = this.services || {};

        // Ensure services are available
        if (!graphService || !errorService || !monitoringService) {
            // Use console.error as monitoringService might be unavailable
            console.error('updateEvent: Required services missing:', { graphService: !!graphService, errorService: !!errorService, monitoringService: !!monitoringService });
            throw new Error('Required services (Graph, Error, Monitoring) not available for updateEvent');
        }

        // 1. Define Validation Schema (Example - Expand as needed)
        // TODO: Define more robust Joi schemas, potentially shared
        const dateTimeTimeZoneSchema = Joi.object({
            dateTime: Joi.string().isoDate().required(),
            timeZone: Joi.string().required()
        });
        const emailAddressSchema = Joi.object({ address: Joi.string().email().required(), name: Joi.string() });
        const attendeeSchema = Joi.object({ emailAddress: emailAddressSchema.required(), type: Joi.string().valid('required', 'optional', 'resource') });
        const updateSchema = Joi.object({
            subject: Joi.string(),
            start: dateTimeTimeZoneSchema,
            end: dateTimeTimeZoneSchema,
            attendees: Joi.array().items(attendeeSchema),
            body: Joi.object({ contentType: Joi.string().valid('HTML', 'text'), content: Joi.string() }),
            location: Joi.object({ displayName: Joi.string() }), // Simplify for now
            isOnlineMeeting: Joi.boolean(),
            // Add other updateable fields here
        }).min(1).required(); // Require at least one field to update

        // 2. Validate Updates
        const { error: validationError, value: validatedUpdates } = updateSchema.validate(updates);
        if (validationError) {
            const err = errorService.createError('validation', `Invalid event update data: ${validationError.details[0].message}`, 'warn', { details: validationError.details });
            monitoringService.logError(err);
            throw err;
        }

        // 3. Get User Context (for permission check)
        // Assuming user email is the identifier for organizer check
        const currentUserEmail = req?.user?.mail;
        if (!currentUserEmail) {
             const err = errorService.createError('auth', 'User context not available for permission check during event update.', 'error');
             monitoringService.logError(err);
             throw err;
        }

        try {
            // 4. Fetch Original Event for Ownership Check
            if (typeof graphService.getEvent !== 'function') {
                // TODO: Add getEvent(eventId) to GraphService if missing
                throw new Error('GraphService.getEvent method not implemented, required for ownership check.');
            }
            const originalEvent = await graphService.getEvent(eventId);
            if (!originalEvent) {
                const err = errorService.createError('not_found', `Event with ID ${eventId} not found for update.`, 'warn');
                monitoringService.logError(err);
                throw err;
            }

            // 5. Enforce Ownership (Only organizer can update)
            const organizerEmail = originalEvent.organizer?.emailAddress?.address;
            if (!organizerEmail || organizerEmail.toLowerCase() !== currentUserEmail.toLowerCase()) {
                const err = errorService.createError('permission', 'User is not authorized to update this event (must be organizer).', 'error', { eventId, currentUser: currentUserEmail, organizer: organizerEmail });
                monitoringService.logError(err);
                throw err;
            }
            console.log(`Ownership verified for event update ${eventId}. User: ${currentUserEmail}`);

            // 6. Resolve Attendees (if being updated)
            let updatesToApply = { ...validatedUpdates };
            if (Array.isArray(updatesToApply.attendees) && updatesToApply.attendees.length > 0) {
                 if (typeof graphService.resolveAttendeeNames !== 'function') {
                    throw new Error('GraphService.resolveAttendeeNames not implemented');
                }
                console.log(`Resolving ${updatesToApply.attendees.length} attendees for update...`);
                // Pass only the attendee part to resolve function if needed
                const resolvedAttendees = await graphService.resolveAttendeeNames(updatesToApply.attendees);
                updatesToApply.attendees = resolvedAttendees;
                console.log('Attendees resolved for update.');
            }

            // 7. Call Graph Service to Update
            if (typeof graphService.updateEvent !== 'function') {
                throw new Error('GraphService.updateEvent not implemented');
            }
            const updatedGraphEvent = await graphService.updateEvent(eventId, updatesToApply);
            console.log(`Event ${eventId} updated successfully via graphService.`);

            // 8. Normalize Result
            return normalizeEvent(updatedGraphEvent);

        } catch (error) {
            // Handle errors from service calls or permission checks
            if (error.category) { // Re-throw structured errors
                throw error;
            }
            // Create a generic error if it wasn't already structured
            const mcpError = errorService.createError(
                'calendar_module',
                `Failed to update event ${eventId}: ${error.message}`,
                'error',
                { originalError: error.stack, eventId, updates }
            );
            monitoringService.logError(mcpError);
            throw mcpError;
        }
    },
    
    /**
     * Schedule a meeting with intelligent time selection
     * @param {object} options - Meeting options including attendees and preferred times
     * @returns {Promise<object>} Object containing suggestions and optionally the normalized scheduled event if autoSchedule was true and a slot was found.
     */
    async scheduleMeeting(options = {}) {
        // TODO: [scheduleMeeting] Handle no-slot case gracefully; expose suggestedTimes (HIGH)
        // Ensure required services and methods are available
        if (!this.services || !this.services.graphService || typeof this.services.graphService.findMeetingTimes !== 'function' || typeof this.services.graphService.createEvent !== 'function' || typeof this.services.graphService.resolveAttendeeNames !== 'function') {
            throw new Error('GraphService methods (findMeetingTimes, createEvent, resolveAttendeeNames) not implemented');
        }

        const { attendees, subject, timeConstraint, duration = 'PT60M', autoSchedule = true } = options;

        if (!attendees || attendees.length === 0 || !subject) {
            throw new Error('Attendees and subject are required for scheduleMeeting');
        }

        // 1. Resolve attendees first
        const resolvedAttendees = await this.services.graphService.resolveAttendeeNames(attendees);

        // 2. Find Meeting Times using the Graph Service
        const findMeetingTimesOptions = {
            attendees: resolvedAttendees,
            locationConstraint: options.locationConstraint, // Pass through if provided
            timeConstraint: timeConstraint, // Use provided constraints
            meetingDuration: duration,
            maxCandidates: 5 // Limit suggestions for performance
        };

        let suggestionsResult;
        try {
            suggestionsResult = await this.services.graphService.findMeetingTimes(findMeetingTimesOptions);
        } catch (error) {
            console.error('Error calling graphService.findMeetingTimes:', error);
            // TODO: Improve error handling, maybe return error info
            return { suggestions: [], event: null, status: 'error_finding_times' };
        }

        const suggestions = suggestionsResult?.meetingTimeSuggestions || [];

        // 3. Handle No Suitable Slot Found or autoSchedule is false
        // Find the best suggestion based on confidence (or other criteria)
        const bestSuggestion = suggestions.length > 0 ? suggestions.reduce((best, current) => (current.confidence > best.confidence ? current : best)) : null;

        if (!bestSuggestion || bestSuggestion.confidence < 0.5 || !autoSchedule) { // Example confidence threshold
            console.log(`No suitable slot found (or autoSchedule=false). Confidence: ${bestSuggestion?.confidence}. Returning suggestions only.`);
            return {
                suggestions: suggestions,
                event: null, // No event created
                status: !bestSuggestion ? 'no_slots_found' : (autoSchedule ? 'low_confidence_slot' : 'auto_schedule_off')
            };
        }

        // 4. Auto-Schedule Event in the Best Slot
        console.log(`Best slot found with confidence ${bestSuggestion.confidence}. Scheduling meeting.`);
        
        // Format the body data correctly for Graph API
        let formattedBody;
        if (options.body) {
            if (typeof options.body === 'string') {
                // If body is a string, convert to HTML content object
                formattedBody = {
                    contentType: 'HTML',
                    content: options.body
                };
            } else if (typeof options.body === 'object') {
                // If body is an object, ensure it has the required fields
                formattedBody = {
                    contentType: (options.body.contentType || 'HTML').toUpperCase(), // Normalize to uppercase
                    content: options.body.content || '' // Default to empty string if not provided
                };
                
                // Ensure contentType is one of the valid values
                if (!['HTML', 'TEXT'].includes(formattedBody.contentType)) {
                    formattedBody.contentType = 'HTML'; // Default to HTML if invalid
                }
            }
        } else {
            // Default empty body
            formattedBody = {
                contentType: 'HTML',
                content: ''
            };
        }
        
        // Log the best suggestion for debugging
        console.log(`Selected best suggestion:`, JSON.stringify(bestSuggestion, null, 2));
        
        // Get the slot data based on the structure of the best suggestion
        const slotData = bestSuggestion.meetingTimeSlot || bestSuggestion.timeSlot || bestSuggestion.slot;
        
        if (!slotData || !slotData.start || !slotData.end) {
            console.error('Invalid slot data in best suggestion:', bestSuggestion);
            throw new Error('Invalid meeting time slot data');
        }
        
        // Create the event data with correctly formatted body
        const eventDataToCreate = {
            subject: subject,
            start: {
                dateTime: new Date(slotData.start.dateTime).toISOString(),
                timeZone: slotData.start.timeZone || 'UTC'
            },
            end: {
                dateTime: new Date(slotData.end.dateTime).toISOString(),
                timeZone: slotData.end.timeZone || 'UTC'
            },
            attendees: resolvedAttendees, // Use resolved attendees
            body: formattedBody, // Use properly formatted body
            location: options.location, // Pass through if provided
            isOnlineMeeting: options.isOnlineMeeting || false // Default to false
        };
        
        console.log(`Prepared event data for creation:`, JSON.stringify({
            subject: eventDataToCreate.subject,
            startTime: eventDataToCreate.start.dateTime,
            endTime: eventDataToCreate.end.dateTime,
            attendees: eventDataToCreate.attendees.length,
            hasBody: !!eventDataToCreate.body
        }, null, 2));

        try {
            const createdEvent = await this.services.graphService.createEvent(eventDataToCreate);
            const normalizedEvent = normalizeEvent(createdEvent);

            // Return both the created event and the suggestions
            return {
                suggestions: suggestions,
                event: normalizedEvent,
                status: 'scheduled'
            };
        } catch (createError) {
            console.error('Error creating event during auto-schedule:', createError);
            // TODO: Use ErrorService
            // Return suggestions even if creation failed
            return {
                suggestions: suggestions,
                event: null,
                status: 'error_creating_event'
            };
        }
    },
    
    /**
     * Get availability for users within a specified time range
     * @param {object} options - Options object.
     * @param {Array<string|object>} options.users - Array of user emails or user objects.
     * @param {Array<object>} [options.timeSlots] - Array of time slots (e.g., [{ start: { dateTime, timeZone }, end: { dateTime, timeZone } }]). Required if duration is not provided.
     * @param {string} [options.duration] - ISO 8601 duration string (e.g., 'PT1H'). Required if timeSlots is not provided.
     * @param {string|Date} [options.windowStart=Date.now()] - Start time for the duration-based window.
     * @returns {Promise<object>} Availability data object.
     * @throws {Error} If input validation fails or Graph API call errors occur.
     */
    async getAvailability(options = {}) {
        // TODO: [getAvailability] Accept flexible window (slots/duration); bubble Graph errors (MEDIUM)
        const { graphService, errorService, monitoringService } = this.services || {};

        // Ensure services are available
        if (!graphService || !errorService || !monitoringService) {
            console.error('getAvailability: Required services missing.');
            throw new Error('Required services (Graph, Error, Monitoring) not available for getAvailability');
        }

        // Define validation schema
        const dateTimeTimeZoneSchema = Joi.object({
            dateTime: Joi.string().isoDate().required(),
            timeZone: Joi.string().required()
        });
        const timeSlotSchema = Joi.object({
            start: dateTimeTimeZoneSchema.required(),
            end: dateTimeTimeZoneSchema.required()
        });
        const availabilityOptionsSchema = Joi.object({
            users: Joi.array().items(Joi.string().email(), Joi.object()).min(1).required(),
            timeSlots: Joi.array().items(timeSlotSchema).min(1),
            duration: Joi.string().pattern(/^P(T\d+[HMS]|\d+[WD])$/), // Basic ISO 8601 Duration check
            windowStart: Joi.alternatives().try(Joi.string().isoDate(), Joi.date()).default(() => new Date().toISOString())
        })
        .xor('timeSlots', 'duration') // Must have one or the other
        .required();

        // Validate input
        const { error: validationError, value: validatedOptions } = availabilityOptionsSchema.validate(options);
        if (validationError) {
            const err = errorService.createError('validation', `Invalid availability options: ${validationError.details[0].message}`, 'warn', { details: validationError.details });
            monitoringService.logError(err);
            throw err;
        }

        console.log('[Calendar Module] Validated Options:', JSON.stringify(validatedOptions, null, 2));

        const { users, timeSlots, duration, windowStart } = validatedOptions;

        let startDateTime, endDateTime;

        // Determine start and end times
        if (timeSlots) {
            // Use the first provided time slot
            startDateTime = timeSlots[0].start.dateTime;
            endDateTime = timeSlots[0].end.dateTime;
            // TODO: Potentially support multiple time slots if Graph API allows?
        } else {
            // Calculate end time based on duration and windowStart
            startDateTime = moment(windowStart).toISOString();
            endDateTime = moment(startDateTime).add(moment.duration(duration)).toISOString();
        }

        console.log(`[Calendar Module] Extracted startDateTime: ${startDateTime} (Type: ${typeof startDateTime})`);
        console.log(`[Calendar Module] Extracted endDateTime: ${endDateTime} (Type: ${typeof endDateTime})`);

        try {
            if (typeof graphService.getAvailability !== 'function') {
                 throw new Error('GraphService.getAvailability method not implemented');
            }
            // Assuming graphService.getAvailability takes users array and start/end strings
            const availabilityData = await graphService.getAvailability(users, startDateTime, endDateTime);

            // Format the response (Keep existing formatting logic)
            const result = {
                users: []
            };
            // Process each user's availability
            for (let i = 0; i < availabilityData.length; i++) {
                const userData = availabilityData[i];
                // Match user email/object correctly - requires graphService to return identifier
                // This assumes userData.scheduleId is the email passed in; needs verification.
                const userIdentifier = userData.scheduleId;

                const userAvailability = {
                    identifier: userIdentifier, // Use the identifier returned by Graph
                    availability: []
                };

                // Process availability view
                if (userData.availabilityView) {
                    const availabilityView = userData.availabilityView;
                    const startTime = new Date(startDateTime);
                    const endTime = new Date(endDateTime);
                    const totalMinutes = (endTime - startTime) / (1000 * 60);
                    if (availabilityView.length === 0 || totalMinutes <= 0) continue; // Avoid division by zero
                    const slotIntervalDuration = totalMinutes / availabilityView.length * 60 * 1000; // in ms

                    const availableSlots = [];

                    // Parse the availability view string (0=free, 1=tentative, 2=busy, 3=oof, 4=workingElsewhere, 5=unknown)
                    for (let j = 0; j < availabilityView.length; j++) {
                        const status = availabilityView[j];
                        if (status === '0') { // Free
                            const slotStart = new Date(startTime.getTime() + (j * slotIntervalDuration));
                            const slotEnd = new Date(slotStart.getTime() + slotIntervalDuration);

                            availableSlots.push({
                                start: slotStart.toISOString(),
                                end: slotEnd.toISOString(),
                                status: 'available'
                            });
                        }
                    }

                    userAvailability.availability.push({
                        timeSlot: {
                            start: startDateTime,
                            end: endDateTime
                        },
                        availableSlots: availableSlots
                    });
                }
                // Include scheduleItems if returned by Graph
                if (userData.scheduleItems) {
                    userAvailability.scheduleItems = userData.scheduleItems.map(item => ({ // Simple pass-through for now
                        status: item.status,
                        subject: item.subject, // Optional, might not always be present
                        start: item.start.dateTime,
                        end: item.end.dateTime,
                        isPrivate: item.isPrivate
                    }));
                }
                result.users.push(userAvailability);
            }

            return result;

        } catch (error) {
            console.error(`Error fetching availability: ${error.message}`);
            // Bubble detailed Graph errors
            const graphDetails = {
                statusCode: error.statusCode,
                code: error.code, // e.g., ErrorItemNotFound, ErrorAccessDenied
                graphRequestId: error.requestId,
                originalMessage: error.message
            };
            const mcpError = errorService.createError(
                'graph_availability', // More specific category
                `Failed to get availability: ${error.code || error.message}`,
                error.statusCode && error.statusCode >= 500 ? 'error' : 'warn', // Treat client errors (4xx) as warnings
                { graphDetails, requestParams: { users, startDateTime, endDateTime } }
            );
            monitoringService.logError(mcpError);
            throw mcpError; // Re-throw the structured error
        }
    },
    
    /**
     * Private helper to handle common event actions (accept, decline, etc.).
     * @param {string} action - The action to perform ('accept', 'tentativelyAccept', 'decline', 'cancel').
     * @param {string} eventId - ID of the event to update.
     * @param {string} comment - Optional comment.
     * @returns {Promise<object>} Response from Graph Service.
     * @private
     */
    async _handleEventAction(action, eventId, comment = '') {
        // TODO: [eventActions] DRY up handlers (LOW)
        const { graphService, errorService, monitoringService } = this.services || {};
        const graphMethodName = `${action}Event`; // e.g., 'acceptEvent'

        if (!graphService || typeof graphService[graphMethodName] !== 'function') {
            console.error(`_handleEventAction: GraphService or method ${graphMethodName} not available.`);
            throw new Error(`Required GraphService method '${graphMethodName}' not implemented or service unavailable.`);
        }

        try {
            // Call the dynamic graph service method
            const result = await graphService[graphMethodName](eventId, comment);
            console.log(`Event action '${action}' for event ${eventId} successful.`);
            return result; // Typically returns void or confirmation
        } catch (error) {
            console.error(`Error performing '${action}' on event ${eventId}: ${error.message}`);
            const graphDetails = {
                statusCode: error.statusCode,
                code: error.code,
                graphRequestId: error.requestId,
                originalMessage: error.message
            };
            const mcpError = errorService.createError(
                `graph_${action.toLowerCase()}`, // e.g., graph_accept
                `Failed to ${action} event: ${error.code || error.message}`,
                'error', // Assume failure is an error
                { graphDetails, eventId, comment }
            );
            monitoringService.logError(mcpError);
            throw mcpError;
        }
    },
    
    /**
     * Accept a calendar event invitation
     * @param {string} eventId - ID of the event to accept
     * @param {string} comment - Optional comment to include with the response
     * @returns {Promise<object>} Response status
     */
    async acceptEvent(eventId, comment = '') {
        return await this._handleEventAction('accept', eventId, comment);
    },
    
    /**
     * Tentatively accept a calendar event invitation
     * @param {string} eventId - ID of the event to tentatively accept
     * @param {string} comment - Optional comment to include with the response
     * @returns {Promise<object>} Response status
     */
    async tentativelyAcceptEvent(eventId, comment = '') {
        return await this._handleEventAction('tentativelyAccept', eventId, comment);
    },
    
    /**
     * Decline a calendar event invitation
     * @param {string} eventId - ID of the event to decline
     * @param {string} comment - Optional comment to include with the response
     * @returns {Promise<object>} Response status
     */
    async declineEvent(eventId, comment = '') {
        return await this._handleEventAction('decline', eventId, comment);
    },
    
    /**
     * Cancel a calendar event and send cancellation messages to attendees
     * @param {string} eventId - ID of the event to cancel
     * @param {string} comment - Optional comment to include with the cancellation
     * @returns {Promise<object>} Response status
     */
    async cancelEvent(eventId, comment = '') {
        return await this._handleEventAction('cancel', eventId, comment);
    },
    
    /**
     * Find suitable meeting times for attendees
     * @param {object} options - Options for finding meeting times
     * @returns {Promise<object>} Meeting time suggestions
     */
    async findMeetingTimes(options = {}) {
        // TODO: [findMeetingTimes] Expose confidence weight (LOW)
        const { graphService, errorService, monitoringService } = this.services || {};

        if (!graphService || typeof graphService.findMeetingTimes !== 'function') {
            console.error('findMeetingTimes: GraphService or method graphService.findMeetingTimes not available.');
            throw new Error('Required GraphService method \'findMeetingTimes\' not implemented or service unavailable.');
        }
        if (!errorService || !monitoringService) {
            console.warn('findMeetingTimes: Error/Monitoring service missing, proceeding without structured error handling.');
        }

        try {
            console.log('Calling graphService.findMeetingTimes with options:', options); // Log options for debugging
            const result = await graphService.findMeetingTimes(options);
            // Assuming graphService returns the structure including confidence directly
            // No specific normalization needed here based on the TODO ("expose")
            console.log('graphService.findMeetingTimes successful.');
            return result;
        } catch (error) {
            console.error(`Error finding meeting times: ${error.message}`);
            if (errorService && monitoringService) {
                const graphDetails = {
                    statusCode: error.statusCode,
                    code: error.code,
                    graphRequestId: error.requestId,
                    originalMessage: error.message
                };
                const mcpError = errorService.createError(
                    'graph_find_times',
                    `Failed to find meeting times: ${error.code || error.message}`,
                    'error',
                    { graphDetails, requestOptions: options }
                );
                monitoringService.logError(mcpError);
                throw mcpError;
            } else {
                throw new Error(`Failed to find meeting times (logging services unavailable): ${error.message}`);
            }
        }
    },
    
    /**
     * Get available rooms for meetings
     * @param {object} options - Options for filtering rooms
     * @returns {Promise<Array>} List of available rooms
     */
    async getRooms(options = {}) {
        // TODO: [getRooms] Surface room email + capacity; paging. (LOW)
        const { graphService, errorService, monitoringService } = this.services || {};
        const { skip, top, ...otherOptions } = options; // Extract paging params

        if (!graphService || typeof graphService.getRooms !== 'function') {
            console.error('getRooms: GraphService or method graphService.getRooms not available.');
            throw new Error('Required GraphService method \'getRooms\' not implemented or service unavailable.');
        }
        if (!errorService || !monitoringService) {
            console.warn('getRooms: Error/Monitoring service missing, proceeding without structured error handling.');
        }

        // Prepare options for graph service, including paging
        const graphOptions = { ...otherOptions };
        if (skip !== undefined) graphOptions.$skip = skip;
        if (top !== undefined) graphOptions.$top = top;

        try {
            console.log('Calling graphService.getRooms with options:', graphOptions);
            const result = await graphService.getRooms(graphOptions);

            // Basic normalization - ensure essential fields are present
            // Capacity might require additional calls or specific $select in graphService
            const normalizedRooms = (result?.value || []).map(room => ({
                id: room.id, // Assuming graph returns id
                displayName: room.displayName || room.name, // Graph uses displayName for rooms
                emailAddress: room.emailAddress, // Key field
                // capacity: room.capacity // NOTE: Capacity often requires specific permissions/calls
            }));

            console.log(`getRooms successful, found ${normalizedRooms.length} rooms.`);
            return {
                rooms: normalizedRooms,
                nextLink: result['@odata.nextLink'] // Pass along the nextLink for pagination
            };
        } catch (error) {
            console.error(`Error getting rooms: ${error.message}`);
            if (errorService && monitoringService) {
                const graphDetails = {
                    statusCode: error.statusCode,
                    code: error.code,
                    graphRequestId: error.requestId,
                    originalMessage: error.message
                };
                const mcpError = errorService.createError(
                    'graph_get_rooms',
                    `Failed to get rooms: ${error.code || error.message}`,
                    'error',
                    { graphDetails, requestOptions: graphOptions }
                );
                monitoringService.logError(mcpError);
                throw mcpError;
            } else {
                throw new Error(`Failed to get rooms (logging services unavailable): ${error.message}`);
            }
        }
    },
    
    /**
     * Get user calendars
     * @returns {Promise<Array>} List of calendars
     */
    async getCalendars() {
        // TODO: [getCalendars] Include canEdit flag (LOW)
        const { graphService, errorService, monitoringService } = this.services || {};

        if (!graphService || typeof graphService.getCalendars !== 'function') {
            console.error('getCalendars: GraphService or method graphService.getCalendars not available.');
            throw new Error('Required GraphService method \'getCalendars\' not implemented or service unavailable.');
        }
        if (!errorService || !monitoringService) {
            console.warn('getCalendars: Error/Monitoring service missing, proceeding without structured error handling.');
        }

        try {
            console.log('Calling graphService.getCalendars...');
            const result = await graphService.getCalendars(); // Assuming graphService handles $select if needed

            // Normalize the result to ensure essential fields, including canEdit
            const normalizedCalendars = (result?.value || []).map(cal => ({
                id: cal.id,
                name: cal.name,
                canEdit: cal.canEdit, // Ensure this field is passed through
                // Add other relevant fields if necessary, e.g., owner, color
                // owner: cal.owner?.emailAddress,
                // color: cal.color 
            }));

            console.log(`getCalendars successful, found ${normalizedCalendars.length} calendars.`);
            return normalizedCalendars; // Return the array directly

        } catch (error) {
            console.error(`Error getting calendars: ${error.message}`);
            if (errorService && monitoringService) {
                const graphDetails = {
                    statusCode: error.statusCode,
                    code: error.code,
                    graphRequestId: error.requestId,
                    originalMessage: error.message
                };
                const mcpError = errorService.createError(
                    'graph_get_calendars',
                    `Failed to get calendars: ${error.code || error.message}`,
                    'error',
                    { graphDetails } // No specific options sent
                );
                monitoringService.logError(mcpError);
                throw mcpError;
            } else {
                throw new Error(`Failed to get calendars (logging services unavailable): ${error.message}`);
            }
        }
    },
    
    /**
     * Add an attachment to an event
     * @param {string} eventId - ID of the event
     * @param {object} attachment - Attachment data
     * @returns {Promise<object>} Created attachment
     */
    async addAttachment(eventId, attachment) {
        // TODO: [addAttachment] Enforce file type/size; audit logging (MEDIUM)
        const { graphService, errorService, monitoringService } = this.services || {};

        if (!graphService || typeof graphService.addEventAttachment !== 'function') {
            console.error('addAttachment: GraphService or method graphService.addEventAttachment not available.');
            throw new Error('Required GraphService method \'addEventAttachment\' not implemented or service unavailable.');
        }
        if (!errorService || !monitoringService) {
            console.warn('addAttachment: Error/Monitoring service missing, proceeding without validation or structured logging.');
            // Potentially bypass validation/logging if services are missing, or throw
            // For now, we proceed but log a warning
        }

        let validatedAttachment;
        if (errorService) { // Only validate if errorService is available for structured errors
            try {
                const { error, value } = attachmentSchema.validate(attachment, { abortEarly: false });
                if (error) {
                    const validationError = errorService.createError(
                        'validation',
                        'Invalid attachment data.',
                        'warn',
                        { details: error.details.map(d => d.message), eventId }
                    );
                    if (monitoringService) monitoringService.logError(validationError);
                    throw validationError;
                }
                validatedAttachment = value; // Use the validated and potentially defaulted value
            } catch (validationError) {
                // Rethrow validation errors immediately
                throw validationError; 
            }
        } else {
             // If no error service, proceed with raw attachment but cannot guarantee validity
             validatedAttachment = attachment; 
        }

        const auditLogContext = { eventId, attachmentName: validatedAttachment.name, contentType: validatedAttachment.contentType, sizeBytes: Buffer.byteLength(validatedAttachment.contentBytes, 'base64') };

        // Audit Log: Attempt
        if (monitoringService) monitoringService.logAction('calendar.addAttachment.attempt', auditLogContext);

        try {
            console.log(`Attempting to add attachment '${validatedAttachment.name}' to event ${eventId}...`);
            const result = await graphService.addEventAttachment(eventId, validatedAttachment);
            console.log(`Successfully added attachment ${result.id} to event ${eventId}.`);

            // Audit Log: Success
            if (monitoringService) monitoringService.logAction('calendar.addAttachment.success', { ...auditLogContext, attachmentId: result.id });

            return result; // Return the created attachment object from Graph

        } catch (error) {
            console.error(`Error adding attachment to event ${eventId}: ${error.message}`);
             // Audit Log: Failure
            if (monitoringService) monitoringService.logAction('calendar.addAttachment.failure', { ...auditLogContext, error: error.message });

            if (errorService && monitoringService) {
                const graphDetails = { statusCode: error.statusCode, code: error.code, graphRequestId: error.requestId, originalMessage: error.message };
                const mcpError = errorService.createError(
                    'graph_add_attachment',
                    `Failed to add attachment: ${error.code || error.message}`,
                    'error',
                    { graphDetails, ...auditLogContext }
                );
                // Log the structured error, but the action failure log might be sufficient
                 monitoringService.logError(mcpError); 
                throw mcpError;
            } else {
                throw new Error(`Failed to add attachment (logging services unavailable): ${error.message}`);
            }
        }
    },
    
    /**
     * Remove an attachment from an event
     * @param {string} eventId - ID of the event
     * @param {string} attachmentId - ID of the attachment to remove
     * @returns {Promise<boolean>} Success status
     */
    async removeAttachment(eventId, attachmentId) {
        // TODO: [removeAttachment] Audit logging (MEDIUM) - Part of add/remove task
        const { graphService, errorService, monitoringService } = this.services || {};

        if (!graphService || typeof graphService.removeEventAttachment !== 'function') {
            console.error('removeAttachment: GraphService or method graphService.removeEventAttachment not available.');
            throw new Error('Required GraphService method \'removeEventAttachment\' not implemented or service unavailable.');
        }
        if (!errorService || !monitoringService) {
            console.warn('removeAttachment: Error/Monitoring service missing, proceeding without structured logging.');
        }

        const auditLogContext = { eventId, attachmentId };

        // Audit Log: Attempt
        if (monitoringService) monitoringService.logAction('calendar.removeAttachment.attempt', auditLogContext);

        try {
            console.log(`Attempting to remove attachment ${attachmentId} from event ${eventId}...`);
            // Graph remove attachment usually returns void (204 No Content) on success
            await graphService.removeEventAttachment(eventId, attachmentId);
            console.log(`Successfully removed attachment ${attachmentId} from event ${eventId}.`);

            // Audit Log: Success
            if (monitoringService) monitoringService.logAction('calendar.removeAttachment.success', auditLogContext);

            return true; // Indicate success

        } catch (error) {
            console.error(`Error removing attachment ${attachmentId} from event ${eventId}: ${error.message}`);
            // Audit Log: Failure
            if (monitoringService) monitoringService.logAction('calendar.removeAttachment.failure', { ...auditLogContext, error: error.message });

            if (errorService && monitoringService) {
                const graphDetails = { statusCode: error.statusCode, code: error.code, graphRequestId: error.requestId, originalMessage: error.message };
                const mcpError = errorService.createError(
                    'graph_remove_attachment',
                    `Failed to remove attachment: ${error.code || error.message}`,
                    'error',
                    { graphDetails, ...auditLogContext }
                );
                monitoringService.logError(mcpError);
                throw mcpError;
            } else {
                throw new Error(`Failed to remove attachment (logging services unavailable): ${error.message}`);
            }
        }
    },
    
    /**
     * Handles calendar-related intents routed to this module.
     * @param {string} intent
     * @param {object} entities
     * @param {object} context
     * @returns {Promise<object>} Normalized response
     */
    async handleIntent(intent, entities = {}, context = {}) {
        // TODO: [handleIntent] Refactor switch to strategy map (HIGH)
        const { errorService, monitoringService, graphService, cacheService } = this.services;

        const intentHandlers = {
            'getEvents': async (entities, context) => {
                const range = entities.range || {};
                const cacheKey = `calendar:events:${JSON.stringify(range)}`;
                let events = cacheService && await cacheService.get(cacheKey);
                if (!events) {
                    // Ensure graphService is available before using
                    if (!graphService) throw new Error('GraphService is unavailable for getEvents.');
                    const raw = await graphService.getEvents(range);
                    events = Array.isArray(raw) ? raw.map(normalizeEvent) : [];
                    if (cacheService) await cacheService.set(cacheKey, events, 60); // Cache for 1 minute
                }
                return { type: 'calendarList', items: events };
            },
            'createEvent': async (entities, context) => {
                const eventData = entities.event;
                const normalizedEvent = await this.createEvent(eventData, context?.req);
                return { type: 'calendarEvent', event: normalizedEvent };
            },
            'updateEvent': async (entities, context) => {
                const { eventId, updates } = entities;
                const normalizedUpdatedEvent = await this.updateEvent(eventId, updates, context?.req);
                return { type: 'calendarEvent', event: normalizedUpdatedEvent };
            },
            'getAvailability': async (entities, context) => {
                const availabilityResult = await this.getAvailability(entities);
                return { type: 'availabilityResult', data: availabilityResult };
            },
            'scheduleMeeting': async (entities, context) => {
                const scheduleOptions = entities.options || {};
                if (!scheduleOptions.attendees || !scheduleOptions.subject) {
                    const err = errorService.createError('validation', 'Missing required fields for scheduleMeeting', 'warn', { missing: !scheduleOptions.attendees ? 'attendees' : 'subject' });
                    monitoringService.logError(err);
                    throw err;
                }

                const result = await this.scheduleMeeting(scheduleOptions);

                return {
                    type: 'scheduleMeetingResult',
                    status: result.status,
                    event: result.event,
                    suggestions: result.suggestions
                };
            },
            'acceptEvent': async (entities, context) => {
                const { eventId, comment } = entities;
                await this.acceptEvent(eventId, comment);
                return { type: 'eventResponse', status: 'accepted', eventId };
            },
            'tentativelyAcceptEvent': async (entities, context) => {
                const { eventId, comment } = entities;
                await this.tentativelyAcceptEvent(eventId, comment);
                return { type: 'eventResponse', status: 'tentativelyAccepted', eventId };
            },
            'declineEvent': async (entities, context) => {
                const { eventId, comment } = entities;
                await this.declineEvent(eventId, comment);
                return { type: 'eventResponse', status: 'declined', eventId };
            },
            'cancelEvent': async (entities, context) => {
                const { eventId, comment } = entities;
                await this.cancelEvent(eventId, comment);
                return { type: 'eventResponse', status: 'cancelled', eventId };
            },
            'findMeetingTimes': async (entities, context) => {
                const options = entities.options || {};
                const suggestions = await this.findMeetingTimes(options);
                // Ensure suggestions structure aligns with expected response type
                return { type: 'meetingTimeSuggestions', suggestions: suggestions };
            },
            'getRooms': async (entities, context) => {
                const options = entities.options || {};
                const roomData = await this.getRooms(options); // Expect { rooms: [], nextLink: ... }
                return { type: 'roomList', rooms: roomData.rooms, nextLink: roomData.nextLink };
            },
            'getCalendars': async (entities, context) => {
                const calendars = await this.getCalendars(); // Expect array
                return { type: 'calendarList', calendars: calendars };
            }
            // Add handlers for addAttachment/removeAttachment if they become intents
        };

        const handler = intentHandlers[intent];

        if (handler) {
            try {
                 return await handler(entities, context);
            } catch (error) {
                 // Log and rethrow errors originating from handlers
                 console.error(`Error handling intent '${intent}':`, error);
                 // Error should already be structured if thrown from within handlers using errorService
                 // If not, wrap it
                 if (error && error.isMCPError) {
                     throw error; // Rethrow known MCP errors
                 } else {
                     const mcpError = errorService.createError(
                        'intent_handler_exception', 
                        `Unexpected error handling intent ${intent}: ${error.message}`,
                        'error',
                        { originalError: error, intent, entities }
                     );
                     monitoringService.logError(mcpError);
                     throw mcpError;
                 }
            }
        } else {
            // Default case: Unsupported intent
            console.warn(`Unsupported calendar intent received: ${intent}`);
            const unsupportedError = errorService.createError(
                'unsupported_intent',
                `The calendar module does not support the intent: ${intent}`,
                'warn', // Treat as warning, not critical failure
                { intent, moduleId: this.id }
            );
            monitoringService.logError(unsupportedError);
            throw unsupportedError; // Throw error to signal unsupported operation
         }
     },
    
    id: 'calendar',
    name: 'Microsoft Calendar',
    capabilities: CALENDAR_CAPABILITIES,
    /**
     * Initializes the calendar module with dependencies.
     * @param {object} services - { graphService, cacheService, eventService }
     * @returns {object} Initialized module
     */
    init(services) {
        // TODO: [init] Validate required services (LOW)
        const requiredServices = ['graphService', 'errorService', 'monitoringService']; 

        if (!services) {
            throw new Error('CalendarModule init requires a services object.');
        }

        for (const serviceName of requiredServices) {
            if (!services[serviceName]) {
                const errorMsg = `CalendarModule init failed: Required service '${serviceName}' is missing.`;
                console.error(errorMsg);
                // Throwing an error prevents the module from being used in an incomplete state
                throw new Error(errorMsg); 
            }
        }

        this.services = services;
        console.log('CalendarModule initialized successfully with required services.');
        return this; // Return the module instance, now containing validated services
    }
};

module.exports = CalendarModule;
