# MCP Microsoft Office: Event-Based Logging Architecture Implementation Plan

This task list outlines the steps needed to implement an event-based logging architecture using the event service to fix memory issues and improve the logging system.

## Phase 1: Analysis and Planning

### 1. Analyze Existing Services

- [ ] 1.1 Analyze `monitoring-service.cjs` to identify all public methods and event patterns
  ```javascript
  // Create a table of all exported functions and their parameters
  // Example output:
  /*
  | Function     | Parameters                                     | Return Value | Description                    |
  |--------------|------------------------------------------------|-------------|--------------------------------|
  | logError     | error: Object                                  | void        | Logs an error event            |
  | error        | message, context, category, traceId            | void        | Logs an error message          |
  | info         | message, context, category, traceId            | void        | Logs an info message           |
  | ...          | ...                                            | ...         | ...                            |
  */
  ```

- [ ] 1.2 Analyze `error-service.cjs` to identify all error creation patterns and dependencies
  ```javascript
  // Document all error categories, severity levels, and the createError function signature
  // Example: createError(category, message, severity, context, traceId)
  ```

- [ ] 1.3 Analyze `log-controller.cjs` to identify API endpoints and data structures
  ```javascript
  // Document all API endpoints, their parameters, and return values
  // Example: GET /api/v1/logs?category=api&level=error&limit=100
  ```

- [ ] 1.4 Analyze `event-service.cjs` to understand its capabilities and limitations
  ```javascript
  // Document the event service API and how it handles subscriptions, filtering, etc.
  ```

### 2. Design Event Schema

- [ ] 2.1 Based on analysis, design a consistent event schema for all log events
  ```javascript
  // Example event schema
  const logEventSchema = {
    id: 'string', // Unique ID for this log entry
    timestamp: 'string', // ISO timestamp
    level: 'string', // 'error', 'info', 'warn', 'debug'
    category: 'string', // 'api', 'graph', 'auth', etc.
    message: 'string', // Log message
    context: 'object', // Additional context data
    traceId: 'string', // For request correlation
    source: 'string' // Component that generated the log
  };
  ```

- [ ] 2.2 Define event types and naming conventions based on existing monitoring service
  ```javascript
  // Example event types
  const eventTypes = {
    ERROR: 'log:error',
    INFO: 'log:info',
    WARN: 'log:warn',
    DEBUG: 'log:debug',
    METRIC: 'log:metric'
  };
  ```

## Phase 2: Create New Event-Based Services

### 3. Create Event-Based Monitoring Service

- [ ] 3.1 Create `monitoring-service.new.cjs` with circular buffer implementation based on analysis
  ```javascript
  // Implement circular buffer with size based on memory analysis
  class CircularBuffer {
    constructor(size = 100) {
      this.size = size;
      this.buffer = [];
      this.currentIndex = 0;
    }
    
    add(item) {
      if (this.buffer.length < this.size) {
        this.buffer.push(item);
      } else {
        this.buffer[this.currentIndex] = item;
      }
      this.currentIndex = (this.currentIndex + 1) % this.size;
      return item;
    }
    
    getAll() {
      return [...this.buffer];
    }
    
    clear() {
      this.buffer = [];
      this.currentIndex = 0;
    }
  }
  ```

- [ ] 3.2 Implement all public methods from original monitoring service for compatibility
  ```javascript
  // Implement all methods identified in step 1.1 with the same signatures
  // but using event-based implementation internally
  function error(message, context = {}, category = '', traceId = null) {
    // Create log data object
    const logData = {
      // Same structure as original for compatibility
    };
    
    // Add to circular buffer
    logBuffer.add(logData);
    
    // Emit event for subscribers
    eventService.emit(eventTypes.ERROR, logData);
  }
  ```

