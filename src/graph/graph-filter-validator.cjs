/**
 * @fileoverview Microsoft Graph API Filter Validator
 * Validates OData filter expressions against known Microsoft Graph API limitations.
 * Ensures filters are compatible with Graph API before sending requests.
 */

const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

/**
 * Known unsupported filter patterns in Microsoft Graph API
 * Each entry contains:
 * - pattern: RegExp to match unsupported filter syntax
 * - message: User-friendly error message
 * - suggestion: Recommended alternative approach
 */
const UNSUPPORTED_FILTERS = [
  {
    // Microsoft Graph API does NOT support organizer email ADDRESS filtering
    pattern: /organizer\/emailAddress\/address/i,
    message: "Microsoft Graph API does not support organizer/emailAddress/address filters (always returns HTTP 501)",
    suggestion: "Use organizer/emailAddress/name eq 'Display Name' instead, or filter client-side after retrieving events"
  },
  {
    pattern: /attendees\/emailAddress\/address\s+ne\s+/i,
    message: "Filter 'ne' operator not supported on attendees/emailAddress/address",
    suggestion: "Try using 'eq' operator or filter client-side"
  },
  {
    // Complex lambda expressions often have limitations
    pattern: /attendees\/any\(.*ne\s+/i,
    message: "Complex 'ne' expressions within lambda functions may not be supported",
    suggestion: "Use simpler expressions with 'eq' operator"
  }
];

/**
 * Properties known to have limited filter support in Microsoft Graph API
 * Maps property paths to supported operators
 */
const PROPERTY_FILTER_SUPPORT = {
  // Calendar event properties
  'subject': ['eq', 'ne', 'contains', 'startswith', 'endswith'],
  'bodyPreview': ['contains'],
  'importance': ['eq', 'ne'],
  'sensitivity': ['eq', 'ne'],
  'showAs': ['eq', 'ne'],
  'isAllDay': ['eq', 'ne'],
  'isCancelled': ['eq', 'ne'],
  'isDraft': ['eq', 'ne'],
  'isOrganizer': ['eq', 'ne'],
  'start/dateTime': ['eq', 'ne', 'gt', 'ge', 'lt', 'le'],
  'end/dateTime': ['eq', 'ne', 'gt', 'ge', 'lt', 'le'],
  'location/displayName': ['eq', 'contains'],
  'organizer/emailAddress/name': ['eq'], // Supported - filter by organizer display name
  // 'organizer/emailAddress/address': [], // NOT SUPPORTED - Microsoft Graph always returns HTTP 501
  'attendees/emailAddress/address': ['eq'] // Note: 'ne' is NOT supported
};

/**
 * Error class for Graph filter validation failures
 */
class GraphFilterError extends Error {
  constructor(message, filter, suggestion) {
    super(message);
    this.name = 'GraphFilterError';
    this.filter = filter;
    this.suggestion = suggestion;
  }
}

/**
 * Validates a Microsoft Graph API filter expression
 * @param {string} filter - OData filter expression to validate
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {object} Validation result with isValid and any error details
 */
function validateFilter(filter, userId, sessionId) {
  const startTime = new Date().toISOString();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Validating Graph API filter expression', {
        filter: filter ? filter.substring(0, 100) + (filter.length > 100 ? '...' : '') : null,
        userId: userId || 'anonymous',
        sessionId: sessionId || 'no-session',
        timestamp: startTime
      }, 'graph');
    }

    if (!filter || typeof filter !== 'string') {
      // Pattern 2: User Activity Logs - successful validation
      if (userId) {
        MonitoringService.info('Filter validation completed - empty filter allowed', {
          result: 'valid',
          timestamp: new Date().toISOString()
        }, 'graph', null, userId);
      } else if (sessionId) {
        MonitoringService.info('Filter validation completed - empty filter allowed', {
          sessionId,
          result: 'valid',
          timestamp: new Date().toISOString()
        }, 'graph');
      }
      return { isValid: true };
    }

    // Check against known unsupported patterns
    for (const unsupported of UNSUPPORTED_FILTERS) {
      if (unsupported.pattern.test(filter)) {
        const validationError = new GraphFilterError(
          unsupported.message,
          filter,
          unsupported.suggestion
        );
        
        // Pattern 4: User Error Tracking
        if (userId) {
          MonitoringService.error('Filter validation failed - unsupported pattern', {
            filter: filter.substring(0, 100) + (filter.length > 100 ? '...' : ''),
            error: unsupported.message,
            suggestion: unsupported.suggestion,
            timestamp: new Date().toISOString()
          }, 'graph', null, userId);
        } else if (sessionId) {
          MonitoringService.error('Filter validation failed - unsupported pattern', {
            sessionId,
            filter: filter.substring(0, 100) + (filter.length > 100 ? '...' : ''),
            error: unsupported.message,
            suggestion: unsupported.suggestion,
            timestamp: new Date().toISOString()
          }, 'graph');
        }
        
        return {
          isValid: false,
          error: validationError
        };
      }
    }

    // Pattern 2: User Activity Logs - successful validation
    if (userId) {
      MonitoringService.info('Filter validation completed successfully', {
        filterLength: filter.length,
        result: 'valid',
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.info('Filter validation completed successfully', {
        sessionId,
        filterLength: filter.length,
        result: 'valid',
        timestamp: new Date().toISOString()
      }, 'graph');
    }

    return { isValid: true };
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'graph',
      `Graph filter validation failed: ${error.message}`,
      'error',
      {
        filter: filter ? filter.substring(0, 100) + (filter.length > 100 ? '...' : '') : null,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (userId) {
      MonitoringService.error('Filter validation system error', {
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.error('Filter validation system error', {
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    throw error;
  }
}

/**
 * Validates a filter and throws an error if invalid
 * @param {string} filter - OData filter expression to validate
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @throws {GraphFilterError} If filter is invalid
 */
function validateFilterOrThrow(filter, userId, sessionId) {
  const startTime = new Date().toISOString();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Validating Graph API filter with throw on error', {
        filter: filter ? filter.substring(0, 100) + (filter.length > 100 ? '...' : '') : null,
        userId: userId || 'anonymous',
        sessionId: sessionId || 'no-session',
        timestamp: startTime
      }, 'graph');
    }

    const result = validateFilter(filter, userId, sessionId);
    if (!result.isValid) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'graph',
        `Graph filter validation failed: ${result.error.message}`,
        'error',
        {
          filter,
          error: result.error.message,
          suggestion: result.error.suggestion,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService.logError(mcpError);
      
      throw result.error;
    }

    // Pattern 2: User Activity Logs - successful validation
    if (userId) {
      MonitoringService.info('Filter validation with throw completed successfully', {
        result: 'valid',
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.info('Filter validation with throw completed successfully', {
        sessionId,
        result: 'valid',
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    return true;
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'graph',
      `Graph filter validation with throw failed: ${error.message}`,
      'error',
      {
        filter,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (userId) {
      MonitoringService.error('Filter validation with throw failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.error('Filter validation with throw failed', {
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    throw error;
  }
}

/**
 * Attempts to transform an unsupported filter into a supported one
 * @param {string} filter - Original filter expression
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {string} Transformed filter or original if no transformation is possible
 */
function transformFilter(filter, userId, sessionId) {
  const startTime = new Date().toISOString();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Attempting to transform Graph API filter', {
        filter: filter ? filter.substring(0, 100) + (filter.length > 100 ? '...' : '') : null,
        userId: userId || 'anonymous',
        sessionId: sessionId || 'no-session',
        timestamp: startTime
      }, 'graph');
    }

    if (!filter || typeof filter !== 'string') {
      // Pattern 2: User Activity Logs - no transformation needed
      if (userId) {
        MonitoringService.info('Filter transformation completed - no change needed', {
          result: 'unchanged',
          timestamp: new Date().toISOString()
        }, 'graph', null, userId);
      } else if (sessionId) {
        MonitoringService.info('Filter transformation completed - no change needed', {
          sessionId,
          result: 'unchanged',
          timestamp: new Date().toISOString()
        }, 'graph');
      }
      return filter;
    }

    const originalFilter = filter;

    // Example transformation: organizer/emailAddress/address ne 'X' -> not(organizer/emailAddress/address eq 'X')
    // Note: This specific transformation may not work in Graph API, it's just an example
    const organizerNePattern = /(organizer\/emailAddress\/address)\s+ne\s+'([^']+)'/i;
    if (organizerNePattern.test(filter)) {
      filter = filter.replace(
        organizerNePattern, 
        "not($1 eq '$2')"
      );
    }

    // Add more transformations as needed

    const wasTransformed = originalFilter !== filter;

    // Pattern 2: User Activity Logs - transformation result
    if (userId) {
      MonitoringService.info('Filter transformation completed', {
        wasTransformed,
        originalLength: originalFilter.length,
        transformedLength: filter.length,
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.info('Filter transformation completed', {
        sessionId,
        wasTransformed,
        originalLength: originalFilter.length,
        transformedLength: filter.length,
        timestamp: new Date().toISOString()
      }, 'graph');
    }

    return filter;
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'graph',
      `Graph filter transformation failed: ${error.message}`,
      'error',
      {
        filter,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (userId) {
      MonitoringService.error('Filter transformation failed', {
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.error('Filter transformation failed', {
        sessionId,
        error: error.message,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    // Return original filter on error
    return filter;
  }
}

/**
 * Creates a standardized error for filter validation failures
 * @param {Error} error - Original error
 * @param {string} filter - Filter expression that failed
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {object} Standardized error object
 */
function createFilterValidationError(error, filter, userId, sessionId) {
  const startTime = new Date().toISOString();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Creating standardized filter validation error', {
        errorType: error.name,
        filter: filter ? filter.substring(0, 100) + (filter.length > 100 ? '...' : '') : null,
        userId: userId || 'anonymous',
        sessionId: sessionId || 'no-session',
        timestamp: startTime
      }, 'graph');
    }

    const standardizedError = ErrorService.createError(
      'graph',
      `Graph API filter validation failed: ${error.message}`,
      'error',
      {
        filter,
        suggestion: error.suggestion || 'Review Microsoft Graph API filter limitations',
        originalError: error.message,
        timestamp: new Date().toISOString()
      }
    );

    // Pattern 2: User Activity Logs - error created
    if (userId) {
      MonitoringService.info('Filter validation error created', {
        errorType: error.name,
        hasFilter: !!filter,
        hasSuggestion: !!(error.suggestion),
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.info('Filter validation error created', {
        sessionId,
        errorType: error.name,
        hasFilter: !!filter,
        hasSuggestion: !!(error.suggestion),
        timestamp: new Date().toISOString()
      }, 'graph');
    }

    return standardizedError;
    
  } catch (createError) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'graph',
      `Failed to create filter validation error: ${createError.message}`,
      'error',
      {
        originalError: error.message,
        filter,
        createError: createError.message,
        stack: createError.stack,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (userId) {
      MonitoringService.error('Failed to create filter validation error', {
        error: createError.message,
        originalError: error.message,
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.error('Failed to create filter validation error', {
        sessionId,
        error: createError.message,
        originalError: error.message,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    // Return a basic error object as fallback
    return {
      category: 'graph',
      message: `Graph API filter validation failed: ${error.message}`,
      severity: 'error',
      context: {
        filter,
        suggestion: error.suggestion || 'Review Microsoft Graph API filter limitations',
        timestamp: new Date().toISOString()
      }
    };
  }
}

/**
 * Provides documentation for supported filter operations
 * @param {string} [property] - Optional property to get specific support info
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {object} Documentation of supported filter operations
 */
function getSupportedFilterOperations(property, userId, sessionId) {
  const startTime = new Date().toISOString();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Retrieving supported filter operations documentation', {
        property: property || 'all',
        userId: userId || 'anonymous',
        sessionId: sessionId || 'no-session',
        timestamp: startTime
      }, 'graph');
    }

    let result;
    
    if (property && PROPERTY_FILTER_SUPPORT[property]) {
      result = {
        property,
        supportedOperators: PROPERTY_FILTER_SUPPORT[property],
        examples: generateExamples(property, userId, sessionId)
      };
    } else {
      result = {
        supportedProperties: Object.keys(PROPERTY_FILTER_SUPPORT),
        generalGuidelines: [
          "Use 'eq' operator when possible as it has the widest support",
          "Complex properties like organizer/emailAddress/address have limited operator support",
          "Lambda expressions (any/all) have significant limitations",
          "Date/time comparisons are well-supported with standard operators",
          "Text searching works best with contains(), startswith(), endswith()"
        ],
        documentation: "https://learn.microsoft.com/en-us/graph/query-parameters?tabs=http"
      };
    }

    // Pattern 2: User Activity Logs - documentation retrieved
    if (userId) {
      MonitoringService.info('Filter operations documentation retrieved', {
        requestedProperty: property || 'all',
        propertiesCount: property ? 1 : Object.keys(PROPERTY_FILTER_SUPPORT).length,
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.info('Filter operations documentation retrieved', {
        sessionId,
        requestedProperty: property || 'all',
        propertiesCount: property ? 1 : Object.keys(PROPERTY_FILTER_SUPPORT).length,
        timestamp: new Date().toISOString()
      }, 'graph');
    }

    return result;
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'graph',
      `Failed to retrieve filter operations documentation: ${error.message}`,
      'error',
      {
        property,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (userId) {
      MonitoringService.error('Failed to retrieve filter operations documentation', {
        error: error.message,
        requestedProperty: property || 'all',
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.error('Failed to retrieve filter operations documentation', {
        sessionId,
        error: error.message,
        requestedProperty: property || 'all',
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    // Return basic documentation as fallback
    return {
      error: 'Failed to retrieve documentation',
      fallback: {
        generalGuidelines: [
          "Use 'eq' operator when possible as it has the widest support",
          "Review Microsoft Graph API filter limitations"
        ],
        documentation: "https://learn.microsoft.com/en-us/graph/query-parameters?tabs=http"
      }
    };
  }
}

/**
 * Generates example filter expressions for a property
 * @param {string} property - Property to generate examples for
 * @param {string} userId - User ID for logging context
 * @param {string} sessionId - Session ID for logging context
 * @returns {string[]} Example filter expressions
 */
function generateExamples(property, userId, sessionId) {
  const startTime = new Date().toISOString();
  
  try {
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('Generating filter examples for property', {
        property,
        userId: userId || 'anonymous',
        sessionId: sessionId || 'no-session',
        timestamp: startTime
      }, 'graph');
    }

    const examples = [];
    const operators = PROPERTY_FILTER_SUPPORT[property] || [];
    
    if (operators.includes('eq')) {
      if (property.includes('dateTime')) {
        examples.push(`${property} eq '2025-06-01T00:00:00Z'`);
      } else if (property.includes('address')) {
        examples.push(`${property} eq 'user@example.com'`);
      } else if (property === 'isAllDay' || property === 'isCancelled') {
        examples.push(`${property} eq true`);
      } else {
        examples.push(`${property} eq 'value'`);
      }
    }
    
    if (operators.includes('contains')) {
      examples.push(`contains(${property}, 'searchterm')`);
    }
    
    if (operators.includes('ge') && property.includes('dateTime')) {
      examples.push(`${property} ge '2025-06-01T00:00:00Z'`);
    }

    // Pattern 2: User Activity Logs - examples generated
    if (userId) {
      MonitoringService.info('Filter examples generated successfully', {
        property,
        examplesCount: examples.length,
        supportedOperators: operators.length,
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.info('Filter examples generated successfully', {
        sessionId,
        property,
        examplesCount: examples.length,
        supportedOperators: operators.length,
        timestamp: new Date().toISOString()
      }, 'graph');
    }

    return examples;
    
  } catch (error) {
    // Pattern 3: Infrastructure Error Logging
    const mcpError = ErrorService.createError(
      'graph',
      `Failed to generate filter examples: ${error.message}`,
      'error',
      {
        property,
        error: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    );
    MonitoringService.logError(mcpError);
    
    // Pattern 4: User Error Tracking
    if (userId) {
      MonitoringService.error('Failed to generate filter examples', {
        error: error.message,
        property,
        timestamp: new Date().toISOString()
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.error('Failed to generate filter examples', {
        sessionId,
        error: error.message,
        property,
        timestamp: new Date().toISOString()
      }, 'graph');
    }
    
    // Return empty array as fallback
    return [];
  }
}

module.exports = {
  validateFilter,
  validateFilterOrThrow,
  transformFilter,
  createFilterValidationError,
  getSupportedFilterOperations,
  GraphFilterError
};
