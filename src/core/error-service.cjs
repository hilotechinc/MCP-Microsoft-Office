/**
 * @fileoverview New Event-Based Error Service for MCP Desktop.
 * Replaces direct monitoring service calls with event emission.
 * Maintains backward compatibility with existing error service API.
 */

const { v4: uuidv4 } = require('uuid');
// Note: MonitoringService import removed to avoid circular dependency
// Using console methods instead for logging in error service

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
function getEventService(userId = null, sessionId = null) {
  const startTime = Date.now();
  
  // Pattern 1: Development Debug Logs
  if (process.env.NODE_ENV === 'development') {
    console.debug('[ERROR-SERVICE] Getting EventService instance', {
      hasEventService: !!eventService,
      sessionId,
      timestamp: new Date().toISOString(),
      userId
    });
  }
  
  if (eventService) {
    // Pattern 2: User Activity Logs (successful operation)
    if (userId) {
      console.log(`[ERROR-SERVICE] EventService instance retrieved from cache for user ${userId}`, {
        hasEventService: !!eventService,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.log(`[ERROR-SERVICE] EventService instance retrieved from cache for session ${sessionId}`, {
        hasEventService: !!eventService,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }
    
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
    
    // Pattern 2: User Activity Logs (successful operation)
    if (userId) {
      console.log(`[ERROR-SERVICE] EventService instance loaded successfully for user ${userId}`, {
        hasEventService: !!eventService,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.log(`[ERROR-SERVICE] EventService instance loaded successfully for session ${sessionId}`, {
        hasEventService: !!eventService,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }
    
    return eventService;
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    // Use console.error to avoid circular dependency
    console.error('[ERROR-SERVICE INFRASTRUCTURE ERROR] Failed to get EventService instance', {
      error: error.message,
      stack: error.stack,
      operation: 'getEventService',
      userId,
      sessionId,
      timestamp: new Date().toISOString()
    });
    
    // Pattern 4: User Error Tracking
    if (userId) {
      console.error(`[ERROR-SERVICE USER ERROR] EventService loading failed for user ${userId}`, {
        error: error.message,
        operation: 'getEventService',
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.error(`[ERROR-SERVICE SESSION ERROR] EventService loading failed for session ${sessionId}`, {
        error: error.message,
        operation: 'getEventService',
        timestamp: new Date().toISOString()
      });
    }
    
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
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Object} sanitized context
 */
function sanitizeContext(context, userId = null, sessionId = null) {
  const startTime = Date.now();
  
  // Pattern 1: Development Debug Logs
  if (process.env.NODE_ENV === 'development') {
    console.debug('[ERROR-SERVICE] Sanitizing context data', {
      hasContext: !!context,
      contextType: typeof context,
      contextKeys: context && typeof context === 'object' ? Object.keys(context).length : 0,
      timestamp: new Date().toISOString(),
      userId,
      sessionId
    });
  }
  
  if (!context || typeof context !== 'object') {
    // Pattern 2: User Activity Logs (successful operation)
    if (userId) {
      console.log(`[ERROR-SERVICE] Context sanitization completed (no object to sanitize) for user ${userId}`, {
        contextType: typeof context,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.log(`[ERROR-SERVICE] Context sanitization completed with session (no object to sanitize) for session ${sessionId}`, {
        contextType: typeof context,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }
    
    return context;
  }
  
  try {
    const SENSITIVE = ['password', 'token', 'secret', 'accesstoken', 'refreshtoken', 'clientsecret'];
    const sanitized = {};
    let removedCount = 0;
    
    for (const key of Object.keys(context)) {
      if (SENSITIVE.includes(key.toLowerCase())) {
        removedCount++;
        continue;
      }
      sanitized[key] = context[key];
    }
    
    // Pattern 2: User Activity Logs (successful operation)
    if (userId) {
      console.log(`[ERROR-SERVICE] Context sanitization completed successfully for user ${userId}`, {
        originalKeys: Object.keys(context).length,
        sanitizedKeys: Object.keys(sanitized).length,
        removedSensitiveFields: removedCount,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.log(`[ERROR-SERVICE] Context sanitization completed successfully for session ${sessionId}`, {
        originalKeys: Object.keys(context).length,
        sanitizedKeys: Object.keys(sanitized).length,
        removedSensitiveFields: removedCount,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }
    
    return sanitized;
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    // Use console.error to avoid circular dependency
    console.error('[ERROR-SERVICE INFRASTRUCTURE ERROR] Failed to sanitize context', {
      error: error.message,
      stack: error.stack,
      operation: 'sanitizeContext',
      contextType: typeof context,
      userId,
      sessionId,
      timestamp: new Date().toISOString()
    });
    
    // Pattern 4: User Error Tracking
    if (userId) {
      console.error(`[ERROR-SERVICE USER ERROR] Context sanitization failed for user ${userId}`, {
        error: error.message,
        operation: 'sanitizeContext',
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.error(`[ERROR-SERVICE SESSION ERROR] Context sanitization failed for session ${sessionId}`, {
        error: error.message,
        operation: 'sanitizeContext',
        timestamp: new Date().toISOString()
      });
    }
    
    // Return original context as fallback
    return context;
  }
}

// Backward compatibility layer - keep but don't use internally
let loggingService = null;

/**
 * Set the logging service for backward compatibility
 * @param {Object} service - Service with logError method
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 */
function setLoggingService(service, userId = null, sessionId = null) {
  const startTime = Date.now();
  
  // Pattern 1: Development Debug Logs
  if (process.env.NODE_ENV === 'development') {
    console.debug('[ERROR-SERVICE] Setting logging service for backward compatibility', {
      hasService: !!service,
      serviceType: typeof service,
      hasLogErrorMethod: service && typeof service.logError === 'function',
      timestamp: new Date().toISOString(),
      userId,
      sessionId
    });
  }
  
  try {
    loggingService = service;
    
    // Pattern 2: User Activity Logs (successful operation)
    if (userId) {
      console.log(`[ERROR-SERVICE] Logging service set successfully for user ${userId}`, {
        hasService: !!service,
        hasLogErrorMethod: service && typeof service.logError === 'function',
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.log(`[ERROR-SERVICE] Logging service set successfully for session ${sessionId}`, {
        hasService: !!service,
        hasLogErrorMethod: service && typeof service.logError === 'function',
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }
    
    // This is kept for backward compatibility but won't be used internally
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    // Use console.error to avoid circular dependency
    console.error('[ERROR-SERVICE INFRASTRUCTURE ERROR] Failed to set logging service', {
      error: error.message,
      stack: error.stack,
      operation: 'setLoggingService',
      serviceType: typeof service,
      userId,
      sessionId,
      timestamp: new Date().toISOString()
    });
    
    // Pattern 4: User Error Tracking
    if (userId) {
      console.error(`[ERROR-SERVICE USER ERROR] Logging service setup failed for user ${userId}`, {
        error: error.message,
        operation: 'setLoggingService',
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.error(`[ERROR-SERVICE SESSION ERROR] Logging service setup failed for session ${sessionId}`, {
        error: error.message,
        operation: 'setLoggingService',
        timestamp: new Date().toISOString()
      });
    }
    
    throw error;
  }
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
  const startTime = Date.now();
  
  // Copy recursion protection from original
  if (!createError.recursionCount) createError.recursionCount = 0;
  createError.recursionCount++;
  
  // Pattern 1: Development Debug Logs (only if recursion count is 1 to avoid infinite loops)
  if (process.env.NODE_ENV === 'development' && createError.recursionCount === 1) {
    try {
      console.debug('[ERROR-SERVICE] Creating standardized error object', {
        category,
        severity,
        hasContext: !!context,
        hasTraceId: !!traceId,
        timestamp: new Date().toISOString(),
        userId,
        deviceId
      });
    } catch (debugError) {
      // Silently fail debug logging to prevent recursion
      console.warn('[ERROR SERVICE] Debug logging failed in createError:', debugError.message);
    }
  }
  
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
  
  try {
    // Create error object with same structure as original
    const errorObj = {
      id: uuidv4(),
      category,
      message,
      severity,
      context: sanitizeContext(context, userId),
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
    
    // Pattern 2: User Activity Logs (only if recursion count is 1 to avoid infinite loops)
    if (createError.recursionCount === 1) {
      try {
        if (userId) {
          console.log(`[ERROR-SERVICE] Error object created successfully for user ${userId}`, {
            errorId: errorObj.id,
            category: errorObj.category,
            severity: errorObj.severity,
            duration: Date.now() - startTime,
            timestamp: new Date().toISOString()
          });
        }
      } catch (activityError) {
        // Silently fail activity logging to prevent recursion
        console.warn('[ERROR SERVICE] Activity logging failed in createError:', activityError.message);
      }
    }
    
    // NEW: Emit events through event service instead of calling monitoring directly
    setImmediate(async () => {
      try {
        // Get the event service properly before using it
        const service = getEventService(userId);
        
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
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging (avoid recursion by using console)
    console.error('[ERROR SERVICE] Critical error in createError function:', {
      error: error.message,
      stack: error.stack,
      originalCategory: category,
      originalMessage: message,
      originalSeverity: severity,
      userId,
      deviceId,
      timestamp: new Date().toISOString()
    });
    
    // Pattern 4: User Error Tracking (avoid recursion by using console)
    if (userId) {
      console.error('[ERROR SERVICE] Error creation failed for user:', {
        userId,
        error: error.message,
        operation: 'createError',
        timestamp: new Date().toISOString()
      });
    }
    
    createError.recursionCount--;
    
    // Return a minimal error object as fallback
    return {
      id: uuidv4(),
      category: 'system',
      message: 'Error service failure',
      severity: 'error',
      context: { originalCategory: category, originalMessage: message, error: error.message },
      timestamp: new Date().toISOString(),
      isErrorServiceFailure: true,
      userId: userId || null,
      deviceId: deviceId || null
    };
  }
}

/**
 * Creates an API-friendly error response object - copied from original.
 * Only exposes safe fields, never internal details or stack traces.
 * @param {Object} error - Standardized error object (from createError)
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Object} API-safe error response
 */
function createApiError(error, userId = null, sessionId = null) {
  const startTime = Date.now();
  
  // Pattern 1: Development Debug Logs
  if (process.env.NODE_ENV === 'development') {
    console.debug('[ERROR-SERVICE] Creating API-safe error response', {
      errorId: error?.id,
      errorCategory: error?.category,
      errorSeverity: error?.severity,
      hasError: !!error,
      timestamp: new Date().toISOString(),
      userId,
      sessionId
    });
  }
  
  try {
    // Validate input error object
    if (!error || typeof error !== 'object') {
      throw new Error('Invalid error object provided to createApiError');
    }
    
    const apiError = {
      id: error.id,
      category: error.category,
      message: error.message,
      severity: error.severity,
      context: error.context,
      timestamp: error.timestamp
    };
    
    // Pattern 2: User Activity Logs (successful operation)
    if (userId) {
      console.log(`[ERROR-SERVICE] API error response created successfully for user ${userId}`, {
        errorId: error.id,
        category: error.category,
        severity: error.severity,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.log(`[ERROR-SERVICE] API error response created successfully for session ${sessionId}`, {
        errorId: error.id,
        category: error.category,
        severity: error.severity,
        duration: Date.now() - startTime,
        timestamp: new Date().toISOString()
      });
    }
    
    return apiError;
    
  } catch (err) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = createError(
      'error',
      'Failed to create API error response',
      'error',
      {
        error: err.message,
        stack: err.stack,
        operation: 'createApiError',
        originalError: error,
        userId,
        sessionId,
        timestamp: new Date().toISOString()
      }
    );
    // Pattern 3: Infrastructure Error Logging
    // Use console.error to avoid circular dependency
    console.error('[ERROR-SERVICE INFRASTRUCTURE ERROR] API error response creation failed', {
      error: err.message,
      stack: err.stack,
      operation: 'createApiError',
      originalErrorId: error?.id,
      userId,
      sessionId,
      timestamp: new Date().toISOString()
    });
    
    // Pattern 4: User Error Tracking
    if (userId) {
      console.error(`[ERROR-SERVICE USER ERROR] API error response creation failed for user ${userId}`, {
        error: err.message,
        operation: 'createApiError',
        timestamp: new Date().toISOString()
      });
    } else if (sessionId) {
      console.error(`[ERROR-SERVICE SESSION ERROR] API error response creation failed for session ${sessionId}`, {
        error: err.message,
        operation: 'createApiError',
        timestamp: new Date().toISOString()
      });
    }
    
    // Return a minimal API error as fallback
    return {
      id: error?.id || 'unknown',
      category: 'system',
      message: 'Error processing failed',
      severity: 'error',
      context: { originalError: err.message },
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = {
  CATEGORIES,
  SEVERITIES,
  createError,
  createApiError,
  setLoggingService
};