- [ ] 3.3 Implement event service subscription for receiving logs from other components
  ```javascript
  // Subscribe to log events from other components
  async function initialize() {
    this.subscriptions = [];
    // Use event types defined in step 2.2
    this.subscriptions.push(
      await eventService.subscribe(eventTypes.ERROR, this.handleLogEvent.bind(this)),
      await eventService.subscribe(eventTypes.INFO, this.handleLogEvent.bind(this)),
      await eventService.subscribe(eventTypes.WARN, this.handleLogEvent.bind(this)),
      await eventService.subscribe(eventTypes.DEBUG, this.handleLogEvent.bind(this))
    );
  }
  ```

- [ ] 3.4 Implement Winston logger integration with same configuration as original
  ```javascript
  // Copy Winston configuration from original service
  function initLogger(logFilePath, logLevel = 'info') {
    // Same implementation as original but with circular buffer integration
  }
  ```

- [ ] 3.5 Copy memory monitoring functionality from the original service
  ```javascript
  // Copy startMemoryMonitoring and related functions from original
  function startMemoryMonitoring() {
    // Same implementation as original
  }
  ```

### 4. Update Error Service

- [ ] 4.1 Based on analysis, create `error-service.new.cjs` that emits events instead of calling monitoring service
  ```javascript
  // Implement createError with same signature as original but using events
  function createError(category, message, severity, context = {}, traceId = null) {
    const errorObj = {
      // Same structure as original for compatibility
      id: uuidv4(),
      category,
      message,
      severity,
      context: sanitizeContext(context),
      timestamp: new Date().toISOString(),
      traceId: traceId || uuidv4() // Generate a trace ID if not provided
    };
    
    // Emit through event service instead of calling monitoring directly
    eventService.emit(eventTypes.ERROR, errorObj);
    
    return errorObj;
  }
  ```

- [ ] 4.2 Implement all other functions from original error service
  ```javascript
  // Copy all other functions like sanitizeContext, createApiError, etc.
  ```

- [ ] 4.3 Add backward compatibility layer for existing code
  ```javascript
  // Provide a way to set a monitoring service for backward compatibility
  let loggingService = null;
  
  function setLoggingService(service) {
    loggingService = service;
    // This is kept for backward compatibility but won't be used internally
  }
  ```

### 5. Create New Log Controller

- [ ] 5.1 Based on analysis, create `log-controller.new.cjs` that uses monitoring service's circular buffer
  ```javascript
  // Import the monitoring service to access its circular buffer
  const monitoringService = require('../../core/monitoring-service.new.cjs');
  
  // No need to maintain a separate cache of logs
  ```

- [ ] 5.2 Implement all API endpoints from original controller
  ```javascript
  // Implement the same API endpoints with the same signatures
  async function getLogEntries(req, res) {
    try {
      // Get logs directly from monitoring service's circular buffer
      const logs = monitoringService.getLogBuffer().getAll();
      
      // Apply filtering based on query parameters
      const filtered = filterLogs(logs, req.query);
      
      res.status(200).json(filtered);
    } catch (error) {
      res.status(500).json({ error: 'Failed to get log entries' });
    }
  }
  ```

- [ ] 5.3 Add proper error handling and rate limiting for API requests
  ```javascript
  // Implement rate limiting middleware
  function rateLimitMiddleware(req, res, next) {
    // Implement rate limiting logic
  }
  ```

## Phase 3: Update Components to Use Event Service

### 6. Analyze and Update API Controllers

- [ ] 6.1 Analyze all API controllers to identify logging patterns
  ```javascript
  // Document all places where monitoring service is called directly
  // Example: controllers/mail-controller.cjs, line 45: monitoringService.info(...)
  ```

- [ ] 6.2 Based on analysis, modify controllers to emit log events instead of calling monitoring service
  ```javascript
  // Before:
  monitoringService.info(`Request: ${req.method} ${req.url}`, { ip: req.ip });
  
  // After:
  eventService.emit(eventTypes.INFO, {
    message: `Request: ${req.method} ${req.url}`,
    category: 'api',
    context: { ip: req.ip },
    timestamp: new Date().toISOString()
  });
  ```

