/**
 * @fileoverview ToolsService - Aggregates and manages MCP tools from modules.
 * Follows MCP modular, testable, and consistent API contract rules.
 * Handles tool definition, mapping, and parameter transformation.
 */

/**
 * Creates a tools service with the module registry.
 * @param {object} deps - Service dependencies
 * @param {object} deps.moduleRegistry - The module registry instance
 * @param {object} [deps.logger=console] - Logger instance
 * @param {object} [deps.schemaValidator] - Schema validation service (optional)
 * @returns {object} Tools service methods
 */
function createToolsService({ moduleRegistry, logger = console, schemaValidator = null }) {
    if (!moduleRegistry) {
        logger.error('ToolsService: Module registry is required.');
        throw new Error('Module registry is required for ToolsService');
    }

    // Internal state for caching (will be used later)
    let cachedTools = null;

    // Comprehensive tool alias map for consistent module and method routing
    const toolAliases = {
        // Mail module tools
        getMail: { moduleName: 'mail', methodName: 'getInbox' },
        readMail: { moduleName: 'mail', methodName: 'getInbox' },
        sendMail: { moduleName: 'mail', methodName: 'sendEmail' },
        searchMail: { moduleName: 'mail', methodName: 'searchEmails' },
        flagMail: { moduleName: 'mail', methodName: 'flagEmail' },
        getMailDetails: { moduleName: 'mail', methodName: 'getEmailDetails' },
        markMailRead: { moduleName: 'mail', methodName: 'markAsRead' },
        
        // Calendar module tools
        getCalendar: { moduleName: 'calendar', methodName: 'getEvents' },
        getEvents: { moduleName: 'calendar', methodName: 'getEvents' },
        createEvent: { moduleName: 'calendar', methodName: 'create' },
        updateEvent: { moduleName: 'calendar', methodName: 'update' },
        cancelEvent: { moduleName: 'calendar', methodName: 'cancelEvent' },
        getAvailability: { moduleName: 'calendar', methodName: 'getAvailability' },
        findMeetingTimes: { moduleName: 'calendar', methodName: 'findMeetingTimes' },
        scheduleMeeting: { moduleName: 'calendar', methodName: 'scheduleMeeting' },
        
        // Files module tools
        listFiles: { moduleName: 'files', methodName: 'listFiles' },
        searchFiles: { moduleName: 'files', methodName: 'searchFiles' },
        downloadFile: { moduleName: 'files', methodName: 'downloadFile' },
        uploadFile: { moduleName: 'files', methodName: 'uploadFile' },
        getFileMetadata: { moduleName: 'files', methodName: 'getFileMetadata' },
        
        // People module tools
        findPeople: { moduleName: 'people', methodName: 'find' },
        searchPeople: { moduleName: 'people', methodName: 'search' },
        getRelevantPeople: { moduleName: 'people', methodName: 'getRelevantPeople' },
        getPersonById: { moduleName: 'people', methodName: 'getPersonById' },
        
        // Query module
        query: { moduleName: 'query', methodName: 'processQuery' }
    };

    /**
     * Generates a tool definition from a module capability
     * @param {string} moduleName - Name of the module
     * @param {string} capability - Capability/tool name
     * @returns {object} Tool definition
     */
    function generateToolDefinition(moduleName, capability) {
        // TODO: [generateToolDefinition] Ensure endpoints align with src/api/routes.cjs (HIGH).
        // This current endpoint generation logic is temporary and brittle.
        // It should be refactored to consume route definitions from routes.cjs or a shared config
        // once src/api/routes.cjs is refactored to export them cleanly.
        // IMPORTANT: All tool schemas must match backend validation exactly

        // Derive default HTTP method based on capability name convention
        let defaultMethod = 'GET';
        if (capability.startsWith('create') || capability.startsWith('add') || capability.startsWith('send') || capability.startsWith('search') || capability.startsWith('flag')) {
            defaultMethod = 'POST';
        } else if (capability.startsWith('update') || capability.startsWith('set')) {
            defaultMethod = 'PUT'; // Or PATCH, depending on API design
        } else if (capability.startsWith('delete') || capability.startsWith('remove')) {
            defaultMethod = 'DELETE';
        }

        // Default tool structure
        const toolDef = {
            name: capability,
            description: `${capability} operation for ${moduleName}`,
            endpoint: `/api/v1/${moduleName.toLowerCase()}/${capability}`, // Placeholder endpoint
            method: defaultMethod,
            parameters: {}
        };

        // Customize based on known capabilities
        switch (capability) {
            // Mail tools
            case 'getInbox':
            case 'getMail':
                toolDef.description = 'Fetch mail from Microsoft 365 inbox';
                toolDef.endpoint = '/api/v1/mail';
                toolDef.parameters = {
                    // Example: Add specific parameters if needed
                    // limit: { type: 'number', description: 'Max results', optional: true }
                };
                break;
            case 'sendEmail':
            case 'sendMail':
                toolDef.description = 'Send an email via Microsoft 365';
                toolDef.endpoint = '/api/v1/mail/send';
                toolDef.method = 'POST';
                toolDef.parameters = {
                    to: { type: 'string', description: 'One or more valid recipient email addresses, comma-separated' },
                    subject: { type: 'string', description: 'Email subject line' },
                    body: { type: 'string', description: 'Email body content' },
                    cc: { type: 'string', description: 'One or more valid CC recipient email addresses, comma-separated', optional: true },
                    bcc: { type: 'string', description: 'One or more valid BCC recipient email addresses, comma-separated', optional: true },
                    attachments: { type: 'array', description: 'File attachments', optional: true }
                };
                break;
            case 'searchEmails':
            case 'searchMail':
                toolDef.description = 'Search emails by query';
                toolDef.endpoint = '/api/v1/mail/search';
                toolDef.parameters = {
                    query: { type: 'string', description: 'Search query' },
                    limit: { type: 'number', description: 'Number of results', optional: true }
                };
                break;
            case 'flagEmail':
            case 'flagMail':
                toolDef.description = 'Flag or unflag an email';
                toolDef.endpoint = '/api/v1/mail/flag';
                toolDef.method = 'POST'; // Explicit override if needed
                toolDef.parameters = { /* ... specific params ... */ };
                break;
            case 'getAttachments':
                toolDef.description = 'Get email attachments';
                toolDef.endpoint = '/api/v1/mail/attachments';
                toolDef.method = 'POST'; // Often POST for actions with IDs in body
                toolDef.parameters = { /* ... specific params ... */ };
                break;
            case 'getEmailDetails':
            case 'getMailDetails':
                toolDef.description = 'Get detailed information for a specific email';
                toolDef.endpoint = '/api/v1/mail/:id';
                toolDef.method = 'GET';
                toolDef.parameters = {
                    id: { type: 'string', description: 'Email ID to retrieve details for' }
                };
                // Ensure this tool is properly registered with the /v1/mail/:id endpoint
                // Note: The :id in the path is a placeholder for the actual ID value
                toolDef.parameterMapping = {
                    id: { inPath: true }
                };
                break;
            case 'markAsRead':
            case 'markMailRead':
                toolDef.description = 'Mark an email as read or unread';
                toolDef.endpoint = '/api/v1/mail/:id/read';
                toolDef.method = 'PATCH';
                toolDef.parameters = {
                    id: { type: 'string', description: 'Email ID to mark as read/unread' },
                    isRead: { type: 'boolean', description: 'Whether to mark as read (true) or unread (false)', optional: true, default: true }
                };
                // Ensure this tool is properly registered with the /v1/mail/:id/read endpoint
                // Note: The :id in the path is a placeholder for the actual ID value
                toolDef.parameterMapping = {
                    id: { inPath: true },
                    isRead: { inBody: true }
                };
                break;

            // Calendar tools
            case 'getEvents':
            case 'getCalendar':
                toolDef.description = 'Fetch calendar events from Microsoft 365';
                toolDef.endpoint = '/api/v1/calendar';
                toolDef.parameters = {
                    // Example: Add specific parameters if needed
                    // start: { type: 'string', format: 'date-time' }, end: { type: 'string', format: 'date-time' }
                };
                break;
            case 'createEvent':
                toolDef.description = 'Create a new calendar event';
                toolDef.endpoint = '/api/v1/calendar/events';
                toolDef.method = 'POST';
                toolDef.parameters = {
                    subject: { type: 'string', description: 'Event subject/title' },
                    start: { 
                        type: 'object', 
                        description: 'Start time',
                        properties: {
                            dateTime: { type: 'string', description: 'ISO date string' },
                            timeZone: { type: 'string', description: 'Time zone', optional: true }
                        }
                    },
                    end: { 
                        type: 'object', 
                        description: 'End time',
                        properties: {
                            dateTime: { type: 'string', description: 'ISO date string' },
                            timeZone: { type: 'string', description: 'Time zone', optional: true }
                        }
                    },
                    location: { type: 'string', description: 'Event location', optional: true },
                    body: { type: 'string', description: 'Event description/body', optional: true },
                    attendees: { 
                        type: 'array', 
                        description: 'Array of attendee email addresses or objects',
                        optional: true,
                        items: {
                            type: 'string'
                        }
                    },
                    isOnlineMeeting: { type: 'boolean', description: 'Whether this is an online meeting', optional: true }
                };
                break;
            case 'updateEvent':
                toolDef.description = 'Update an existing calendar event';
                toolDef.endpoint = '/api/v1/calendar/events/:id';
                toolDef.method = 'PUT';
                toolDef.parameters = {
                    id: { type: 'string', description: 'Event ID to update' },
                    subject: { type: 'string', description: 'Event subject/title', optional: true },
                    start: { 
                        type: 'object', 
                        description: 'Start time',
                        optional: true,
                        properties: {
                            dateTime: { type: 'string', description: 'ISO date string' },
                            timeZone: { type: 'string', description: 'Time zone', optional: true }
                        }
                    },
                    end: { 
                        type: 'object', 
                        description: 'End time',
                        optional: true,
                        properties: {
                            dateTime: { type: 'string', description: 'ISO date string' },
                            timeZone: { type: 'string', description: 'Time zone', optional: true }
                        }
                    },
                    location: { 
                        type: 'any', 
                        description: 'Event location (string or object with displayName)',
                        optional: true
                    },
                    body: { 
                        type: 'any', 
                        description: 'Event description/body (string or object with contentType and content)',
                        optional: true
                    },
                    attendees: { 
                        type: 'array', 
                        description: 'Array of attendee email addresses or objects',
                        optional: true,
                        items: {
                            type: 'any'
                        }
                    },
                    isAllDay: { type: 'boolean', description: 'Whether this is an all-day event', optional: true },
                    isOnlineMeeting: { type: 'boolean', description: 'Whether this is an online meeting', optional: true }
                };
                break;
            case 'deleteEvent':
            case 'cancelEvent': // Alias
                toolDef.description = 'Delete or cancel a calendar event';
                toolDef.endpoint = '/api/v1/calendar/events/:id'; // Placeholder for ID in path
                toolDef.method = 'DELETE';
                toolDef.parameters = { /* ... specific params ... */ };
                break;
            case 'getAvailability':
                toolDef.description = 'Get free/busy schedule for users';
                toolDef.endpoint = '/api/v1/calendar/availability';
                toolDef.method = 'POST'; // Typically POST for complex queries
                toolDef.parameters = {
                    users: { type: 'array', description: 'Array of user email addresses', items: { type: 'string' } },
                    start: { type: 'string', description: 'Start time (ISO date string)' },
                    end: { type: 'string', description: 'End time (ISO date string)' },
                    timeZone: { type: 'string', description: 'Time zone for availability check', optional: true }
                };
                break;
            case 'findMeetingTimes':
                toolDef.description = 'Find suggested meeting times';
                toolDef.endpoint = '/api/v1/calendar/findMeetingTimes';
                toolDef.method = 'POST';
                toolDef.parameters = {
                    attendees: { type: 'array', description: 'Array of attendee email addresses', items: { type: 'string' } },
                    timeConstraints: { 
                        type: 'object', 
                        description: 'Time constraints for the meeting',
                        properties: {
                            startTime: { 
                                type: 'object', 
                                description: 'Start time',
                                properties: {
                                    dateTime: { type: 'string', description: 'ISO date string' },
                                    timeZone: { type: 'string', description: 'Time zone', optional: true }
                                }
                            },
                            endTime: { 
                                type: 'object', 
                                description: 'End time',
                                properties: {
                                    dateTime: { type: 'string', description: 'ISO date string' },
                                    timeZone: { type: 'string', description: 'Time zone', optional: true }
                                }
                            },
                            meetingDuration: { type: 'number', description: 'Duration in minutes', optional: true }
                        }
                    },
                    maxCandidates: { type: 'number', description: 'Maximum number of meeting time suggestions', optional: true }
                };
                break;
            case 'scheduleMeeting':
                toolDef.description = 'Schedule a meeting with intelligent time selection';
                toolDef.endpoint = '/api/v1/calendar/schedule';
                toolDef.method = 'POST';
                toolDef.parameters = {
                    subject: { type: 'string', description: 'Meeting subject/title' },
                    attendees: { type: 'array', description: 'Array of attendee email addresses', items: { type: 'string' } },
                    preferredTimes: { 
                        type: 'array', 
                        description: 'Preferred time slots for the meeting',
                        optional: true,
                        items: {
                            type: 'object',
                            properties: {
                                start: {
                                    type: 'object',
                                    properties: {
                                        dateTime: { type: 'string', description: 'ISO date string' },
                                        timeZone: { type: 'string', description: 'Time zone', optional: true }
                                    }
                                },
                                end: {
                                    type: 'object',
                                    properties: {
                                        dateTime: { type: 'string', description: 'ISO date string' },
                                        timeZone: { type: 'string', description: 'Time zone', optional: true }
                                    }
                                }
                            }
                        }
                    },
                    duration: { type: 'number', description: 'Meeting duration in minutes', optional: true },
                    location: { type: 'string', description: 'Meeting location', optional: true },
                    body: { type: 'string', description: 'Meeting description/body', optional: true },
                    isOnlineMeeting: { type: 'boolean', description: 'Whether this is an online meeting', optional: true }
                };
                break;
            case 'getRooms':
                toolDef.description = 'Get available meeting rooms';
                toolDef.endpoint = '/api/v1/calendar/rooms';
                toolDef.parameters = { /* ... specific params ... */ };
                break;
            case 'addAttachment':
                toolDef.description = 'Add attachment to an event';
                toolDef.endpoint = '/api/v1/calendar/events/:id/attachments';
                toolDef.method = 'POST';
                toolDef.parameters = { /* ... specific params ... */ };
                break;
            case 'removeAttachment':
                toolDef.description = 'Remove attachment from an event';
                toolDef.endpoint = '/api/v1/calendar/events/:eventId/attachments/:attachmentId';
                toolDef.method = 'DELETE';
                toolDef.parameters = { /* ... specific params ... */ };
                break;

            // File tools (OneDrive/SharePoint)
            case 'listFiles':
                toolDef.description = 'List files in a specific drive or folder';
                toolDef.endpoint = '/api/v1/files'; // Needs refinement for path
                toolDef.parameters = {
                    // Example: path: { type: 'string' }, limit: { type: 'number' }
                };
                break;
            case 'uploadFile':
                toolDef.description = 'Upload a file';
                toolDef.endpoint = '/api/v1/files/upload'; // Needs refinement for path
                toolDef.method = 'POST';
                toolDef.parameters = { /* ... specific params ... */ };
                break;
            case 'downloadFile':
                toolDef.description = 'Download a file';
                toolDef.endpoint = '/api/v1/files/download'; // Needs refinement for path and ID
                toolDef.parameters = { /* ... specific params ... */ };
                break;
            case 'deleteFile':
                toolDef.description = 'Delete a file or folder';
                toolDef.endpoint = '/api/v1/files'; // Needs refinement for path and ID
                toolDef.method = 'DELETE';
                toolDef.parameters = { /* ... specific params ... */ };
                break;

            // Query tool

            // People tools
            case 'findPeople':
                toolDef.description = 'IMPORTANT: Find and resolve people by name or email before scheduling meetings or sending emails. This tool MUST be used to resolve any person references before creating calendar events or sending mail.';
                toolDef.endpoint = '/api/v1/people/find';
                toolDef.method = 'GET';
                toolDef.parameters = {
                    query: { type: 'string', description: 'Search query to find a person' },
                    name: { type: 'string', description: 'Person name to search for', optional: true },
                    limit: { type: 'number', description: 'Maximum number of results', optional: true }
                };
                break;
            case 'searchPeople':
                toolDef.description = 'Search for people by name or email address';
                toolDef.endpoint = '/api/v1/people/search';
                toolDef.method = 'GET';
                toolDef.parameters = {
                    query: { type: 'string', description: 'Search query (name or email)' },
                    limit: { type: 'number', description: 'Maximum number of results', optional: true },
                    includeContacts: { type: 'boolean', description: 'Include personal contacts in search', optional: true }
                };
                break;
            case 'getRelevantPeople':
                toolDef.description = 'Get people relevant to the user';
                toolDef.endpoint = '/api/v1/people';
                toolDef.method = 'GET';
                toolDef.parameters = {
                    limit: { type: 'number', description: 'Maximum number of people to return', optional: true },
                    filter: { type: 'string', description: 'Filter criteria', optional: true },
                    orderby: { type: 'string', description: 'Order by field', optional: true }
                };
                break;
            case 'getPersonById':
                toolDef.description = 'Get a specific person by ID';
                toolDef.endpoint = '/api/v1/people/:id';
                // TODO: Define parameters for getPersonById
                break;

            // Default for unknown capabilities
            default:
                logger.warn(`generateToolDefinition: No specific definition found for capability '${capability}' in module '${moduleName}'. Using defaults.`);
                // Use defaults with generic parameters
                break;
        }

        return toolDef;
    }

    /**
     * Invalidates any internal caches, forcing regeneration on next access.
     */
    function refresh() {
        logger.info('ToolsService: Refresh triggered, clearing internal cache.');
        cachedTools = null; // Clear cache
        // Future: Potentially re-trigger other initialization if needed
    }

    /**
     * Helper function to transform attendees from string or array to proper format
     * @param {string|Array} attendees - Attendees as string or array
     * @returns {Array|undefined} - Transformed attendees or undefined if none
     */
    function transformAttendees(attendees) {
        if (!attendees) return undefined;
        
        // If attendees is a string (comma-separated), convert to array
        if (typeof attendees === 'string') {
            return attendees.split(',').map(email => email.trim());
        }
        
        // If already an array, return as is
        return attendees;
    }
    
    /**
     * Helper function to transform date/time to proper format
     * @param {string|object} dateTime - Date time string or object
     * @param {string} timeZone - Default timezone if not specified
     * @returns {object|undefined} - Transformed date time object
     */
    function transformDateTime(dateTime, timeZone = 'UTC') {
        if (!dateTime) return undefined;
        
        // If already an object with dateTime, return as is
        if (typeof dateTime === 'object' && dateTime.dateTime) {
            return dateTime;
        }
        
        // If a string, convert to object format
        if (typeof dateTime === 'string') {
            return {
                dateTime: dateTime,
                timeZone: timeZone
            };
        }
        
        return dateTime;
    }
    
    /**
     * Transforms parameters for a specific module and method
     * @param {string} moduleName - Module name
     * @param {string} methodName - Method name
     * @param {object} params - Original parameters
     * @returns {object} - Transformed parameters
     */
    function transformParameters(moduleName, methodName, params = {}) {
        logger.debug(`transformParameters: Transforming for ${moduleName}.${methodName}`);
        
        // Create a copy of the parameters to avoid modifying the original
        const transformedParams = { ...params };
        
        // Transform parameters based on the module and method
        switch (`${moduleName}.${methodName}`) {
            // Mail module methods
            case 'mail.sendEmail':
            case 'mail.sendMail':
                return {
                    to: transformAttendees(transformedParams.to),
                    subject: transformedParams.subject,
                    body: transformedParams.body,
                    cc: transformAttendees(transformedParams.cc),
                    bcc: transformAttendees(transformedParams.bcc)
                };
                
            case 'mail.searchEmails':
            case 'mail.searchMail':
                // Ensure query parameter is properly named
                if (transformedParams.query && !transformedParams.q) {
                    transformedParams.q = transformedParams.query;
                    delete transformedParams.query;
                }
                return transformedParams;
                
            // Calendar module methods
            case 'calendar.create':
            case 'calendar.createEvent':
                return {
                    subject: transformedParams.subject,
                    start: transformDateTime(transformedParams.start, transformedParams.timeZone),
                    end: transformDateTime(transformedParams.end, transformedParams.timeZone),
                    location: transformedParams.location,
                    body: transformedParams.body,
                    attendees: transformAttendees(transformedParams.attendees),
                    isOnlineMeeting: transformedParams.isOnlineMeeting
                };
                
            case 'calendar.update':
            case 'calendar.updateEvent':
                // Create an object with only the provided parameters
                const updateData = {};
                
                if (transformedParams.id !== undefined) {
                    updateData.id = transformedParams.id;
                }
                
                if (transformedParams.subject !== undefined) {
                    updateData.subject = transformedParams.subject;
                }
                
                if (transformedParams.start !== undefined) {
                    updateData.start = transformDateTime(transformedParams.start, transformedParams.timeZone);
                }
                
                if (transformedParams.end !== undefined) {
                    updateData.end = transformDateTime(transformedParams.end, transformedParams.timeZone);
                }
                
                if (transformedParams.attendees !== undefined) {
                    updateData.attendees = transformAttendees(transformedParams.attendees);
                }
                
                if (transformedParams.location !== undefined) {
                    updateData.location = transformedParams.location;
                }
                
                if (transformedParams.body !== undefined) {
                    updateData.body = transformedParams.body;
                }
                
                if (transformedParams.isOnlineMeeting !== undefined) {
                    updateData.isOnlineMeeting = transformedParams.isOnlineMeeting;
                }
                
                return updateData;
                
            case 'calendar.getAvailability':
                // Ensure we have start/end times for availability check
                if (!transformedParams.start && !transformedParams.startTime) {
                    logger.warn('getAvailability requires start time');
                }
                
                if (!transformedParams.end && !transformedParams.endTime) {
                    logger.warn('getAvailability requires end time');
                }
                
                // Transform start/end to the format expected by the API
                const startTime = typeof transformedParams.start === 'object' && transformedParams.start.dateTime 
                    ? transformedParams.start.dateTime 
                    : transformedParams.start || transformedParams.startTime;
                
                const endTime = typeof transformedParams.end === 'object' && transformedParams.end.dateTime 
                    ? transformedParams.end.dateTime 
                    : transformedParams.end || transformedParams.endTime;
                
                return {
                    users: transformAttendees(transformedParams.users) || transformAttendees(transformedParams.attendees) || [],
                    timeSlots: [
                        {
                            start: {
                                dateTime: startTime,
                                timeZone: transformedParams.timeZone || 'UTC'
                            },
                            end: {
                                dateTime: endTime,
                                timeZone: transformedParams.timeZone || 'UTC'
                            }
                        }
                    ]
                };
                
            case 'calendar.scheduleMeeting':
                // Extract start and end time information
                let meetingStartTime, meetingEndTime;
                
                if (transformedParams.preferredTimes && transformedParams.preferredTimes.length > 0) {
                    meetingStartTime = transformedParams.preferredTimes[0].start;
                    meetingEndTime = transformedParams.preferredTimes[0].end;
                } else {
                    // Try various parameter combinations to extract start/end times
                    if (transformedParams.start) {
                        meetingStartTime = transformedParams.start;
                    } else if (transformedParams.startDateTime) {
                        meetingStartTime = { 
                            dateTime: transformedParams.startDateTime, 
                            timeZone: transformedParams.timeZone || 'Pacific Standard Time' 
                        };
                    }
                    
                    if (transformedParams.end) {
                        meetingEndTime = transformedParams.end;
                    } else if (transformedParams.endDateTime) {
                        meetingEndTime = { 
                            dateTime: transformedParams.endDateTime, 
                            timeZone: transformedParams.timeZone || 'Pacific Standard Time' 
                        };
                    }
                }
                
                return {
                    subject: transformedParams.subject,
                    attendees: transformAttendees(transformedParams.attendees) || [],
                    start: meetingStartTime ? transformDateTime(meetingStartTime, transformedParams.timeZone) : undefined,
                    end: meetingEndTime ? transformDateTime(meetingEndTime, transformedParams.timeZone) : undefined,
                    location: transformedParams.location,
                    body: transformedParams.body,
                    isOnlineMeeting: transformedParams.isOnlineMeeting
                };
                
            case 'calendar.findMeetingTimes':
                // Extract time constraints from different possible input formats
                let timeConstraints = transformedParams.timeConstraints;
                if (!timeConstraints && (transformedParams.startTime || transformedParams.start)) {
                    timeConstraints = {
                        startTime: transformedParams.startTime || transformedParams.start,
                        endTime: transformedParams.endTime || transformedParams.end,
                        timeZone: transformedParams.timeZone || 'UTC'
                    };
                }
                
                return {
                    attendees: transformAttendees(transformedParams.attendees) || [],
                    timeConstraint: {
                        start: timeConstraints?.startTime || timeConstraints?.start,
                        end: timeConstraints?.endTime || timeConstraints?.end,
                        timeZone: timeConstraints?.timeZone || transformedParams.timeZone || 'UTC'
                    },
                    meetingDuration: transformedParams.meetingDuration || transformedParams.duration || 60,
                    maxCandidates: transformedParams.maxCandidates || 10,
                    minimumAttendeePercentage: transformedParams.minimumAttendeePercentage || 100
                };

            // People module methods
            case 'people.find':
            case 'people.findPeople':
            case 'people.search':
            case 'people.searchPeople':
                // Make sure query parameter is preserved
                if (!transformedParams.query && transformedParams.q) {
                    transformedParams.query = transformedParams.q;
                    delete transformedParams.q;
                }
                
                // Ensure limit is a number
                if (transformedParams.limit) {
                    transformedParams.limit = parseInt(transformedParams.limit, 10);
                }
                
                return transformedParams;
                
            // Query module methods
            case 'query.processQuery':
                return { 
                    query: transformedParams.query,
                    context: transformedParams.context
                };
                
            // Default case - return original parameters
            default:
                return transformedParams;
        }
    }

    return {
        /**
         * Gets all available tools from registered modules
         * @returns {Array<object>} Tool definitions
         */
        getAllTools() {
            // Check cache first
            if (cachedTools) {
                logger.debug('getAllTools: Returning cached tool definitions.');
                return cachedTools;
            }

            logger.debug('getAllTools: Cache miss, generating tool definitions...');
            const tools = [];
            const modules = moduleRegistry.getAllModules();
            
            // First, add the findPeople tool at the beginning of the list
            // This is critical because person resolution must happen before scheduling or sending invites
            const peopleModule = modules.find(m => m.name === 'people' || m.capabilities?.includes('findPeople'));
            if (peopleModule) {
                const findPeopleTool = {
                    name: 'findPeople',
                    description: 'IMPORTANT: Find and resolve people by name or email before scheduling meetings or sending emails. This tool MUST be used to resolve any person references before creating calendar events or sending mail.',
                    endpoint: '/api/v1/people/find',
                    method: 'GET',
                    parameters: {
                        query: { type: 'string', description: 'Search query to find a person' },
                        name: { type: 'string', description: 'Person name to search for', optional: true },
                        limit: { type: 'number', description: 'Maximum number of results', optional: true }
                    }
                };
                tools.push(findPeopleTool);
                logger.debug('getAllTools: Added findPeople tool with high priority');
            }

            // For each module, generate tool definitions for each capability (except findPeople which we already added)
            for (const module of modules) {
                if (Array.isArray(module.capabilities)) {
                    for (const capability of module.capabilities) {
                        // Skip findPeople since we already added it
                        if (capability === 'findPeople') continue;
                        tools.push(generateToolDefinition(module.name, capability));
                    }
                }
            }

            // Add query tool (special case)
            tools.push({
                name: 'query',
                description: 'Submit a natural language query to Microsoft 365',
                endpoint: '/api/v1/query',
                method: 'POST',
                parameters: {
                    query: { type: 'string', description: 'The user\'s natural language question' },
                    context: { type: 'object', description: 'Conversation context', optional: true }
                }
            });

            // Store in cache before returning
            cachedTools = tools;
            logger.debug(`getAllTools: Generated and cached ${tools.length} tool definitions.`);

            return tools;
        },

        /**
         * Gets a tool definition by name
         * @param {string} toolName - Name of the tool
         * @returns {object|null} Tool definition or null if not found
         */
        getToolByName(toolName) {
            const allTools = this.getAllTools(); // Uses cache if available
            const lowerCaseToolName = toolName.toLowerCase();
            const foundTool = allTools.find(tool => tool.name.toLowerCase() === lowerCaseToolName);
            return foundTool || null;
        },

        /**
         * Maps a tool name to a module and method
         * @param {string} toolName - Name of the tool
         * @returns {object|null} Module and method mapping or null if not found
         */
        mapToolToModule(toolName) {
            // Special case for query
            if (toolName === 'query') {
                return { moduleName: 'query', methodName: 'processQuery' };
            }

            const lowerCaseToolName = toolName.toLowerCase();

            // Find modules that have this capability (case-insensitive)
            const modules = moduleRegistry.getAllModules();
            for (const module of modules) {
                if (Array.isArray(module.capabilities)) {
                    const lowerCaseCapabilities = module.capabilities.map(c => c.toLowerCase());
                    const capabilityIndex = lowerCaseCapabilities.indexOf(lowerCaseToolName);
                    if (capabilityIndex > -1) {
                        // Return the original capability name casing from the module definition
                        return { moduleName: module.id, methodName: module.capabilities[capabilityIndex] };
                    }
                }
            }

            // Check aliases if no direct capability match found
            const aliasTarget = toolAliases[toolName]; // Use original case for alias lookup

            if (aliasTarget) {
                // Validate the alias target
                const targetModule = moduleRegistry.getModule(aliasTarget.moduleName);
                if (!targetModule) {
                    logger.error(`mapToolToModule: Alias '${toolName}' points to non-existent module '${aliasTarget.moduleName}'.`);
                    return null;
                }
                if (!Array.isArray(targetModule.capabilities) || !targetModule.capabilities.includes(aliasTarget.methodName)) {
                    logger.error(`mapToolToModule: Alias '${toolName}' points to module '${aliasTarget.moduleName}' which does not have capability '${aliasTarget.methodName}'.`);
                    return null;
                }
                logger.debug(`mapToolToModule: Mapping tool '${toolName}' to alias target: ${aliasTarget.moduleName}.${aliasTarget.methodName}`);
                return aliasTarget;
            }

            logger.warn(`mapToolToModule: No module or valid alias found for tool '${toolName}'.`);
            return null; // Not found
        },

        /**
         * Transforms parameters for a specific tool
         * @param {string} toolName - Name of the tool
         * @param {object} params - Original parameters
         * @returns {object} - Transformed parameters and module/method mapping
         */
        transformToolParameters(toolName, params = {}) {
            // First, map the tool to a module and method
            const mapping = this.mapToolToModule(toolName);
            
            if (!mapping) {
                logger.error(`transformToolParameters: No mapping found for tool '${toolName}'.`);
                return { 
                    mapping: null, 
                    params: params
                };
            }
            
            // Then transform the parameters based on the module and method
            const transformedParams = transformParameters(mapping.moduleName, mapping.methodName, params);
            
            return {
                mapping,
                params: transformedParams
            };
        },
        
        refresh // Expose the refresh method
    };
}

module.exports = createToolsService;
