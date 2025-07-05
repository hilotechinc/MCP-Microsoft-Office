/**
 * @fileoverview People Controller - Handles API requests for Microsoft People API.
 * Follows MCP modular, testable, and consistent API contract rules.
 */

const Joi = require('joi');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

/**
 * Validate request data and log validation results.
 * @param {object} req - Express request
 * @param {object} schema - Joi validation schema
 * @param {string} operation - Operation name for logging
 * @param {object} userContext - User context containing userId and deviceId
 * @returns {object} Validation result
 */
function validateAndLog(req, schema, operation, userContext = {}) {
    const { userId = null, deviceId = null } = userContext;
    
    // Determine what to validate based on the schema
    let dataToValidate;
    if (schema === schemas.getPersonById) {
        // For path parameters
        dataToValidate = req.params;
    } else {
        // For query parameters
        dataToValidate = req.query;
    }
    
    const { error, value } = schema.validate(dataToValidate);
    
    if (error) {
        MonitoringService.warn(`Validation failed for ${operation}`, {
            operation,
            error: error.details[0].message,
            data: dataToValidate,
            userId,
            deviceId
        }, 'people', null, userId, deviceId);
    } else {
        MonitoringService.debug(`Validation passed for ${operation}`, {
            operation,
            validatedData: value,
            userId,
            deviceId
        }, 'people', null, userId, deviceId);
    }
    
    return { error, value };
};

/**
 * Joi validation schemas for people endpoints
 */
const schemas = {
    getRelevantPeople: Joi.object({
        limit: Joi.number().integer().min(1).max(100).optional(),
        filter: Joi.string().optional(),
        orderby: Joi.string().optional()
    }),
    
    searchPeople: Joi.object({
        query: Joi.string().required(),
        limit: Joi.number().integer().min(1).max(100).optional()
    }),
    
    findPeople: Joi.object({
        query: Joi.string().optional(),
        name: Joi.string().optional(),
        limit: Joi.number().integer().min(1).max(100).optional()
    }),
    
    getPersonById: Joi.object({
        id: Joi.string().required()
    })
};

/**
 * Creates a people controller with injected dependencies.
 * @param {object} deps - Controller dependencies
 * @param {object} deps.peopleModule - Initialized people module
 * @returns {object} Controller methods
 */