- [ ] 6.3 Add traceId propagation through API calls
  ```javascript
  // Example middleware to add traceId to all requests
  function traceMiddleware(req, res, next) {
    req.traceId = req.headers['x-trace-id'] || uuidv4();
    res.setHeader('x-trace-id', req.traceId);
    next();
  }
  ```

- [ ] 6.4 Update error handling in controllers to use new error service
  ```javascript
  // Before:
  catch (error) {
    monitoringService.error('Failed to process request', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
  
  // After:
  catch (error) {
    const errorObj = errorService.createError('api', 'Failed to process request', 'error', { error }, req.traceId);
    res.status(500).json({ error: 'Internal server error', traceId: errorObj.traceId });
  }
  ```

### 7. Analyze and Update LogViewer Component

- [ ] 7.1 Analyze `LogViewer.js` to identify all log fetching and rendering logic
  ```javascript
  // Document the current log fetching mechanism, refresh intervals, and rendering logic
  // Example: fetchLogs() is called every 15 seconds and displays up to 20 logs
  ```

- [ ] 7.2 Based on analysis, create `LogViewer.new.js` that subscribes directly to event service
  ```javascript
  // Implement the same interface as the original LogViewer but with event subscription
  async initialize() {
    // Subscribe to log events with filtering based on original implementation
    this.subscription = await eventService.subscribe('log:*', this.handleLogEvent.bind(this), {
      filter: (log) => {
        return (!this.filter.category || log.category === this.filter.category) &&
               (!this.filter.level || log.level === this.filter.level);
      }
    });
  }
  ```

- [ ] 7.3 Implement fixed-size log buffer in the component based on original limits
  ```javascript
  // Use the same limits as the original implementation (e.g., 20 logs)
  class LogBuffer {
    constructor(maxSize = 20) {
      this.maxSize = maxSize;
      this.logs = [];
    }
    
    add(log) {
      // Add log and maintain size limit
      this.logs.unshift(log); // Add to beginning for newest first
      if (this.logs.length > this.maxSize) {
        this.logs.pop(); // Remove oldest
      }
    }
  }
  ```

- [ ] 7.4 Add improved rendering with trace grouping and memory usage indicators
  ```javascript
  // Group logs by traceId for better visualization
  function groupLogsByTrace(logs) {
    const grouped = {};
    logs.forEach(log => {
      if (!grouped[log.traceId]) {
        grouped[log.traceId] = [];
      }
      grouped[log.traceId].push(log);
    });
    return grouped;
  }
  ```

## Phase 4: Testing and Integration

### 8. Test Individual Components

- [ ] 8.1 Create test plan for each new component based on original functionality
  ```javascript
  // Example test plan for monitoring-service.new.cjs
  /*
  1. Test all public methods with same parameters as original
  2. Verify circular buffer maintains size limits
  3. Test event subscription and emission
  4. Verify memory monitoring works correctly
  */
  ```

- [ ] 8.2 Write and run unit tests for new monitoring service
  ```javascript
  // Example test for circular buffer
  test('circular buffer should maintain size limit', () => {
    const buffer = new CircularBuffer(3);
    buffer.add('item1');
    buffer.add('item2');
    buffer.add('item3');
    buffer.add('item4');
    expect(buffer.getAll().length).toBe(3);
    expect(buffer.getAll()).toContain('item2');
    expect(buffer.getAll()).toContain('item3');
    expect(buffer.getAll()).toContain('item4');
    expect(buffer.getAll()).not.toContain('item1');
  });
  ```

- [ ] 8.3 Test error service event emission and verify it matches original behavior
- [ ] 8.4 Verify log controller API endpoints return the same data format as original

### 9. Integration Testing

