/**
 * @fileoverview Standardized error handling for MCP Desktop.
 * Defines error categories, severity levels, and error creation for use across the application.
 */

const { v4: uuidv4 } = require('uuid');
let MonitoringService;
try {
  MonitoringService = require('./monitoring-service');
} catch (e) {
  // In test environments or if not available, skip logging
  MonitoringService = null;
}

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

/**
 * Creates a standardized error object for MCP and logs it.
 * @param {string} category - One of CATEGORIES
 * @param {string} message - User-friendly error message
 * @param {string} severity - One of SEVERITIES
 * @param {Object} [context] - Additional error context (sanitized)
 * @returns {Object} Standardized error object
 */
function createError(category, message, severity, context = {}) {
  const errorObj = {
    id: uuidv4(),
    category,
    message,
    severity,
    context: sanitizeContext(context),
    timestamp: new Date().toISOString()
  };
  // Log error asynchronously if MonitoringService is available
  if (MonitoringService && typeof MonitoringService.logError === 'function') {
    setImmediate(() => {
      try {
        MonitoringService.logError(errorObj);
      } catch (e) {
        // Fail silently if logging fails
      }
    });
  }
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
  createApiError
};
