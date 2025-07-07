/**
 * @fileoverview MCP People Module - Handles people-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system.
 */

const { normalizePerson } = require('../../graph/normalizers.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');

const PEOPLE_CAPABILITIES = [
    'findPeople',
    'getPersonById',
    'getRelevantPeople'
];

// Log module initialization
MonitoringService.info('People Module initialized', {
    serviceName: 'people-module',
    capabilities: PEOPLE_CAPABILITIES.length,
    timestamp: new Date().toISOString()
}, 'people');

const PeopleModule = {
    /**
     * Helper method to redact sensitive data from objects before logging
     * @param {object} data - The data object to redact
     * @param {WeakSet} [visited] - Set of visited objects to detect circular references
     * @returns {object} Redacted copy of the data
     * @private
     */
    redactSensitiveData(data, visited = new WeakSet()) {
        if (!data || typeof data !== 'object') {
            return data;
        }
        
        // Check for circular references
        if (visited.has(data)) {
            return '[Circular Reference]';
        }
        
        // Add current object to visited set
        visited.add(data);
        
        // Create a deep copy to avoid modifying the original
        const result = Array.isArray(data) ? [...data] : {...data};
        
        // Fields that should be redacted
        const sensitiveFields = [
            'user', 'email', 'mail', 'address', 'emailAddress', 'password', 'token', 'accessToken',
            'refreshToken', 'content', 'body', 'contentBytes'
        ];
        
        // Recursively process the object
        for (const key in result) {
            if (Object.prototype.hasOwnProperty.call(result, key)) {
                // Check if this is a sensitive field
                if (sensitiveFields.includes(key.toLowerCase())) {
                    if (typeof result[key] === 'string') {
                        result[key] = 'REDACTED';
                    } else if (Array.isArray(result[key])) {
                        result[key] = `[${result[key].length} items]`;
                    } else if (typeof result[key] === 'object' && result[key] !== null) {
                        result[key] = '{REDACTED}';
                    }
                } 
                // Recursively process nested objects
                else if (typeof result[key] === 'object' && result[key] !== null) {
                    result[key] = this.redactSensitiveData(result[key], visited);
                }
            }
        }
        
        return result;
    },
    /**
     * Gets relevant people from Microsoft Graph
     * @param {object} options - Query options
     * @param {object} req - Express request object (optional)
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<Array<object>>} List of people
     */
    async getRelevantPeople(options = {}, req, userId, sessionId) {
        const startTime = Date.now();
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Extract user context from req if not provided
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        
        // Redact potentially sensitive data for logging
        const redactedOptions = this.redactSensitiveData(options);
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Getting relevant people from Microsoft Graph', {
                sessionId: contextSessionId,
                userAgent: req?.get?.('User-Agent'),
                options: redactedOptions,
                timestamp: new Date().toISOString()
            }, 'people');
        }
        
        if (!graphService || typeof graphService.getRelevantPeople !== 'function') {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                'GraphService.getRelevantPeople not implemented',
                'error',
                { 
                    service: 'people-module',
                    function: 'getRelevantPeople',
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (contextUserId) {
                MonitoringService.error('Failed to get relevant people - service not available', {
                    error: 'GraphService.getRelevantPeople not implemented',
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.error('Failed to get relevant people - service not available', {
                    sessionId: contextSessionId,
                    error: 'GraphService.getRelevantPeople not implemented',
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }
        
        try {
            // Call the Graph API with user context
            const results = await graphService.getRelevantPeople(options, req, contextUserId, contextSessionId);
            
            // Calculate elapsed time
            const elapsedTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (contextUserId) {
                MonitoringService.info('Successfully retrieved relevant people', {
                    count: results?.length || 0,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.info('Successfully retrieved relevant people with session', {
                    sessionId: contextSessionId,
                    count: results?.length || 0,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            return results;
        } catch (error) {
            const elapsedTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                `Failed to get relevant people: ${error.code || error.message}`,
                error.statusCode && error.statusCode >= 500 ? 'error' : 'warn',
                { 
                    statusCode: error.statusCode,
                    code: error.code,
                    graphRequestId: error.requestId,
                    originalError: error.stack,
                    requestParams: { options: redactedOptions },
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (contextUserId) {
                MonitoringService.error('Failed to get relevant people', {
                    error: error.message,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.error('Failed to get relevant people', {
                    sessionId: contextSessionId,
                    error: error.message,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }
    },
    
    
    /**
     * Get a specific person by ID
     * @param {string} personId - Person ID
     * @param {object} req - Express request object (optional)
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<object>} Person details
     */
    async getPersonById(personId, req, userId, sessionId) {
        const startTime = Date.now();
        const { graphService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Extract user context from req if not provided
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Getting person by ID from Microsoft Graph', {
                sessionId: contextSessionId,
                userAgent: req?.get?.('User-Agent'),
                personId: personId ? personId.substring(0, 20) + '...' : 'undefined',
                timestamp: new Date().toISOString()
            }, 'people');
        }
        
        if (!personId) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                'Person ID is required to get person details',
                'warn',
                { 
                    service: 'people-module',
                    function: 'getPersonById',
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (contextUserId) {
                MonitoringService.error('Failed to get person - missing person ID', {
                    error: 'Person ID is required',
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.error('Failed to get person - missing person ID', {
                    sessionId: contextSessionId,
                    error: 'Person ID is required',
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }
        
        if (!graphService || typeof graphService.getPersonById !== 'function') {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                'GraphService.getPersonById not implemented',
                'error',
                { 
                    service: 'people-module',
                    function: 'getPersonById',
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (contextUserId) {
                MonitoringService.error('Failed to get person - service not available', {
                    error: 'GraphService.getPersonById not implemented',
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.error('Failed to get person - service not available', {
                    sessionId: contextSessionId,
                    error: 'GraphService.getPersonById not implemented',
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }
        
        try {
            // Call the Graph API with user context
            const rawPerson = await graphService.getPersonById(personId, req, contextUserId, contextSessionId);
            
            // Calculate elapsed time
            const elapsedTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (contextUserId) {
                MonitoringService.info('Successfully retrieved person by ID', {
                    found: !!rawPerson,
                    elapsedTime,
                    hasData: rawPerson && Object.keys(rawPerson).length > 0,
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.info('Successfully retrieved person by ID with session', {
                    sessionId: contextSessionId,
                    found: !!rawPerson,
                    elapsedTime,
                    hasData: rawPerson && Object.keys(rawPerson).length > 0,
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            return rawPerson;
        } catch (error) {
            const elapsedTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                `Failed to get person by ID: ${error.code || error.message}`,
                error.statusCode && error.statusCode >= 500 ? 'error' : 'warn',
                { 
                    statusCode: error.statusCode,
                    code: error.code,
                    graphRequestId: error.requestId,
                    originalError: error.stack,
                    personId: personId ? personId.substring(0, 20) + '...' : 'undefined',
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (contextUserId) {
                MonitoringService.error('Failed to get person by ID', {
                    error: error.message,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.error('Failed to get person by ID', {
                    sessionId: contextSessionId,
                    error: error.message,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }
    },
    
    /**
     * Find people based on criteria (name, role, etc.)
     * @param {object} criteria - Search criteria
     * @param {object} req - Express request object (optional)
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<Array<object>>} List of matching people
     */
    async findPeople(criteria = {}, req, userId, sessionId) {
        const startTime = Date.now();
        const { graphService, cacheService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Extract user context from req if not provided
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        
        // Redact potentially sensitive data for logging
        const redactedCriteria = this.redactSensitiveData(criteria);
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Finding people based on criteria', {
                sessionId: contextSessionId,
                userAgent: req?.get?.('User-Agent'),
                criteria: redactedCriteria,
                timestamp: new Date().toISOString()
            }, 'people');
        }
        
        if (!graphService || typeof graphService.searchPeople !== 'function') {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                'GraphService.searchPeople not implemented',
                'error',
                { 
                    service: 'people-module',
                    function: 'findPeople',
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (contextUserId) {
                MonitoringService.error('Failed to find people - service not available', {
                    error: 'GraphService.searchPeople not implemented',
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.error('Failed to find people - service not available', {
                    sessionId: contextSessionId,
                    error: 'GraphService.searchPeople not implemented',
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }
        
        try {
            // Extract search query from criteria
            const query = criteria.query || criteria.name || '';
            if (!query) {
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('No query provided, returning relevant people', { 
                        sessionId: contextSessionId,
                        limit: criteria.limit || 10,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                    
                return await this.getRelevantPeople({ top: criteria.limit || 10 }, req, contextUserId, contextSessionId);
            }
            
            // Try cache first
            const cacheKey = `people:search:${query}`;
            let results;
            let cacheHit = false;
            
            if (cacheService) {
                try {
                    results = await cacheService.get(cacheKey);
                    cacheHit = !!results;
                    
                    if (cacheHit && process.env.NODE_ENV === 'development') {
                        MonitoringService.debug('Found people in cache', { 
                            sessionId: contextSessionId,
                            count: results.length,
                            query: query.substring(0, 50) + '...',
                            timestamp: new Date().toISOString()
                        }, 'people');
                    }
                } catch (cacheError) {
                    // Log cache error but continue with API call
                    if (process.env.NODE_ENV === 'development') {
                        MonitoringService.debug('Cache error when finding people', { 
                            sessionId: contextSessionId,
                            error: cacheError.message,
                            timestamp: new Date().toISOString()
                        }, 'people');
                    }
                }
            }
            
            if (!results) {
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Cache miss, calling graph service', { 
                        sessionId: contextSessionId,
                        query: query.substring(0, 50) + '...',
                        limit: criteria.limit || 10,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                    
                results = await graphService.searchPeople(query, { top: criteria.limit || 10 }, req, contextUserId, contextSessionId);
                
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Found people from graph service', { 
                        sessionId: contextSessionId,
                        count: results.length,
                        query: query.substring(0, 50) + '...',
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                    
                // Cache the results
                if (cacheService) {
                    try {
                        await cacheService.set(cacheKey, results, 60); // Cache for 1 minute
                    } catch (cacheError) {
                        // Log cache error but continue
                        if (process.env.NODE_ENV === 'development') {
                            MonitoringService.debug('Failed to cache people search results', { 
                                sessionId: contextSessionId,
                                error: cacheError.message,
                                timestamp: new Date().toISOString()
                            }, 'people');
                        }
                    }
                }
            }
            
            // Calculate elapsed time
            const elapsedTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (contextUserId) {
                MonitoringService.info('Successfully found people', {
                    count: results?.length || 0,
                    cacheHit,
                    hasQuery: !!query,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.info('Successfully found people with session', {
                    sessionId: contextSessionId,
                    count: results?.length || 0,
                    cacheHit,
                    hasQuery: !!query,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            return results;
        } catch (error) {
            const elapsedTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                `Failed to find people: ${error.code || error.message}`,
                error.statusCode && error.statusCode >= 500 ? 'error' : 'warn',
                { 
                    statusCode: error.statusCode,
                    code: error.code,
                    graphRequestId: error.requestId,
                    originalError: error.stack,
                    requestParams: { criteria: redactedCriteria },
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (contextUserId) {
                MonitoringService.error('Failed to find people', {
                    error: error.message,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.error('Failed to find people', {
                    sessionId: contextSessionId,
                    error: error.message,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }
    },
    
    /**
     * Initializes the people module with dependencies.
     * @param {object} services - { graphService, cacheService, errorService, monitoringService }
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {object} Initialized module
     */
    init(services = {}, userId, sessionId) {
        const startTime = Date.now();
        
        // Destructure provided services and apply defaults
        const { graphService, cacheService, errorService = ErrorService, monitoringService = MonitoringService } = services;

        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Initializing People Module', {
                sessionId: sessionId,
                hasGraphService: !!graphService,
                hasCacheService: !!cacheService,
                timestamp: new Date().toISOString()
            }, 'people');
        }

        // Require graphService
        if (!graphService) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                "PeopleModule init failed: Required service 'graphService' is missing",
                'error',
                { 
                    missingService: 'graphService',
                    service: 'people-module',
                    function: 'init',
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Failed to initialize People Module - missing service', {
                    error: 'GraphService is required',
                    timestamp: new Date().toISOString()
                }, 'people', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Failed to initialize People Module - missing service', {
                    sessionId: sessionId,
                    error: 'GraphService is required',
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }

        // Store services for later use
        this.services = { graphService, cacheService, errorService, monitoringService };

        const elapsedTime = Date.now() - startTime;
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('PeopleModule initialized successfully', {
                elapsedTime,
                timestamp: new Date().toISOString()
            }, 'people', null, userId);
        } else if (sessionId) {
            MonitoringService.info('PeopleModule initialized successfully with session', {
                sessionId: sessionId,
                elapsedTime,
                timestamp: new Date().toISOString()
            }, 'people');
        }
        
        return this;
    },
    
    /**
     * Handles people-related intents routed to this module.
     * @param {string} intent
     * @param {object} entities
     * @param {object} context
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<object>>} Normalized response
     */
    async handleIntent(intent, entities = {}, context = {}, userId, sessionId) {
        const startTime = Date.now();
        const { graphService, cacheService, errorService = ErrorService, monitoringService = MonitoringService } = this.services || {};
        
        // Extract user context from context if not provided
        const contextUserId = userId || context?.req?.user?.userId;
        const contextSessionId = sessionId || context?.req?.session?.id;
        
        // Redact potentially sensitive data for logging
        const redactedEntities = this.redactSensitiveData(entities);
        const redactedContext = this.redactSensitiveData(context);
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Handling people intent', {
                sessionId: contextSessionId,
                intent,
                entities: redactedEntities,
                timestamp: new Date().toISOString()
            }, 'people');
        }
        
        try {
            let result;
            
            switch (intent) {
                case 'findPeople': {
                    const criteria = entities.criteria || {};
                    const results = await this.findPeople(criteria, context.req, contextUserId, contextSessionId);
                    result = { type: 'peopleList', items: results };
                    break;
                }
                
                
                case 'getPersonById': {
                    const personId = entities.personId;
                    
                    if (!personId) {
                        // Pattern 3: Infrastructure Error Logging
                        const mcpError = ErrorService.createError(
                            'people',
                            'Person ID is required for getPersonById intent',
                            'warn',
                            { 
                                intent,
                                service: 'people-module',
                                function: 'handleIntent',
                                timestamp: new Date().toISOString() 
                            }
                        );
                        MonitoringService.logError(mcpError);
                        
                        // Pattern 4: User Error Tracking
                        if (contextUserId) {
                            MonitoringService.error('Failed to get person - missing person ID', {
                                intent,
                                error: 'Person ID is required',
                                timestamp: new Date().toISOString()
                            }, 'people', null, contextUserId);
                        } else if (contextSessionId) {
                            MonitoringService.error('Failed to get person - missing person ID', {
                                sessionId: contextSessionId,
                                intent,
                                error: 'Person ID is required',
                                timestamp: new Date().toISOString()
                            }, 'people');
                        }
                            
                        throw mcpError;
                    }
                    
                    // Try cache first if available
                    let person;
                    let cacheHit = false;
                    
                    if (cacheService) {
                        try {
                            const cacheKey = `people:id:${personId}`;
                            person = await cacheService.get(cacheKey);
                            cacheHit = !!person;
                            
                            if (cacheHit && process.env.NODE_ENV === 'development') {
                                MonitoringService.debug('Found person in cache', { 
                                    sessionId: contextSessionId,
                                    personId: personId.substring(0, 20) + '...',
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        } catch (cacheError) {
                            // Log cache error but continue with API call
                            if (process.env.NODE_ENV === 'development') {
                                MonitoringService.debug('Cache error in getPersonById intent', { 
                                    sessionId: contextSessionId,
                                    error: cacheError.message,
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        }
                    }
                    
                    if (!person) {
                        person = await graphService.getPersonById(personId, context.req, contextUserId, contextSessionId);
                        
                        // Cache the person if possible
                        if (cacheService) {
                            try {
                                const cacheKey = `people:id:${personId}`;
                                await cacheService.set(cacheKey, person, 300); // Cache for 5 minutes
                            } catch (cacheError) {
                                // Log cache error but continue
                                if (process.env.NODE_ENV === 'development') {
                                    MonitoringService.debug('Failed to cache person', { 
                                        sessionId: contextSessionId,
                                        error: cacheError.message,
                                        timestamp: new Date().toISOString()
                                    }, 'people');
                                }
                            }
                        }
                    }
                    
                    result = { type: 'person', person };
                    break;
                }
                
                case 'getRelevantPeople': {
                    const options = entities.options || {};
                    
                    // Try cache first if available
                    let people;
                    let cacheHit = false;
                    
                    if (cacheService) {
                        try {
                            const cacheKey = `people:relevant:${JSON.stringify(options)}`;
                            people = await cacheService.get(cacheKey);
                            cacheHit = !!people;
                            
                            if (cacheHit && process.env.NODE_ENV === 'development') {
                                MonitoringService.debug('Found relevant people in cache', { 
                                    sessionId: contextSessionId,
                                    count: people.length,
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        } catch (cacheError) {
                            // Log cache error but continue with API call
                            if (process.env.NODE_ENV === 'development') {
                                MonitoringService.debug('Cache error in getRelevantPeople intent', { 
                                    sessionId: contextSessionId,
                                    error: cacheError.message,
                                    timestamp: new Date().toISOString()
                                }, 'people');
                            }
                        }
                    }
                    
                    if (!people) {
                        people = await graphService.getRelevantPeople(options, context.req, contextUserId, contextSessionId);
                        
                        // Cache the results if possible
                        if (cacheService) {
                            try {
                                const cacheKey = `people:relevant:${JSON.stringify(options)}`;
                                await cacheService.set(cacheKey, people, 300); // Cache for 5 minutes
                            } catch (cacheError) {
                                // Log cache error but continue
                                if (process.env.NODE_ENV === 'development') {
                                    MonitoringService.debug('Failed to cache relevant people', { 
                                        sessionId: contextSessionId,
                                        error: cacheError.message,
                                        timestamp: new Date().toISOString()
                                    }, 'people');
                                }
                            }
                        }
                    }
                    
                    result = { type: 'peopleList', items: people };
                    break;
                }
                
                default: {
                    // Pattern 3: Infrastructure Error Logging
                    const mcpError = ErrorService.createError(
                        'people',
                        `PeopleModule cannot handle intent: ${intent}`,
                        'warn',
                        { 
                            intent, 
                            moduleId: this.id,
                            service: 'people-module',
                            function: 'handleIntent',
                            timestamp: new Date().toISOString()
                        }
                    );
                    MonitoringService.logError(mcpError);
                    
                    // Pattern 4: User Error Tracking
                    if (contextUserId) {
                        MonitoringService.error('Unsupported intent in People Module', {
                            intent,
                            error: `Intent '${intent}' not supported`,
                            timestamp: new Date().toISOString()
                        }, 'people', null, contextUserId);
                    } else if (contextSessionId) {
                        MonitoringService.error('Unsupported intent in People Module', {
                            sessionId: contextSessionId,
                            intent,
                            error: `Intent '${intent}' not supported`,
                            timestamp: new Date().toISOString()
                        }, 'people');
                    }
                    
                    throw mcpError;
                }
            }
            
            // Calculate elapsed time
            const elapsedTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (contextUserId) {
                MonitoringService.info('Successfully handled people intent', {
                    intent,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.info('Successfully handled people intent with session', {
                    sessionId: contextSessionId,
                    intent,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people');
            }
                
            return result;
        } catch (error) {
            // Calculate elapsed time even for errors
            const elapsedTime = Date.now() - startTime;
            
            // If this is already a structured MCP error, just re-throw it
            if (error.category && error.severity && error.context) {
                throw error;
            }
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'people',
                `Error handling people intent '${intent}': ${error.message}`,
                'error',
                { 
                    intent,
                    originalError: error.stack,
                    entities: redactedEntities,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (contextUserId) {
                MonitoringService.error('Failed to handle people intent', {
                    intent,
                    error: error.message,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.error('Failed to handle people intent', {
                    sessionId: contextSessionId,
                    intent,
                    error: error.message,
                    elapsedTime,
                    timestamp: new Date().toISOString()
                }, 'people');
            }
            
            throw mcpError;
        }
    },
    id: 'people',
    name: 'Microsoft People',
    capabilities: PEOPLE_CAPABILITIES,
};

module.exports = PeopleModule;
