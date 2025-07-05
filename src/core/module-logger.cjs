/**
 * @fileoverview Module logger for MCP modules and services.
 * Provides logging utilities to track operations through the module and service layers.
 */

const MonitoringService = require('./monitoring-service.cjs');
const ErrorService = require('./error-service.cjs');

/**
 * Creates a logger wrapper for modules and services.
 * 
 * @param {string} moduleName - The name of the module or service
 * @param {string} componentType - The type of component ('module' or 'service')
 * @returns {Object} Logger methods
 */
function createLogger(moduleName, componentType) {
    /**
     * Logs the entry into a method call with user context
     * 
     * @param {string} methodName - The name of the method being called
     * @param {Object} params - The parameters passed to the method
     * @param {string} requestId - The ID of the request for tracking
     * @param {string} [userId] - The user ID for multi-user context
     * @param {string} [deviceId] - The device ID for multi-user context
     */
    function logMethodEntry(methodName, params, requestId, userId = null, deviceId = null) {
        const startTime = process.hrtime();
        const timestamp = new Date().toISOString();
        
        const context = {
            requestId,
            method: methodName,
            component: componentType,
            moduleName,
            params: sanitizeParams(params),
            userId,
            deviceId,
            timestamp
        };
        
        // Pattern 1: Development Debug Logs - Conditional on NODE_ENV
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug(
                `${componentType} ${moduleName}.${methodName} called`,
                context,
                componentType
            );
        }
        
        // Pattern 2: User Activity Logs - For successful operations
        if (userId) {
            MonitoringService.info(
                `${componentType} ${moduleName}.${methodName} called`,
                context,
                componentType,
                null,
                userId,
                deviceId
            );
        } else {
            MonitoringService.info(
                `${componentType} ${moduleName}.${methodName} called`,
                context,
                componentType
            );
        }
        
        return startTime; // Return start time for duration tracking
    }
    
    /**
     * Logs the completion of a method call with user context
     * 
     * @param {string} methodName - The name of the method being called
     * @param {Object} result - The result of the method call
     * @param {Array} startTime - The start time from process.hrtime()
     * @param {string} requestId - The ID of the request for tracking
     * @param {string} [userId] - The user ID for multi-user context
     * @param {string} [deviceId] - The device ID for multi-user context
     */
    function logMethodExit(methodName, result, startTime, requestId, userId = null, deviceId = null) {
        const hrTime = process.hrtime(startTime);
        const durationMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
        const timestamp = new Date().toISOString();
        
        const context = {
            requestId,
            method: methodName,
            component: componentType,
            moduleName,
            durationMs: durationMs.toFixed(2),
            hasResult: result !== undefined && result !== null,
            resultType: result !== undefined && result !== null ? 
                (Array.isArray(result) ? 'array' : typeof result) : 'none',
            userId,
            deviceId,
            timestamp
        };
        
        // If result is an array, add the length
        if (Array.isArray(result)) {
            context.resultLength = result.length;
        }
        
        // Pattern 1: Development Debug Logs - Conditional on NODE_ENV
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug(
                `${componentType} ${moduleName}.${methodName} completed in ${durationMs.toFixed(2)}ms`,
                context,
                componentType
            );
        }
        
        // Pattern 2: User Activity Logs - For successful operations
        if (userId) {
            MonitoringService.info(
                `${componentType} ${moduleName}.${methodName} completed in ${durationMs.toFixed(2)}ms`,
                context,
                componentType,
                null,
                userId,
                deviceId
            );
        } else {
            MonitoringService.info(
                `${componentType} ${moduleName}.${methodName} completed in ${durationMs.toFixed(2)}ms`,
                context,
                componentType
            );
        }
    }
    
    /**
     * Logs an error during a method call with user context
     * 
     * @param {string} methodName - The name of the method being called
     * @param {Error} error - The error that occurred
     * @param {string} requestId - The ID of the request for tracking
     * @param {string} [userId] - The user ID for multi-user context
     * @param {string} [deviceId] - The device ID for multi-user context
     */
    function logMethodError(methodName, error, requestId, userId = null, deviceId = null) {
        const timestamp = new Date().toISOString();
        
        const context = {
            requestId,
            method: methodName,
            component: componentType,
            moduleName,
            userId,
            deviceId,
            timestamp,
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack
            }
        };
        
        // Pattern 1: Development Debug Logs - Conditional on NODE_ENV
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug(
                `${componentType} ${moduleName}.${methodName} error: ${error.message}`,
                {
                    ...context,
                    stack: error.stack
                },
                componentType
            );
        }
        
        // Pattern 3: Infrastructure Error Logging - For server operations
        const mcpError = ErrorService.createError(
            componentType, // Error category based on component type
            `${componentType} ${moduleName}.${methodName} error: ${error.message}`,
            'error',
            {
                requestId,
                method: methodName,
                component: componentType,
                moduleName,
                timestamp,
                originalError: error
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking - For user-visible errors
        if (userId) {
            MonitoringService.error(
                `${componentType} ${moduleName}.${methodName} error: ${error.message}`,
                context,
                componentType,
                null,
                userId,
                deviceId
            );
        } else {
            MonitoringService.error(
                `${componentType} ${moduleName}.${methodName} error: ${error.message}`,
                context,
                componentType
            );
        }
    }
    
    /**
     * Logs a normalization operation
     * 
     * @param {string} dataType - The type of data being normalized
     * @param {Object} data - The data being normalized
     * @param {Object} result - The normalized result
     * @param {string} requestId - The ID of the request for tracking
     */
    function logNormalization(dataType, data, result, requestId, userId = null, deviceId = null) {
        const startTime = process.hrtime();
        const timestamp = new Date().toISOString();
        
        try {
            const context = {
                requestId,
                component: 'normalizer',
                dataType,
                inputType: Array.isArray(data) ? 'array' : typeof data,
                outputType: Array.isArray(result) ? 'array' : typeof result,
                timestamp,
                userId,
                deviceId
            };
            
            // If data is an array, add the length
            if (Array.isArray(data)) {
                context.inputLength = data.length;
            }
            
            // If result is an array, add the length
            if (Array.isArray(result)) {
                context.outputLength = result.length;
            }
            
            const hrTime = process.hrtime(startTime);
            const durationMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
            context.durationMs = durationMs.toFixed(2);
            
            // Pattern 1: Development Debug Logs - Conditional on NODE_ENV
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug(
                    `Normalized ${dataType} data in ${durationMs.toFixed(2)}ms`,
                    context,
                    'normalizer'
                );
            }
            
            // Pattern 2: User Activity Logs - For successful operations
            if (userId) {
                MonitoringService.info(
                    `Normalized ${dataType} data`,
                    context,
                    'normalizer',
                    null,
                    userId,
                    deviceId
                );
            } else {
                MonitoringService.info(
                    `Normalized ${dataType} data`,
                    context,
                    'normalizer'
                );
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging - For server operations
            const mcpError = ErrorService.createError(
                'normalizer',
                `Error normalizing ${dataType} data: ${error.message}`,
                'error',
                {
                    requestId,
                    dataType,
                    timestamp,
                    originalError: error
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking - For user-visible errors
            if (userId) {
                MonitoringService.error(
                    `Error normalizing ${dataType} data`,
                    {
                        requestId,
                        dataType,
                        error: error.message,
                        timestamp,
                        userId,
                        deviceId
                    },
                    'normalizer',
                    null,
                    userId,
                    deviceId
                );
            } else {
                MonitoringService.error(
                    `Error normalizing ${dataType} data`,
                    {
                        requestId,
                        dataType,
                        error: error.message,
                        timestamp
                    },
                    'normalizer'
                );
            }
            
            throw error;
        }
    }
    
    /**
     * Sanitizes parameters for logging by removing sensitive data
     * 
     * @param {Object} params - The parameters to sanitize
     * @returns {Object} Sanitized parameters
     */
    function sanitizeParams(params) {
        if (!params) return {};
        
        // Create a shallow copy
        const sanitized = { ...params };
        
        // List of sensitive parameter names to redact
        const sensitiveParams = [
            'password', 'token', 'accessToken', 'refreshToken', 'secret', 'key', 'auth',
            'authorization', 'credential', 'credentials', 'apiKey', 'api_key'
        ];
        
        // Redact sensitive values
        for (const key of Object.keys(sanitized)) {
            if (sensitiveParams.some(param => key.toLowerCase().includes(param.toLowerCase()))) {
                sanitized[key] = '[REDACTED]';
            }
        }
        
        return sanitized;
    }
    
    /**
     * Wraps a module or service method with logging
     * 
     * @param {Function} method - The method to wrap
     * @param {string} methodName - The name of the method
     * @returns {Function} Wrapped method with logging
     */
    function wrapMethod(method, methodName) {
        return async function(...args) {
            // Extract requestId, userId, and deviceId from the last argument if it's an object
            let requestId = 'unknown';
            let userId = null;
            let deviceId = null;
            
            if (args.length > 0 && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null) {
                const lastArg = args[args.length - 1];
                requestId = lastArg.requestId || lastArg.req?.requestId || 'unknown';
                userId = lastArg.userId || lastArg.req?.user?.userId || null;
                deviceId = lastArg.deviceId || lastArg.req?.deviceId || null;
            }
            
            // Log method entry
            const startTime = logMethodEntry(methodName, args, requestId, userId, deviceId);
            
            try {
                // Call the original method
                const result = await method.apply(this, args);
                
                // Log method exit
                logMethodExit(methodName, result, startTime, requestId, userId, deviceId);
                
                return result;
            } catch (error) {
                // Log method error
                logMethodError(methodName, error, requestId, userId, deviceId);
                
                // Re-throw the error
                throw error;
            }
        };
    }
    
    /**
     * Wraps all methods in a module or service with logging
     * 
     * @param {Object} target - The module or service to wrap
     * @returns {Object} Wrapped module or service with logging
     */
    function wrapModule(target) {
        const wrapped = { ...target };
        
        for (const key of Object.keys(target)) {
            if (typeof target[key] === 'function' && key !== 'init') {
                wrapped[key] = wrapMethod(target[key], key);
            }
        }
        
        return wrapped;
    }
    
    return {
        logMethodEntry,
        logMethodExit,
        logMethodError,
        logNormalization,
        wrapMethod,
        wrapModule
    };
}

/**
 * Creates a logger for modules
 * 
 * @param {string} moduleName - The name of the module
 * @returns {Object} Module logger
 */
function createModuleLogger(moduleName) {
    return createLogger(moduleName, 'module');
}

/**
 * Creates a logger for services
 * 
 * @param {string} serviceName - The name of the service
 * @returns {Object} Service logger
 */
function createServiceLogger(serviceName) {
    return createLogger(serviceName, 'service');
}

/**
 * Creates a logger for normalizers
 * 
 * @returns {Object} Normalizer logger with just the logNormalization method
 */
function createNormalizerLogger() {
    const logger = createLogger('normalizer', 'normalizer');
    return {
        logNormalization: logger.logNormalization
    };
}

module.exports = {
    createModuleLogger,
    createServiceLogger,
    createNormalizerLogger
};
