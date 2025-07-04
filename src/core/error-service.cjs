/**
 * @fileoverview New Event-Based Error Service for MCP Desktop.
 * Replaces direct monitoring service calls with event emission.
 * Maintains backward compatibility with existing error service API.
 */

const { v4: uuidv4 } = require('uuid');

// Use lazy loading for EventService to avoid circular dependency
let eventService = null;

// Event types based on design in Task 2.2
const eventTypes = {
  ERROR: 'log:error',
  ERROR_CREATED: 'error:created'
};

/**
 * Get EventService instance with safe error handling for circular dependencies
 * @returns {Object} EventService instance or null
 */
function getEventService() {
  if (eventService) {
    return eventService;
  }
  
  try {
    // Create a proxy that will defer method calls until the real EventService is available
    const eventServiceProxy = new Proxy({}, {
      get: function(target, prop) {
        return function(...args) {
          // Try to load the real EventService if not already loaded
          if (!eventService) {
            try {
              eventService = require('./event-service.cjs');
            } catch (error) {
              console.warn(`[ERROR SERVICE] Failed to load EventService for ${prop}:`, error.message);
              return Promise.resolve(); // Return resolved promise for async methods
            }
          }
          
          // If the method exists on the real EventService, call it
          if (eventService && typeof eventService[prop] === 'function') {
            return eventService[prop](...args);
          }
          
          console.warn(`[ERROR SERVICE] EventService.${prop} is not a function`);
          return Promise.resolve(); // Return resolved promise for async methods
        };
      }
    });
    
    // Try to load the real EventService
    eventService = require('./event-service.cjs');
    return eventService;
  } catch (error) {
    console.warn('[ERROR SERVICE] EventService not available:', error.message);
    return null;
  }
}

/**
 * Error categories for classification - copied from original.
 * @enum {string}
 */
const CATEGORIES = Object.freeze({
  AUTH: 'auth',
  GRAPH: 'graph',
  API: 'api',
  DATABASE: 'database',
  MODULE: 'module',
  NLU: 'nlu',
  SYSTEM: 'system'
});

/**
 * Error severity levels - copied from original.
 * @enum {string}
 */
const SEVERITIES = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
});

/**
 * Removes sensitive fields from context - copied from original.
 * @param {Object} context
 * @returns {Object} sanitized context
 */
function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return context;
  const SENSITIVE = ['password', 'token', 'secret', 'accesstoken', 'refreshtoken', 'clientsecret'];
  const sanitized = {};
  for (const key of Object.keys(context)) {
    if (SENSITIVE.includes(key.toLowerCase())) continue;
    sanitized[key] = context[key];
  }
  return sanitized;
}

// Backward compatibility layer - keep but don't use internally
let loggingService = null;

/**
 * Set the logging service for backward compatibility
 * @param {Object} service - Service with logError method
 */
function setLoggingService(service) {
  loggingService = service;
  // This is kept for backward compatibility but won't be used internally
}

/**
 * Creates a standardized error object and emits events instead of direct logging.
 * Maintains same signature as original for compatibility.
 * @param {string} category - One of CATEGORIES
 * @param {string} message - User-friendly error message
 * @param {string} severity - One of SEVERITIES
 * @param {Object} [context] - Additional error context (sanitized)
 * @param {string} [traceId] - Optional trace ID for request correlation
 * @param {string} [userId] - User ID for multi-user context
 * @param {string} [deviceId] - Device ID for multi-user context
 * @returns {Object} Standardized error object
 */
function createError(category, message, severity, context = {}, traceId = null, userId = null, deviceId = null) {
  // Copy recursion protection from original
  if (!createError.recursionCount) createError.recursionCount = 0;
  createError.recursionCount++;
  
  // Circuit breaker to prevent infinite error loops
  if (createError.recursionCount > 3) {
    console.error(`[ERROR SERVICE] Error recursion limit reached (${createError.recursionCount}), stopping error chain: ${category} - ${message}`);
    createError.recursionCount--;
    return { 
      id: uuidv4(),
      category: 'system',
      message: 'Error recursion limit reached',
      severity: 'error',
      context: { originalCategory: category, originalMessage: message },
      timestamp: new Date().toISOString(),
      isRecursionLimitError: true,
      userId: userId || null,
      deviceId: deviceId || null
    };
  }
  
  // Create error object with same structure as original
  const errorObj = {
    id: uuidv4(),
    category,
    message,
    severity,
    context: sanitizeContext(context),
    timestamp: new Date().toISOString()
  };
  
  // Add trace ID if provided
  if (traceId) {
    errorObj.traceId = traceId;
  }
  
  // Add multi-user context for isolation and monitoring
  if (userId) {
    errorObj.userId = userId;
  }
  
  if (deviceId) {
    errorObj.deviceId = deviceId;
  }
  
  // NEW: Emit events through event service instead of calling monitoring directly
  setImmediate(async () => {
    try {
      // Get the event service properly before using it
      const service = getEventService();
      
      // Only emit events if we have a valid event service
      if (service) {
        // Emit error created event for error tracking
        await service.emit(eventTypes.ERROR_CREATED, errorObj);
        
        // Emit log error event for monitoring service to catch
        await service.emit(eventTypes.ERROR, {
          id: errorObj.id,
          level: 'error',
          category: errorObj.category,
          message: errorObj.message,
          context: errorObj.context,
          timestamp: errorObj.timestamp,
          traceId: errorObj.traceId,
          severity: errorObj.severity,
          source: 'error-service',
          userId: errorObj.userId,
          deviceId: errorObj.deviceId
        });
      } else if (loggingService && typeof loggingService.logError === 'function') {
        // Fallback to direct logging service if event service is not available
        loggingService.logError(errorObj);
      }
    } catch (e) {
      // Fail silently if event emission fails
      console.error(`[ERROR SERVICE] Failed to emit error events: ${e.message}`);
      
      // Try fallback to direct logging if available
      if (loggingService && typeof loggingService.logError === 'function') {
        try {
          loggingService.logError(errorObj);
        } catch (logError) {
          // Last resort - log to console
          console.error('[ERROR SERVICE] Both event emission and direct logging failed:', e.message, logError.message);
        }
      }
    }
  });
  
  createError.recursionCount--;
  return errorObj;
}

/**
 * Creates an API-friendly error response object - copied from original.
 * Only exposes safe fields, never internal details or stack traces.
 * @param {Object} error - Standardized error object (from createError)
 * @returns {Object} API-safe error response
 */
function createApiError(error) {
  return {
    id: error.id,
    category: error.category,
    message: error.message,
    severity: error.severity,
    context: error.context,
    timestamp: error.timestamp
  };
}

module.exports = {
  CATEGORIES,
  SEVERITIES,
  createError,
  createApiError,
  setLoggingService
};