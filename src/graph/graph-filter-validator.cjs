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
    pattern: /organizer\/emailAddress\/address\s+ne\s+/i,
    message: "Filter 'ne' operator not supported on organizer/emailAddress/address",
    suggestion: "Try using a different property or filter client-side"
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
  'organizer/emailAddress/address': ['eq'], // Note: 'ne' is NOT supported
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
 * @returns {object} Validation result with isValid and any error details
 */
function validateFilter(filter) {
  if (!filter || typeof filter !== 'string') {
    return { isValid: true };
  }

  // Check against known unsupported patterns
  for (const unsupported of UNSUPPORTED_FILTERS) {
    if (unsupported.pattern.test(filter)) {
      return {
        isValid: false,
        error: new GraphFilterError(
          unsupported.message,
          filter,
          unsupported.suggestion
        )
      };
    }
  }

  // More complex validation could be added here
  // For example, parsing the filter expression and validating each part

  return { isValid: true };
}

/**
 * Validates a filter and throws an error if invalid
 * @param {string} filter - OData filter expression to validate
 * @throws {GraphFilterError} If filter is invalid
 */
function validateFilterOrThrow(filter) {
  const result = validateFilter(filter);
  if (!result.isValid) {
    MonitoringService?.warn('Invalid Graph API filter expression', {
      filter,
      error: result.error.message,
      suggestion: result.error.suggestion,
      timestamp: new Date().toISOString()
    }, 'graph');
    
    throw result.error;
  }
  return true;
}

/**
 * Attempts to transform an unsupported filter into a supported one
 * @param {string} filter - Original filter expression
 * @returns {string} Transformed filter or original if no transformation is possible
 */
function transformFilter(filter) {
  if (!filter || typeof filter !== 'string') {
    return filter;
  }

  // Example transformation: organizer/emailAddress/address ne 'X' -> not(organizer/emailAddress/address eq 'X')
  // Note: This specific transformation may not work in Graph API, it's just an example
  const organizerNePattern = /(organizer\/emailAddress\/address)\s+ne\s+'([^']+)'/i;
  if (organizerNePattern.test(filter)) {
    return filter.replace(
      organizerNePattern, 
      "not($1 eq '$2')"
    );
  }

  // Add more transformations as needed

  return filter;
}

/**
 * Creates a standardized error for filter validation failures
 * @param {Error} error - Original error
 * @param {string} filter - Filter expression that failed
 * @returns {object} Standardized error object
 */
function createFilterValidationError(error, filter) {
  return ErrorService.createError(
    'graph',
    `Graph API filter validation failed: ${error.message}`,
    'error',
    {
      filter,
      suggestion: error.suggestion || 'Review Microsoft Graph API filter limitations',
      timestamp: new Date().toISOString()
    }
  );
}

/**
 * Provides documentation for supported filter operations
 * @param {string} [property] - Optional property to get specific support info
 * @returns {object} Documentation of supported filter operations
 */
function getSupportedFilterOperations(property) {
  if (property && PROPERTY_FILTER_SUPPORT[property]) {
    return {
      property,
      supportedOperators: PROPERTY_FILTER_SUPPORT[property],
      examples: generateExamples(property)
    };
  }
  
  return {
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

/**
 * Generates example filter expressions for a property
 * @param {string} property - Property to generate examples for
 * @returns {string[]} Example filter expressions
 */
function generateExamples(property) {
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
  
  return examples;
}

module.exports = {
  validateFilter,
  validateFilterOrThrow,
  transformFilter,
  createFilterValidationError,
  getSupportedFilterOperations,
  GraphFilterError
};
