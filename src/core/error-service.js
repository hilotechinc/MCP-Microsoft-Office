/**
 * @fileoverview Standardized error handling for MCP Desktop.
 * Defines error categories, severity levels, and error creation for use across the application.
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

/**
 * Creates a standardized error object for MCP.
 * @param {string} category - One of CATEGORIES
 * @param {string} message - User-friendly error message
 * @param {string} severity - One of SEVERITIES
 * @param {Object} [context] - Additional error context (sanitized)
 * @returns {Object} Standardized error object
 */
function createError(category, message, severity, context = {}) {
  return {
    id: uuidv4(),
    category,
    message,
    severity,
    context: sanitizeContext(context),
    timestamp: new Date().toISOString()
  };
}

module.exports = {
  CATEGORIES,
  SEVERITIES,
  createError
};
