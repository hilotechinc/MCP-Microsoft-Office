/**
 * @fileoverview Standardized error handling for MCP Desktop.
 * Defines error categories, severity levels, and error creation for use across the application.
 * Uses dependency injection to avoid circular dependencies.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Error categories for classification.
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
 * Error severity levels.
 * @enum {string}
 */
const SEVERITIES = Object.freeze({
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  CRITICAL: 'critical'
});

/**
 * Removes sensitive fields from context (e.g., password, token, secret).
 * @param {Object} context
 * @returns {Object} sanitized context
 */
function sanitizeContext(context) {
  if (!context || typeof context !== 'object') return context;
  const SENSITIVE = ['password', 'token', 'secret', 'accessToken', 'refreshToken', 'clientSecret'];
  const sanitized = {};
  for (const key of Object.keys(context)) {
    if (SENSITIVE.includes(key.toLowerCase())) continue;
    sanitized[key] = context[key];
  }
  return sanitized;
}

// Service references for dependency injection
let loggingService = null;

/**
 * Set the logging service for error handling
 * @param {Object} service - Service with logError method
 */
function setLoggingService(service) {
  loggingService = service;
}

/**
 * Creates a standardized error object for MCP and logs it.
 * @param {string} category - One of CATEGORIES
 * @param {string} message - User-friendly error message
 * @param {string} severity - One of SEVERITIES
 * @param {Object} [context] - Additional error context (sanitized)
 * @param {string} [traceId] - Optional trace ID for request correlation
 * @returns {Object} Standardized error object
 */
function createError(category, message, severity, context = {}, traceId = null) {
  // Track error recursion to prevent infinite loops
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
  
  // Log error asynchronously if logging service is available
  if (loggingService && typeof loggingService.logError === 'function') {
    setImmediate(() => {
      try {
        loggingService.logError(errorObj);
      } catch (e) {
        // Fail silently if logging fails
        console.error(`[ERROR SERVICE] Failed to log error: ${e.message}`);
      }
    });
  }
  
  createError.recursionCount--;
  return errorObj;
}

/**
 * Creates an API-friendly error response object.
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
