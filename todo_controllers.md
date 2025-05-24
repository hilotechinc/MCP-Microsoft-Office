# Controller Standardization: Event-Based Logging Implementation

## Overview

This document outlines the standardization of all API controllers in `src/api/controllers/` to properly implement the event-based logging architecture using `MonitoringService` and `ErrorService`. Currently, only the `calendar-controller.js` properly implements the architecture.

## Current State Analysis

### ✅ **COMPLIANT**: calendar-controller.js, mail-controller.js, people-controller.cjs, query-controller.js
- Perfect implementation of logging architecture
- Proper imports and usage patterns
- Environment-aware logging
- Performance metrics tracking
- Comprehensive Joi validation schemas
- Structured error handling with ErrorService
- **✅ TESTED**: Server starts successfully with `npm run dev`

### ⚠️ **PARTIALLY COMPLIANT**: files-controller.js
- Has proper imports but inconsistent patterns
- Needs alignment with standard approach

## Implementation Standards

### Required Imports
```javascript
const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');
```

### Error Service Usage
```javascript
// Create standardized errors
const error = ErrorService.createError(
    ErrorService.CATEGORIES.API,      // Use predefined categories
    'User-friendly error message',     // Clear, descriptive message
    ErrorService.SEVERITIES.ERROR,    // Appropriate severity level
    {                                  // Context object with relevant data
        endpoint: req.path,
        method: req.method,
        details: validationError.details
    },
    req.traceId                       // Optional trace ID for correlation
);

// Available categories: AUTH, GRAPH, API, DATABASE, MODULE, NLU, SYSTEM
// Available severities: INFO, WARNING, ERROR, CRITICAL
```

### Monitoring Service Usage
```javascript
// Request logging
MonitoringService.info(`Processing ${req.method} ${req.path}`, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
}, 'api');

// Success logging
MonitoringService.info('Operation completed successfully', {
    operation: 'sendMail',
    duration: `${Date.now() - startTime}ms`,
    resultCount: messages.length
}, 'mail');

// Error logging
MonitoringService.error('Operation failed', {
    operation: 'getMail',
    error: error.message,
    stack: error.stack
}, 'mail');

// Performance metrics
MonitoringService.trackMetric('mail.sendMail.duration', duration, {
    recipientCount: recipients.length,
    hasAttachments: !!attachments,
    success: true
});
```

### Standard Controller Pattern
```javascript
/**
 * @fileoverview [Controller Description]
 */

const Joi = require('joi');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

/**
 * Helper function to validate request and log validation errors
 */
const validateAndLog = (req, schema, endpoint, additionalContext = {}) => {
    const result = schema.validate(req.body);
    
    if (result.error) {
        const validationError = ErrorService.createError(
            ErrorService.CATEGORIES.API,
            `${endpoint} validation error`,
            ErrorService.SEVERITIES.WARNING,
            { 
                details: result.error.details,
                endpoint,
                ...additionalContext
            }
        );
        // Note: Error service automatically handles logging via events
    }
    
    return result;
};

/**
 * Factory for [module] controller with dependency injection
 */
module.exports = ({ [module]Module }) => ({
    async [operation](req, res) {
        try {
            const startTime = Date.now();
            const endpoint = req.path;
            
            // Log request
            MonitoringService.info(`Processing ${req.method} ${endpoint}`, {
                method: req.method,
                path: endpoint,
                query: req.query
            }, '[category]');
            
            // Validation
            const { error, value } = validateAndLog(req, schema, '[operation]', { endpoint });
            if (error) {
                return res.status(400).json({ 
                    error: 'Invalid request', 
                    details: error.details 
                });
            }
            
            // Business logic with module
            let result;
            try {
                result = await [module]Module.[operation](value);
                MonitoringService.info('[Operation] completed successfully', {
                    operation: '[operation]',
                    resultId: result.id
                }, '[category]');
            } catch (moduleError) {
                const error = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Error calling [module] module',
                    ErrorService.SEVERITIES.ERROR,
                    {
                        operation: '[operation]',
                        error: moduleError.message,
                        stack: moduleError.stack
                    }
                );
                throw error;
            }
            
            // Track performance
            const duration = Date.now() - startTime;
            MonitoringService.trackMetric('[category].[operation].duration', duration, {
                success: true,
                resultId: result.id
            });
            
            res.json(result);
        } catch (err) {
            const error = ErrorService.createError(
                ErrorService.CATEGORIES.API,
                'Error processing [operation] request',
                ErrorService.SEVERITIES.ERROR,
                {
                    stack: err.stack,
                    endpoint: req.path,
                    method: req.method,
                    error: err.message
                }
            );
            
            // Track error metrics
            MonitoringService.trackMetric('[category].[operation].error', 1, {
                errorId: error.id,
                reason: err.message
            });
            
            res.status(500).json({ error: 'Internal error', message: err.message });
        }
    }
});
```

## Task List