function createPeopleController({ peopleModule }) {
    if (!peopleModule) {
        throw new Error('People module is required for PeopleController');
    }

    return {
        /**
         * Get relevant people for the current user.
         * @param {object} req - Express request
         * @param {object} res - Express response
         */
        async getRelevantPeople(req, res) {
            // Extract user context from auth middleware
            const { userId = null, deviceId = null } = req.user || {};
            const sessionId = req.session?.id;
            
            const startTime = Date.now();
            try {
                // Pattern 1: Development Debug Logs
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Processing getRelevantPeople request', {
                        method: req.method,
                        path: req.path,
                        sessionId,
                        userAgent: req.get('User-Agent'),
                        timestamp: new Date().toISOString(),
                        userId,
                        deviceId
                    }, 'people');
                }
                
                // Validate query parameters
                const { error: queryError, value: queryValue } = validateAndLog(req, schemas.getRelevantPeople, 'getRelevantPeople', { userId, deviceId });
                if (queryError) {
                    return res.status(400).json({ error: 'Invalid request', details: queryError.details });
                }
                
                const options = {
                    top: queryValue.limit || 10,
                    filter: queryValue.filter,
                    orderby: queryValue.orderby
                };
                
                // Pass req object to module for user-scoped token selection, but don't pass internal userId
                // The internal userId is only for token storage - Graph API should use 'me' (default)
                const people = await peopleModule.getRelevantPeople(options, req);
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('getRelevantPeople completed successfully', {
                        peopleCount: people.length,
                        hasFilter: !!options.filter,
                        hasOrderBy: !!options.orderby,
                        limit: options.top,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'people', null, userId);
                } else if (sessionId) {
                    MonitoringService.info('getRelevantPeople completed with session', {
                        sessionId,
                        peopleCount: people.length,
                        hasFilter: !!options.filter,
                        hasOrderBy: !!options.orderby,
                        limit: options.top,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                
                // Track performance with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.getRelevantPeople.duration', duration, {
                    peopleCount: people.length,
                    hasFilter: !!options.filter,
                    success: true,
                    userId,
                    deviceId
                });
                
                res.json({ people });
            } catch (error) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'people',
                    'Failed to get relevant people',
                    'error',
                    { 
                        endpoint: '/api/v1/people/relevant',
                        error: error.message,
                        stack: error.stack,
                        operation: 'getRelevantPeople',
                        userId,
                        deviceId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('getRelevantPeople failed', {
                        error: error.message,
                        operation: 'getRelevantPeople',
                        timestamp: new Date().toISOString()
                    }, 'people', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('getRelevantPeople failed', {
                        sessionId,
                        error: error.message,
                        operation: 'getRelevantPeople',
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                
                // Track error metrics with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.getRelevantPeople.error', 1, {
                    errorMessage: error.message,
                    duration,
                    success: false,
                    userId,
                    deviceId
                });
                
                res.status(500).json({ 
                    error: 'PEOPLE_RETRIEVAL_FAILED',
                    error_description: 'Failed to retrieve relevant people'
                });
            }
        },


        /**
         * Search for people based on a query string.
         * @param {object} req - Express request
         * @param {object} res - Express response
         */
        async searchPeople(req, res) {
            // Extract user context from auth middleware
            const { userId = null, deviceId = null } = req.user || {};
            const sessionId = req.session?.id;
            
            const startTime = Date.now();
            try {
                // Pattern 1: Development Debug Logs
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Processing searchPeople request', {
                        method: req.method,
                        path: req.path,
                        sessionId,
                        userAgent: req.get('User-Agent'),
                        timestamp: new Date().toISOString(),
                        userId,
                        deviceId
                    }, 'people');
                }
                
                // Validate query parameters
                const { error: queryError, value: queryValue } = validateAndLog(req, schemas.searchPeople, 'searchPeople', { userId, deviceId });
                if (queryError) {
                    return res.status(400).json({ error: 'Invalid request', details: queryError.details });
                }
                
                const options = {
                    query: queryValue.query,
                    top: queryValue.limit || 10
                };
                
                // Pass req object to module for user-scoped token selection, but don't pass internal userId
                // The internal userId is only for token storage - Graph API should use 'me' (default)
                const people = await peopleModule.searchPeople(options, req);
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('searchPeople completed successfully', {
                        peopleCount: people.length,
                        query: options.query,
                        limit: options.top,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'people', null, userId);
                } else if (sessionId) {
                    MonitoringService.info('searchPeople completed with session', {
                        sessionId,
                        peopleCount: people.length,
                        query: options.query,
                        limit: options.top,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                
                // Track performance with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.searchPeople.duration', duration, {
                    peopleCount: people.length,
                    queryLength: options.query?.length || 0,
                    success: true,
                    userId,
                    deviceId
                });
                
                res.json({ people });
            } catch (error) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'people',
                    'Failed to search people',
                    'error',
                    { 
                        endpoint: '/api/v1/people/search',
                        error: error.message,
                        stack: error.stack,
                        operation: 'searchPeople',
                        query: req.query?.query,
                        userId,
                        deviceId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('searchPeople failed', {
                        error: error.message,
                        operation: 'searchPeople',
                        query: req.query?.query,
                        timestamp: new Date().toISOString()
                    }, 'people', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('searchPeople failed', {
                        sessionId,
                        error: error.message,
                        operation: 'searchPeople',
                        query: req.query?.query,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                
                // Track error metrics with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.searchPeople.error', 1, {
                    errorMessage: error.message,
                    duration,
                    success: false,
                    userId,
                    deviceId
                });
                
                res.status(500).json({ 
                    error: 'PEOPLE_SEARCH_FAILED',
                    error_description: 'Failed to search for people'
                });
            }
        },

        /**
         * Get a person by their ID.
         * @param {object} req - Express request
         * @param {object} res - Express response
         */
        async getPersonById(req, res) {
            // Extract user context from auth middleware
            const { userId = null, deviceId = null } = req.user || {};
            const sessionId = req.session?.id;
            
            const startTime = Date.now();
            try {
                // Pattern 1: Development Debug Logs
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Processing getPersonById request', {
                        method: req.method,
                        path: req.path,
                        sessionId,
                        userAgent: req.get('User-Agent'),
                        timestamp: new Date().toISOString(),
                        userId,
                        deviceId
                    }, 'people');
                }
                
                // Validate path parameters
                const { error: paramsError, value: paramsValue } = validateAndLog(req, schemas.getPersonById, 'getPersonById', { userId, deviceId });
                if (paramsError) {
                    return res.status(400).json({ error: 'Invalid request', details: paramsError.details });
                }
                
                const personId = paramsValue.id;
                
                // Pass req object to module for user-scoped token selection, but don't pass internal userId
                // The internal userId is only for token storage - Graph API should use 'me' (default)
                // Now returns raw Graph API response without normalization
                const rawPerson = await peopleModule.getPersonById(personId, req);
                
                if (!rawPerson) {
                    // Track not found metric with user context
                    MonitoringService.trackMetric('people.getPersonById.not_found', 1, {
                        personId,
                        success: false,
                        userId,
                        deviceId
                    });
                    
                    return res.status(404).json({ error: 'Person not found' });
                }
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('getPersonById completed successfully', {
                        personId,
                        hasPersonData: !!rawPerson,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'people', null, userId);
                } else if (sessionId) {
                    MonitoringService.info('getPersonById completed with session', {
                        sessionId,
                        personId,
                        hasPersonData: !!rawPerson,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                
                // Track performance with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.getPersonById.duration', duration, {
                    personId,
                    success: true,
                    userId,
                    deviceId
                });
                
                // Return the raw person data from Graph API
                res.json({ person: rawPerson });
            } catch (error) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'people',
                    'Failed to get person by ID',
                    'error',
                    { 
                        endpoint: '/api/v1/people/:id',
                        error: error.message,
                        stack: error.stack,
                        operation: 'getPersonById',
                        personId: req.params?.id,
                        userId,
                        deviceId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('getPersonById failed', {
                        error: error.message,
                        operation: 'getPersonById',
                        personId: req.params?.id,
                        timestamp: new Date().toISOString()
                    }, 'people', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('getPersonById failed', {
                        sessionId,
                        error: error.message,
                        operation: 'getPersonById',
                        personId: req.params?.id,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                
                // Track error metrics with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.getPersonById.error', 1, {
                    errorMessage: error.message,
                    duration,
                    personId: req.params?.id,
                    success: false,
                    userId,
                    deviceId
                });
                
                res.status(500).json({ 
                    error: 'PERSON_RETRIEVAL_FAILED',
                    error_description: 'Failed to retrieve person by ID'
                });
            }
        },

        /**
         * Find people based on various criteria.
         * @param {object} req - Express request
         * @param {object} res - Express response
         */
        async findPeople(req, res) {
            // Extract user context from auth middleware
            const { userId = null, deviceId = null } = req.user || {};
            const sessionId = req.session?.id;
            
            const startTime = Date.now();
            try {
                // Pattern 1: Development Debug Logs
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Processing findPeople request', {
                        method: req.method,
                        path: req.path,
                        sessionId,
                        userAgent: req.get('User-Agent'),
                        timestamp: new Date().toISOString(),
                        userId,
                        deviceId
                    }, 'people');
                }
                
                // Validate query parameters
                const { error: queryError, value: queryValue } = validateAndLog(req, schemas.findPeople, 'findPeople', { userId, deviceId });
                if (queryError) {
                    return res.status(400).json({ error: 'Invalid request', details: queryError.details });
                }
                
                const options = {
                    query: queryValue.query,
                    name: queryValue.name,
                    top: queryValue.limit || 10
                };
                
                // Pass req object to module for user-scoped token selection, but don't pass internal userId
                // The internal userId is only for token storage - Graph API should use 'me' (default)
                const people = await peopleModule.findPeople(options, req);
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('findPeople completed successfully', {
                        peopleCount: people.length,
                        hasQuery: !!options.query,
                        hasName: !!options.name,
                        limit: options.top,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'people', null, userId);
                } else if (sessionId) {
                    MonitoringService.info('findPeople completed with session', {
                        sessionId,
                        peopleCount: people.length,
                        hasQuery: !!options.query,
                        hasName: !!options.name,
                        limit: options.top,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                
                // Track performance with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.findPeople.duration', duration, {
                    peopleCount: people.length,
                    hasQuery: !!options.query,
                    hasName: !!options.name,
                    success: true,
                    userId,
                    deviceId
                });
                
                res.json({ people });
            } catch (error) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'people',
                    'Failed to find people',
                    'error',
                    { 
                        endpoint: '/api/v1/people/find',
                        error: error.message,
                        stack: error.stack,
                        operation: 'findPeople',
                        query: req.query?.query,
                        name: req.query?.name,
                        userId,
                        deviceId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('findPeople failed', {
                        error: error.message,
                        operation: 'findPeople',
                        query: req.query?.query,
                        name: req.query?.name,
                        timestamp: new Date().toISOString()
                    }, 'people', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('findPeople failed', {
                        sessionId,
                        error: error.message,
                        operation: 'findPeople',
                        query: req.query?.query,
                        name: req.query?.name,
                        timestamp: new Date().toISOString()
                    }, 'people');
                }
                
                // Track error metrics with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.findPeople.error', 1, {
                    errorMessage: error.message,
                    duration,
                    success: false,
                    userId,
                    deviceId
                });
                
                res.status(500).json({ 
                    error: 'PEOPLE_SEARCH_FAILED',
                    error_description: 'Failed to find people'
                });
            }
        }
    };
}

module.exports = createPeopleController;