- [ ] 9.1 Create integration test plan that covers all critical paths
  ```javascript
  // Example integration test plan
  /*
  1. Test error creation -> event emission -> log storage -> UI display
  2. Test high volume logging (1000+ logs in short period)
  3. Test memory usage under load
  4. Test trace correlation across components
  */
  ```

- [ ] 9.2 Test end-to-end flow from error creation to UI display
- [ ] 9.3 Verify memory usage remains stable under load with monitoring
  ```javascript
  // Example memory monitoring during tests
  function monitorMemoryDuringTest() {
    const initialMemory = process.memoryUsage().heapUsed;
    // Generate 1000 logs
    for (let i = 0; i < 1000; i++) {
      errorService.createError('test', `Test error ${i}`, 'error');
    }
    // Check memory after logs
    const finalMemory = process.memoryUsage().heapUsed;
    console.log(`Memory increase: ${(finalMemory - initialMemory) / 1024 / 1024} MB`);
  }
  ```

- [ ] 9.4 Test with high volume of logs to ensure performance
- [ ] 9.5 Verify trace correlation works across components

## Phase 5: Migration and Cleanup

### 10. Prepare for Migration

- [ ] 10.1 Create a detailed migration plan with rollback strategy
  ```
  # Migration Plan
  1. Deploy new files alongside existing ones
  2. Run application with both old and new services in parallel for testing
  3. Switch to new services one by one
  4. Monitor for issues
  5. Remove old files after successful migration
  
  # Rollback Strategy
  1. Keep old files until new system is proven stable
  2. Maintain backward compatibility layers
  3. Be prepared to revert to old files if issues occur
  ```

- [ ] 10.2 Create a feature flag system to enable/disable new services
  ```javascript
  // Example feature flag implementation
  const config = {
    useNewMonitoringService: process.env.USE_NEW_MONITORING === 'true',
    useNewErrorService: process.env.USE_NEW_ERROR === 'true',
    useNewLogController: process.env.USE_NEW_LOG_CONTROLLER === 'true'
  };
  ```

### 11. Execute Migration

- [ ] 11.1 Deploy new files alongside existing ones
- [ ] 11.2 Enable new services one by one with feature flags
- [ ] 11.3 Monitor application performance and memory usage
  ```javascript
  // Example monitoring during migration
  function monitorMigration() {
    const memoryUsage = [];
    const interval = setInterval(() => {
      memoryUsage.push({
        timestamp: new Date().toISOString(),
        heapUsed: process.memoryUsage().heapUsed / 1024 / 1024,
        rss: process.memoryUsage().rss / 1024 / 1024
      });
    }, 60000); // Every minute
    
    // Save to file for analysis
    process.on('SIGINT', () => {
      clearInterval(interval);
      fs.writeFileSync('migration-memory.json', JSON.stringify(memoryUsage));
      process.exit();
    });
  }
  ```

### 12. Cleanup and Finalization

- [ ] 12.1 After successful verification, remove feature flags
- [ ] 12.2 Remove old service files
- [ ] 12.3 Rename `.new.cjs` files to their final names
  ```bash
  # Example renaming script
  mv src/core/monitoring-service.new.cjs src/core/monitoring-service.cjs
  mv src/core/error-service.new.cjs src/core/error-service.cjs
  mv src/api/controllers/log-controller.new.cjs src/api/controllers/log-controller.cjs
  ```

- [ ] 12.4 Update documentation to reflect new architecture
- [ ] 12.5 Add monitoring for the event service to detect issues

## Implementation Notes

1. **Circular Buffer**: Implement a fixed-size circular buffer for log storage to prevent memory growth
2. **Event Filtering**: Use the event service's filtering capability to reduce unnecessary event processing
3. **Trace Correlation**: Ensure all logs include a traceId for end-to-end tracing
4. **Memory Safety**: Add checks to prevent unbounded memory growth in all components
5. **Backward Compatibility**: Maintain compatibility with existing code during migration

This approach will resolve the memory issues while creating a more robust, decoupled logging architecture.