### Phase 1: mail-controller.js ✅ **COMPLETED**

- [x] **1.1** Add proper imports
- [x] **1.2** Replace console.log statements with MonitoringService calls
- [x] **1.3** Replace console.error with ErrorService
- [x] **1.4** Add performance tracking
- [x] **1.5** Add request logging for each endpoint
- [x] **1.6** Implement validateAndLog helper function
- [x] **1.7** Add proper Joi validation schemas for all endpoints

**Status**: ✅ FULLY COMPLIANT - All tasks completed successfully

### Phase 2: people-controller.cjs ✅ **COMPLETED**

- [x] **2.1** Add proper imports
- [x] **2.2** Replace console.error with ErrorService
- [x] **2.3** Add MonitoringService logging for all operations
- [x] **2.4** Add performance metrics for all methods
- [x] **2.5** Add request logging for all endpoints
- [x] **2.6** Implement proper validation with Joi schemas

**Status**: ✅ FULLY COMPLIANT - All tasks completed successfully

## ✅ TESTING STATUS

### Server Startup Test (npm run dev)
- ✅ **PASSED**: Server starts successfully without errors
- ✅ **PASSED**: All modules initialize correctly (Mail, Calendar, Files, People)
- ✅ **PASSED**: IPC handlers load successfully
- ✅ **PASSED**: Electron renderer starts successfully
- ✅ **PASSED**: No module import errors
- ✅ **FIXED**: Corrected routes.cjs file extension mismatches

### Overall Progress
- **3 out of 5 controllers** are now fully compliant **(60% complete)**
- **2 controllers remaining**: files-controller.js, log-controller.cjs
- **Next Priority**: Phase 4 - files-controller.js alignment

### Phase 3: query-controller.js ✅ **COMPLETED**

- [x] **3.1** Add MonitoringService import
- [x] **3.2** Replace console.log with MonitoringService  
- [x] **3.3** Replace console.error with ErrorService
- [x] **3.4** Add performance tracking
- [x] **3.5** Add request logging
- [x] **3.6** Enhance error handling with proper ErrorService usage

**Status**: ✅ FULLY COMPLIANT - All tasks completed successfully

### Phase 4: files-controller.js ⚠️ **MEDIUM PRIORITY**

- [ ] **4.1** Align with standard patterns (already has proper imports)

- [ ] **4.2** Review and standardize logging categories

- [ ] **4.3** Ensure consistent error handling approach

- [ ] **4.4** Optimize logging verbosity for production

### Phase 5: log-controller.cjs ✅ **REVIEW ONLY**

- [ ] **5.1** Verify compliance with logging standards

- [ ] **5.2** Ensure no console.log usage

- [ ] **5.3** Confirm proper error handling

## Environment Behavior Requirements

### Development Mode (`npm run dev`)
- **Full Transparency**: All log levels (debug, info, warn, error)
- **Detailed Context**: Rich context objects with request details
- **Performance Metrics**: Track all operations
- **Mock Data Logging**: Log when falling back to mock data

### Production Mode (`npm run`)
- **Errors Only**: Only error-level logs
- **Minimal Context**: Essential error information only
- **Critical Metrics**: Only error and performance metrics
- **Silent Success**: No console output for successful operations

## Logging Categories by Controller

| Controller | Primary Category | Secondary Categories |
|------------|------------------|---------------------|
| mail-controller.js | `'mail'` | `'api'`, `'graph'` |
| calendar-controller.js | `'calendar'` | `'api'` |
| files-controller.js | `'files'` | `'api'`, `'graph'` |
| people-controller.cjs | `'people'` | `'api'`, `'graph'` |
| query-controller.js | `'nlu'` | `'api'` |
| log-controller.cjs | `'api'` | `'system'` |

## Testing Checklist

After implementation, verify each controller:

- [ ] **No console.log/console.error statements remain**
- [ ] **All methods have request logging**
- [ ] **All methods have performance tracking**
- [ ] **Error handling uses ErrorService.createError()**
- [ ] **Validation uses validateAndLog helper**
- [ ] **Appropriate logging categories are used**
- [ ] **Mock data fallbacks are properly logged**
- [ ] **Development mode shows full transparency**
- [ ] **Production mode only shows errors**

## Implementation Order

1. **mail-controller.js** (Most critical, highest usage)
2. **people-controller.cjs** (Simple, good test case)
3. **query-controller.js** (NLU integration)
4. **files-controller.js** (Alignment and optimization)
5. **log-controller.cjs** (Verification only)

## Success Criteria

✅ **All controllers:**
- Import and use MonitoringService and ErrorService correctly
- Follow consistent error handling patterns
- Implement environment-aware logging
- Track performance metrics
- Use appropriate logging categories
- Provide 100% transparency in development mode
- Maintain minimal noise in production mode

This standardization will ensure our documentation accurately reflects the implementation and provides a consistent, professional logging experience across all API endpoints.