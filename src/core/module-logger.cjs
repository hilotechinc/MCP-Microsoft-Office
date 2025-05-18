/**
 * @fileoverview Module logger for MCP modules and services.
 * Provides logging utilities to track operations through the module and service layers.
 */

const monitoringService = require('./monitoring-service.cjs');

/**
 * Creates a logger wrapper for modules and services.
 * 
 * @param {string} moduleName - The name of the module or service
 * @param {string} componentType - The type of component ('module' or 'service')
 * @returns {Object} Logger methods
 */
function createLogger(moduleName, componentType) {
    /**
     * Logs the start of a method call
     * 
     * @param {string} methodName - The name of the method being called
     * @param {Object} params - The parameters passed to the method
     * @param {string} requestId - The ID of the request for tracking
     */
    function logMethodEntry(methodName, params, requestId) {
        const context = {
            requestId,
            method: methodName,
            component: componentType,
            moduleName,
            params: sanitizeParams(params)
        };
        
        monitoringService.info(
            `${componentType} ${moduleName}.${methodName} called`,
            context,
            componentType
        );
        
        return process.hrtime(); // Return start time for duration tracking
    }
    
    /**
     * Logs the completion of a method call
     * 
     * @param {string} methodName - The name of the method being called
     * @param {Object} result - The result of the method call
     * @param {Array} startTime - The start time from process.hrtime()
     * @param {string} requestId - The ID of the request for tracking
     */
    function logMethodExit(methodName, result, startTime, requestId) {
        const hrTime = process.hrtime(startTime);
        const durationMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
        
        const context = {
            requestId,
            method: methodName,
            component: componentType,
            moduleName,
            durationMs: durationMs.toFixed(2),
            hasResult: result !== undefined && result !== null,
            resultType: result !== undefined && result !== null ? 
                (Array.isArray(result) ? 'array' : typeof result) : 'none'
        };
        
        // If result is an array, add the length
        if (Array.isArray(result)) {
            context.resultLength = result.length;
        }
        
        monitoringService.info(
            `${componentType} ${moduleName}.${methodName} completed in ${durationMs.toFixed(2)}ms`,
            context,
            componentType
        );
    }
    
    /**
     * Logs an error during a method call
     * 
     * @param {string} methodName - The name of the method being called
     * @param {Error} error - The error that occurred
     * @param {string} requestId - The ID of the request for tracking
     */
    function logMethodError(methodName, error, requestId) {
        const context = {
            requestId,
            method: methodName,
            component: componentType,
            moduleName,
            error: {
                message: error.message,
                name: error.name,
                stack: error.stack
            }
        };
        
        monitoringService.error(
            `Error in ${componentType} ${moduleName}.${methodName}: ${error.message}`,
            context,
            componentType
        );
    }
    
    /**
     * Logs a normalization operation
     * 
     * @param {string} dataType - The type of data being normalized
     * @param {Object} data - The data being normalized
     * @param {Object} result - The normalized result
     * @param {string} requestId - The ID of the request for tracking
     */
    function logNormalization(dataType, data, result, requestId) {
        const startTime = process.hrtime();
        
        const context = {
            requestId,
            component: 'normalizer',
            dataType,
            inputType: Array.isArray(data) ? 'array' : typeof data,
            outputType: Array.isArray(result) ? 'array' : typeof result
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
        
        monitoringService.info(
            `Normalized ${dataType} data`,
            context,
            'normalizer'
        );
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
            // Extract requestId from the last argument if it's an object
            let requestId = 'unknown';
            if (args.length > 0 && typeof args[args.length - 1] === 'object' && args[args.length - 1] !== null) {
                const lastArg = args[args.length - 1];
                requestId = lastArg.requestId || lastArg.req?.requestId || 'unknown';
            }
            
            // Log method entry
            const startTime = logMethodEntry(methodName, args, requestId);
            
            try {
                // Call the original method
                const result = await method.apply(this, args);
                
                // Log method exit
                logMethodExit(methodName, result, startTime, requestId);
                
                return result;
            } catch (error) {
                // Log method error
                logMethodError(methodName, error, requestId);
                
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
