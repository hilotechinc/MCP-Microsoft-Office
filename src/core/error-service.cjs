/**
 * @fileoverview New Event-Based Error Service for MCP Desktop.
 * Replaces direct monitoring service calls with event emission.
 * Maintains backward compatibility with existing error service API.
 */

const { v4: uuidv4 } = require('uuid');

// Import event service for event-based architecture
const eventService = require('./event-service.cjs');

// Event types based on design in Task 2.2
const eventTypes = {
  ERROR: 'log:error',
  ERROR_CREATED: 'error:created'
};

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
 * @returns {Object} Standardized error object
 */
function createError(category, message, severity, context = {}, traceId = null) {
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
      isRecursionLimitError: true
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
  
  // NEW: Emit events through event service instead of calling monitoring directly
  setImmediate(async () => {
    try {
      // Emit error created event for error tracking
      await eventService.emit(eventTypes.ERROR_CREATED, errorObj);
      
      // Emit log error event for monitoring service to catch
      await eventService.emit(eventTypes.ERROR, {
        id: errorObj.id,
        level: 'error',
        category: errorObj.category,
        message: errorObj.message,
        context: errorObj.context,
        timestamp: errorObj.timestamp,
        traceId: errorObj.traceId,
        severity: errorObj.severity,
        source: 'error-service'
      });
    } catch (e) {
      // Fail silently if event emission fails
      console.error(`[ERROR SERVICE] Failed to emit error events: ${e.message}`);
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