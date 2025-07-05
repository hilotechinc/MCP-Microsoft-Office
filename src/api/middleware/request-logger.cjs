/**
 * @fileoverview Request logger middleware for MCP API.
 * Logs detailed information about API requests and their flow through the system.
 * Includes user context for multi-user isolation and monitoring.
 * Implements all 4 required logging patterns for comprehensive operational visibility.
 */

const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');
const { resolveUserId } = require('../../core/user-id-resolver.cjs');
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
        try {
            // Skip logging for the logs endpoint to prevent feedback loops
            const path = req.originalUrl || req.url;
            if (path.includes('/api/v1/logs')) {
                return next();
            }
            
            // Generate or use existing request ID for tracking the request through the system
            if (!req.requestId) {
                req.requestId = uuidv4();
            }
            
            // Extract user context using consistent user ID resolution
            const userId = resolveUserId(req);
            const { deviceId } = req.user || {};
            const sessionId = req.session?.id;
            
            // Pattern 1: Development Debug Logs
            // Only emitted in development environment
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug(`Request entering ${component}`, {
                    requestId: req.requestId,
                    method: req.method,
                    path: req.originalUrl || req.url,
                    component: component,
                    sessionId,
                    userAgent: req.get('User-Agent'),
                    timestamp: new Date().toISOString(),
                    userId,
                    deviceId,
                    params: req.params,
                    query: req.query,
                    bodyKeys: req.body ? Object.keys(req.body) : []
                }, 'request'); // Category: 'request' for request logging
            }
            
            // Create context object with request details
            const context = {
                requestId: req.requestId,
                method: req.method,
                path: req.originalUrl || req.url,
                component: component,
                params: req.params,
                query: req.query,
                bodyKeys: req.body ? Object.keys(req.body) : [],
                timestamp: new Date().toISOString()
            };
            
            // Capture the start time
            const startTime = process.hrtime();
            
            // Capture the original end method
            const originalEnd = res.end;
            
            // Override the end method to log when the response is sent
            res.end = function(chunk, encoding) {
                try {
                    // Restore the original end method
                    res.end = originalEnd;
                    
                    // Calculate processing time
                    const hrTime = process.hrtime(startTime);
                    const processingTimeMs = hrTime[0] * 1000 + hrTime[1] / 1000000;
                    
                    const responseContext = {
                        ...context,
                        statusCode: res.statusCode,
                        processingTimeMs: processingTimeMs.toFixed(2),
                        contentType: res.getHeader('content-type'),
                        timestamp: new Date().toISOString()
                    };
                    
                    // Pattern 1: Development Debug Logs for response
                    if (process.env.NODE_ENV === 'development') {
                        MonitoringService.debug(`Request exiting ${component} - ${res.statusCode}`, {
                            ...responseContext,
                            sessionId,
                            userAgent: req.get('User-Agent'),
                            userId,
                            deviceId
                        }, 'request');
                    }
                    
                    // Pattern 2: User Activity Logs
                    // Log successful operations (2xx status codes)
                    if (res.statusCode >= 200 && res.statusCode < 300) {
                        if (userId) {
                            MonitoringService.info(`${component} request completed successfully`, {
                                method: req.method,
                                path: req.originalUrl || req.url,
                                statusCode: res.statusCode,
                                processingTimeMs: processingTimeMs.toFixed(2),
                                timestamp: new Date().toISOString()
                            }, 'request', null, userId);
                        } else if (sessionId) {
                            MonitoringService.info(`${component} request completed with session`, {
                                sessionId,
                                method: req.method,
                                path: req.originalUrl || req.url,
                                statusCode: res.statusCode,
                                processingTimeMs: processingTimeMs.toFixed(2),
                                timestamp: new Date().toISOString()
                            }, 'request');
                        }
                    }
                    
                    // Pattern 4: User Error Tracking
                    // Log client and server errors (4xx and 5xx status codes)
                    if (res.statusCode >= 400) {
                        const errorMessage = res.statusCode >= 500 
                            ? `${component} server error` 
                            : `${component} client error`;
                            
                        if (userId) {
                            MonitoringService.error(errorMessage, {
                                method: req.method,
                                path: req.originalUrl || req.url,
                                statusCode: res.statusCode,
                                processingTimeMs: processingTimeMs.toFixed(2),
                                timestamp: new Date().toISOString()
                            }, 'request', null, userId);
                        } else if (sessionId) {
                            MonitoringService.error(errorMessage, {
                                sessionId,
                                method: req.method,
                                path: req.originalUrl || req.url,
                                statusCode: res.statusCode,
                                processingTimeMs: processingTimeMs.toFixed(2),
                                timestamp: new Date().toISOString()
                            }, 'request');
                        }
                    }
                    
                } catch (responseError) {
                    // Pattern 3: Infrastructure Error Logging for response handling errors
                    const mcpError = ErrorService.createError(
                        'request',
                        'Failed to log request response',
                        'error',
                        {
                            component: component,
                            path: req.originalUrl || req.url,
                            error: responseError.message,
                            stack: responseError.stack,
                            timestamp: new Date().toISOString()
                        }
                    );
                    MonitoringService.logError(mcpError);
                }
                
                // Call the original end method
                return originalEnd.call(this, chunk, encoding);
            };
            
            // Continue to the next middleware
            next();
            
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            // Log middleware errors for operations team
            const mcpError = ErrorService.createError(
                'request',
                'Request logger middleware error',
                'error',
                {
                    component: component,
                    path: req.originalUrl || req.url,
                    error: error.message,
                    stack: error.stack,
                    userId: resolveUserId(req),
                    sessionId: req.session?.id,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            // Log middleware errors with user context
            const userId = resolveUserId(req);
            const sessionId = req.session?.id;
            
            if (userId) {
                MonitoringService.error('Request logging failed', {
                    component: component,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'request', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Request logging failed', {
                    sessionId,
                    component: component,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'request');
            }
            
            // Continue to next middleware even if logging fails
            next();
        }
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
