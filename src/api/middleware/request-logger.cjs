/**
 * @fileoverview Request logger middleware for MCP API.
 * Logs detailed information about API requests and their flow through the system.
 * Includes user context for multi-user isolation and monitoring.
 */

const MonitoringService = require('../../core/monitoring-service.cjs');
const { v4: uuidv4 } = require('uuid');

/**
 * Creates a middleware that logs API requests with detailed information
 * about the request flow through the MCP architecture.
 * 
 * @param {string} component - The component name (routes, controller, module, service)
 * @returns {Function} Express middleware function
 */
function createRequestLogger(component) {
    return (req, res, next) => {
        // Generate or use existing request ID for tracking the request through the system
        if (!req.requestId) {
            req.requestId = uuidv4();
        }
        
        // Extract user context if available from req.user (set by auth middleware)
        const { userId, deviceId } = req.user || {};
        
        // Create context object with request details
        const context = {
            requestId: req.requestId,
            method: req.method,
            path: req.originalUrl || req.url,
            component: component,
            params: req.params,
            query: req.query,
            // Don't log full body to avoid sensitive data in logs
            // Instead, log the keys to know what fields were provided
            bodyKeys: req.body ? Object.keys(req.body) : []
        };
        
        // Log the request entry into this component (only in development)
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.info(
                `Request entered ${component}`,
                context,
                component,
                null, // traceId
                userId,
                deviceId
            );
        }
        
        // Capture the start time
        const startTime = process.hrtime();
        
        // Capture the original end method
        const originalEnd = res.end;
        
        // Override the end method to log when the response is sent
        res.end = function(chunk, encoding) {
            // Restore the original end method
            res.end = originalEnd;
            
            // Calculate processing time
            const hrTime = process.hrtime(startTime);
            const processingTimeMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
            
            // Log the response (only in development)
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.info(
                    `Request exiting ${component} - ${res.statusCode}`,
                    {
                        ...context,
                        statusCode: res.statusCode,
                        processingTimeMs: processingTimeMs.toFixed(2),
                        contentType: res.getHeader('content-type')
                    },
                    component,
                    null, // traceId
                    userId,
                    deviceId
                );
            }
            
            // Call the original end method
            return originalEnd.call(this, chunk, encoding);
        };
        
        // Continue to the next middleware
        next();
    };
}

/**
 * Creates middleware specifically for routes
 */
function routesLogger() {
    return createRequestLogger('routes');
}

/**
 * Creates middleware specifically for controllers
 */
function controllerLogger() {
    return createRequestLogger('controller');
}

/**
 * Creates middleware specifically for modules
 */
function moduleLogger() {
    return createRequestLogger('module');
}

/**
 * Creates middleware specifically for services
 */
function serviceLogger() {
    return createRequestLogger('service');
}

/**
 * Creates middleware for logging normalized responses
 */
function normalizerLogger() {
    return createRequestLogger('normalizer');
}

module.exports = {
    routesLogger,
    controllerLogger,
    moduleLogger,
    serviceLogger,
    normalizerLogger
};
