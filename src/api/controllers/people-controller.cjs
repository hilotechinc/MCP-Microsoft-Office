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
            
            const startTime = Date.now();
            try {
                // Log request with user context
                MonitoringService.info(`Processing ${req.method} ${req.path}`, {
                    method: req.method,
                    path: req.path,
                    query: req.query,
                    ip: req.ip,
                    userId,
                    deviceId
                }, 'people', null, userId, deviceId);
                
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
                // Track error metrics with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.getRelevantPeople.error', 1, {
                    errorMessage: error.message,
                    duration,
                    success: false,
                    userId,
                    deviceId
                });
                
                // Create standardized error with user context
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Error getting relevant people',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        error: error.message, 
                        stack: error.stack,
                        operation: 'getRelevantPeople',
                        userId,
                        deviceId
                    }
                );
                
                // Log the error
                MonitoringService.logError(mcpError);
                
                res.status(500).json({ error: 'Failed to get relevant people', details: error.message });
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
            
            const startTime = Date.now();
            try {
                // Log request with user context
                MonitoringService.info(`Processing ${req.method} ${req.path}`, {
                    method: req.method,
                    path: req.path,
                    params: req.params,
                    ip: req.ip,
                    userId,
                    deviceId
                }, 'people', null, userId, deviceId);
                
                // Validate path parameters
                const { error: paramsError, value: paramsValue } = validateAndLog(req, schemas.getPersonById, 'getPersonById', { userId, deviceId });
                if (paramsError) {
                    return res.status(400).json({ error: 'Invalid request', details: paramsError.details });
                }
                
                const personId = paramsValue.id;
                
                // Pass req object to module for user-scoped token selection, but don't pass internal userId
                // The internal userId is only for token storage - Graph API should use 'me' (default)
                const person = await peopleModule.getPersonById(personId, req);
                
                if (!person) {
                    // Track not found metric with user context
                    MonitoringService.trackMetric('people.getPersonById.not_found', 1, {
                        personId,
                        success: false,
                        userId,
                        deviceId
                    });
                    
                    return res.status(404).json({ error: 'Person not found' });
                }
                
                // Track performance with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.getPersonById.duration', duration, {
                    personId,
                    success: true,
                    userId,
                    deviceId
                });
                
                res.json({ person });
            } catch (error) {
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
                
                // Create standardized error with user context
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Error getting person by ID',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        error: error.message, 
                        stack: error.stack,
                        operation: 'getPersonById',
                        personId: req.params?.id,
                        userId,
                        deviceId
                    }
                );
                
                // Log the error
                MonitoringService.logError(mcpError);
                
                res.status(500).json({ error: 'Failed to get person', details: error.message });
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
            
            const startTime = Date.now();
            try {
                // Log request with user context
                MonitoringService.info(`Processing ${req.method} ${req.path}`, {
                    method: req.method,
                    path: req.path,
                    query: req.query,
                    ip: req.ip,
                    userId,
                    deviceId
                }, 'people', null, userId, deviceId);
                
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
                // Track error metrics with user context
                const duration = Date.now() - startTime;
                MonitoringService.trackMetric('people.findPeople.error', 1, {
                    errorMessage: error.message,
                    duration,
                    success: false,
                    userId,
                    deviceId
                });
                
                // Create standardized error with user context
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Error finding people',
                    ErrorService.SEVERITIES.ERROR,
                    { 
                        error: error.message, 
                        stack: error.stack,
                        operation: 'findPeople',
                        query: req.query?.query,
                        name: req.query?.name,
                        userId,
                        deviceId
                    }
                );
                
                // Log the error
                MonitoringService.logError(mcpError);
                
                res.status(500).json({ error: 'Failed to find people', details: error.message });
            }
        }
    };
}

module.exports = createPeopleController;
