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
 */
function sanitizeContext(context) {
  if (!context) return context;
  const clone = { ...context };
  ['password', 'token', 'secret', 'apiKey'].forEach((key) => {
    if (clone[key]) clone[key] = '[REDACTED]';
  });
  return clone;
}

/**
 * Creates a standardized error object for logging and reporting.
 * @param {string} category
 * @param {string} message
 * @param {string} severity
 * @param {object} [context]
 * @returns {object}
 */
function createError(category, message, severity, context) {
  const error = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    category,
    message,
    severity,
    context: sanitizeContext(context)
  };
  if (MonitoringService && typeof MonitoringService.logError === 'function') {
    MonitoringService.logError(error);
  }
  return error;
}

module.exports = {
  createError,
  CATEGORIES,
  SEVERITIES
};
