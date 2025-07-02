/**
 * @fileoverview New Event-Based MonitoringService with circular buffer implementation.
 * Replaces direct logging with event emission and uses circular buffer to prevent memory growth.
 * Maintains backward compatibility with existing monitoring service API.
 */

const winston = require('winston');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

// Lazy load storage service to avoid circular dependency
let storageService = null;
function getStorageService() {
  if (!storageService) {
    try {
      storageService = require('./storage-service.cjs');
    } catch (error) {
      console.warn('[MONITORING] Could not load storage service:', error.message);
    }
  }
  return storageService;
}

// Import event service for event-based architecture (lazy loaded to avoid circular dependency)
let eventService = null;

// Event types based on analysis
const eventTypes = {
  ERROR: 'log:error',
  INFO: 'log:info', 
  WARN: 'log:warn',
  DEBUG: 'log:debug',
  METRIC: 'log:metric',
  SYSTEM_MEMORY_WARNING: 'system:memory:warning',
  SYSTEM_EMERGENCY: 'system:emergency'
};

// Circular buffer implementation for memory-safe log storage
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
    if (this.buffer.length < this.size) {
      // Buffer not full yet, return in insertion order
      return [...this.buffer];
    } else {
      // Buffer is full, need to return in correct chronological order
      // Items from currentIndex to end are oldest, items from 0 to currentIndex-1 are newest
      const newerItems = this.buffer.slice(0, this.currentIndex);
      const olderItems = this.buffer.slice(this.currentIndex);
      return [...olderItems, ...newerItems];
    }
  }
  
  clear() {
    this.buffer = [];
    this.currentIndex = 0;
  }
}

// Initialize circular buffer with size based on memory analysis
const logBuffer = new CircularBuffer(100);

// Copy Winston configuration and constants from original service
let logger = null;
const dateSuffix = new Date().toISOString().slice(0,10).replace(/-/g, '');
let LOG_FILE_PATH = process.env.MCP_LOG_PATH || path.join(__dirname, `../../logs/mcp${dateSuffix}.log`);

// Read version from package.json
let appVersion = 'unknown';
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    appVersion = pkg.version || 'unknown';
} catch (e) {}

// Memory monitoring constants from original
const MEMORY_CHECK_INTERVAL = 30000; // 30 seconds
const MEMORY_WARNING_THRESHOLD = 0.85; // 85% of max memory

// Error throttling from original
const errorThrottles = new Map();
const ERROR_THRESHOLD = 10;
const ERROR_WINDOW_MS = 1000;

// Emergency memory protection from original
let emergencyLoggingDisabled = false;
let lastMemoryCheck = Date.now();
const MEMORY_CHECK_INTERVAL_MS = 5000;

// Event subscriptions for cleanup
let subscriptions = [];

/**
 * Copy Winston logger initialization from original service
 */
function initLogger(logFilePath, logLevel = 'info') {
    if (!logFilePath && !process.env.MCP_LOG_PATH) {
        const dateSuffix = new Date().toISOString().slice(0,10).replace(/-/g, '');
        LOG_FILE_PATH = path.join(__dirname, `../../logs/mcp${dateSuffix}.log`);
    } else {
        LOG_FILE_PATH = logFilePath || process.env.MCP_LOG_PATH;
    }
    
    const logsDir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    
    const consoleFormat = winston.format.printf(({ level, message, timestamp, context, category, ...rest }) => {
        const prefix = category ? `[MCP ${category.toUpperCase()}]` : '[MCP]';
        
        // Handle context properly - it could be in different places
        let contextObj = context;
        if (!contextObj && rest.context) {
            contextObj = rest.context;
        }
        
        // Stringify context if it exists and is an object
        let contextStr = '';
        if (contextObj && typeof contextObj === 'object' && Object.keys(contextObj).length > 0) {
            try {
                contextStr = ` ${JSON.stringify(contextObj)}`;
            } catch (err) {
                contextStr = ` {context serialization failed}`;
            }
        }
        
        // Ensure message is a string
        const messageStr = typeof message === 'object' ? JSON.stringify(message) : String(message);
        
        return `${prefix} ${messageStr}${contextStr}`;
    });
    
    const fileFormat = winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    );
    
    // Configure transports - exclude console transport in MCP silent mode
    const transports = [
        new winston.transports.File({ 
            filename: LOG_FILE_PATH, 
            maxsize: 2097152,
            maxFiles: 5,
            tailable: true,
            format: fileFormat,
            handleExceptions: true,
            handleRejections: true
        })
    ];
    
    // Only add console transport if not in MCP silent mode
    if (process.env.MCP_SILENT_MODE !== 'true') {
        transports.push(new winston.transports.Console({ 
            format: winston.format.combine(
                winston.format.colorize(),
                consoleFormat
            ),
            stderrLevels: ['error', 'warn'],
            consoleWarnLevels: [],
            handleExceptions: true,
            handleRejections: true
        }));
    }

    logger = winston.createLogger({
        level: logLevel,
        defaultMeta: {
            pid: process.pid,
            hostname: os.hostname(),
            version: appVersion
        },
        transports: transports,
        exitOnError: false
    });
}

/**
 * Copy error throttling logic from original service
 */
function shouldLogError(category) {
  const now = Date.now();
  const key = `error:${category || 'unknown'}`;
  
  if (!errorThrottles.has(key)) {
    errorThrottles.set(key, { count: 1, timestamp: now, suppressed: 0 });
    return true;
  }
  
  const record = errorThrottles.get(key);
  
  if (now - record.timestamp > ERROR_WINDOW_MS) {
    if (record.suppressed > 0) {
      console.error(`[MONITORING] Suppressed ${record.suppressed} similar errors in category '${category}' in the last ${ERROR_WINDOW_MS}ms`);
    }
    
    record.count = 1;
    record.timestamp = now;
    record.suppressed = 0;
    return true;
  }
  
  if (record.count >= ERROR_THRESHOLD) {
    record.suppressed++;
    return false;
  }
  
  record.count++;
  return true;
}

/**
 * Copy memory monitoring from original service
 */
function startMemoryMonitoring() {
  let memoryCheckInterval = null;
  
  const checkMemory = () => {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsed = memoryUsage.heapUsed;
      const heapTotal = memoryUsage.heapTotal;
      const usageRatio = heapUsed / heapTotal;
      
      if (usageRatio > MEMORY_WARNING_THRESHOLD) {
        console.warn(`[MEMORY WARNING] High memory usage: ${Math.round(usageRatio * 100)}% (${Math.round(heapUsed / 1024 / 1024)}MB / ${Math.round(heapTotal / 1024 / 1024)}MB)`);
        
        // Emit memory warning event if event service is available
        if (eventService) {
          try {
            eventService.emit(eventTypes.SYSTEM_MEMORY_WARNING, {
              usageRatio,
              heapUsed,
              heapTotal,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            // Silently ignore event emission errors
          }
        }
        
        if (global.gc) {
          console.log('[MEMORY] Forcing garbage collection');
          global.gc();
        }
      }
    } catch (err) {
      // Silently ignore memory monitoring errors
    }
  };
  
  memoryCheckInterval = setInterval(checkMemory, MEMORY_CHECK_INTERVAL);
  
  process.on('exit', () => {
    if (memoryCheckInterval) {
      clearInterval(memoryCheckInterval);
    }
  });
  
  checkMemory();
}

/**
 * Copy emergency memory check from original service
 */
function checkMemoryForEmergency() {
  const now = Date.now();
  if (now - lastMemoryCheck < MEMORY_CHECK_INTERVAL_MS) {
    return false;
  }
  
  lastMemoryCheck = now;
  
  try {
    const memoryUsage = process.memoryUsage();
    const heapUsed = memoryUsage.heapUsed;
    const heapTotal = memoryUsage.heapTotal;
    const usageRatio = heapUsed / heapTotal;
    
    if (usageRatio > 0.95) {
      if (!emergencyLoggingDisabled) {
        console.error(`[EMERGENCY] Disabling all logging due to critical memory usage: ${Math.round(usageRatio * 100)}%`);
        emergencyLoggingDisabled = true;
        
        // Emit emergency event if event service is available
        if (eventService) {
          try {
            eventService.emit(eventTypes.SYSTEM_EMERGENCY, {
              type: 'memory_critical',
              usageRatio,
              timestamp: new Date().toISOString()
            });
          } catch (error) {
            // Silently ignore event emission errors
          }
        }
      }
      return true;
    } else if (emergencyLoggingDisabled && usageRatio < 0.80) {
      console.log(`[EMERGENCY] Re-enabling logging as memory usage has decreased: ${Math.round(usageRatio * 100)}%`);
      emergencyLoggingDisabled = false;
    }
  } catch (e) {
    // If we can't check memory, assume it's safe to log
  }
  
  return emergencyLoggingDisabled;
}

/**
 * Determines if a log should be filtered out to reduce noise
 */
function shouldFilterLog(level, message, category, context = {}) {
    // Always allow error logs
    if (level === 'error') {
        return false;
    }
    
    // Filter static file requests
    if (category === 'api' && message && message.includes('GET') && 
        (message.includes('.js') || message.includes('.css') || message.includes('.ico') || 
         message.includes('.png') || message.includes('.jpg') || message.includes('.gif'))) {
        return true;
    }
    
    // Filter excessive event system metrics
    if (category === 'metrics' && message && (
        message.includes('event_subscribe_success') ||
        message.includes('event_listeners_count') ||
        message.includes('event_emit_success') ||
        message.includes('event_emit_no_listeners') ||
        message.includes('event_emit_error')
    )) {
        return true;
    }
    
    // Filter duplicate module registration messages
    if (message && message.includes('Module') && message.includes('registered')) {
        return true;
    }
    
    // Filter health check logs in production
    if (process.env.NODE_ENV === 'production' && 
        message && (message.includes('health') || message.includes('ping'))) {
        return true;
    }
    
    // Filter verbose debug logs in production
    if (process.env.NODE_ENV === 'production' && level === 'debug') {
        return true;
    }
    
    // Filter memory usage metrics unless they're warnings
    if (category === 'metrics' && message && message.includes('memory_usage') && level === 'info') {
        return true;
    }
    
    // Filter performance metrics for very fast operations (< 10ms)
    if (category === 'metrics' && context && context.metricValue && 
        typeof context.metricValue === 'number' && context.metricValue < 10) {
        return true;
    }
    
    return false;
}

/**
 * Handle log events from other components (event subscription)
 */
function handleLogEvent(logData) {
    // Add to circular buffer
    logBuffer.add(logData);
    
    // Log to Winston if available
    if (logger) {
        try {
            logger.log(logData.level || 'info', logData.message, {
                context: logData.context,
                category: logData.category,
                timestamp: logData.timestamp,
                id: logData.id,
                pid: logData.pid,
                hostname: logData.hostname,
                version: logData.version,
                traceId: logData.traceId
            });
        } catch (err) {
            console.error(`[MONITORING] Failed to log to Winston: ${err.message}`);
        }
    }
}

/**
 * Initialize event service subscriptions
 */
async function initialize() {
  subscriptions = [];
  
  // Lazy load event service to avoid circular dependency
  if (!eventService) {
    try {
      eventService = require('./event-service.cjs');
    } catch (error) {
      console.warn('[MONITORING] Event service not available for subscription:', error.message);
      return;
    }
  }
  
  // Subscribe to all log events
  try {
    subscriptions.push(
      await eventService.subscribe(eventTypes.ERROR, handleLogEvent),
      await eventService.subscribe(eventTypes.INFO, handleLogEvent),
      await eventService.subscribe(eventTypes.WARN, handleLogEvent),
      await eventService.subscribe(eventTypes.DEBUG, handleLogEvent),
      await eventService.subscribe(eventTypes.METRIC, handleLogEvent)
    );
  } catch (error) {
    console.warn('[MONITORING] Failed to subscribe to event service:', error.message);
  }
}

/**
 * Create log data object compatible with original format
 */
function createLogData(level, message, context = {}, category = '', traceId = null, userId = null, deviceId = null) {
  const logData = {
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    level,
    category,
    message,
    context,
    pid: process.pid,
    hostname: os.hostname(),
    version: appVersion
  };
  
  if (traceId) {
    logData.traceId = traceId;
  }
  
  // Add multi-user context for isolation and monitoring
  if (userId) {
    logData.userId = userId;
  }
  
  if (deviceId) {
    logData.deviceId = deviceId;
  }
  
  return logData;
}

/**
 * Logs an error event - maintains same signature as original
 */
async function logError(error) {
    // Skip if emergency mode is active
    if (emergencyLoggingDisabled) return;

    // Check memory before processing expensive operation
    checkMemoryForEmergency();
    
    // If not an MCP error, create one
    const mcpError = error && error.category ? error : ErrorService.createError(
        'unknown',
        error?.message || error?.toString() || 'Unknown error',
        'error',
        error
    );

    // Extract necessary fields
    const category = mcpError.category || 'unknown';
    const message = mcpError.message || 'Unknown error';
    
    // Check if we should throttle this error
    if (!shouldLogError(category)) {
        return;
    }
    
    // Format context
    const context = {
        ...mcpError.context,
        error: mcpError.stack || mcpError.toString(),
        category: mcpError.category,
        severity: mcpError.severity
    };
    
    // Generate traceId if not provided
    const traceId = mcpError.traceId || uuidv4();
    const userId = mcpError.userId;
    const deviceId = mcpError.deviceId;

    // Create log data with error details
    const logData = createLogData('error', message, context, category, traceId, userId, deviceId);
    
    try {
        // Log to file
        logger.error(message, {
            category,
            context,
            traceId,
            userId,
            deviceId
        });
        
        // Emit error event
        if (eventService) {
            eventService.publish(eventTypes.ERROR, logData);
        }

        // Persist user-specific logs if userId is provided
        if (userId) {
            try {
                const storage = getStorageService();
                if (storage) {
                    // Don't await to avoid blocking - let it run in background
                    storage.addUserLog(userId, 'error', message, category, context, traceId, deviceId)
                        .catch(err => {
                            console.error(`[MCP ERROR] Failed to persist user log: ${err.message}`);
                        });
                }
            } catch (storageError) {
                console.error(`[MCP ERROR] Error accessing storage for user log: ${storageError.message}`);
            }
        }
    } catch (e) {
        // Last resort fallback to console
        console.error(`[MCP ERROR] Failed to log error: ${e.message}`);
        console.error(`Original error: ${message}`);
    }
}

/**
 * Logs an error message - maintains same signature as original
 */
async function error(message, context = {}, category = '', traceId = null, userId = null, deviceId = null) {
    if (checkMemoryForEmergency()) {
        return;
    }
    
    if (!shouldLogError(category)) {
        return;
    }
    
    // Apply same filtering as original for calendar/graph errors
    if ((category === 'calendar' || category === 'graph') && 
        (message.includes('Graph API request failed') || 
         message.includes('Unable to read error response'))) {
        if (process.env.NODE_ENV === 'development') {
            console.warn(`[FILTERED] ${category} error: ${message}`);
        }
        return;
    }
    
    const logData = createLogData('error', message, context, category, traceId, userId, deviceId);
    
    // Add to circular buffer
    logBuffer.add(logData);
    
    // Don't emit event for our own logs - only handle events from other services
    
    if (logger) {
        try {
            logger.error(logData.message, {
                context: logData.context,
                category: logData.category,
                timestamp: logData.timestamp,
                id: logData.id,
                pid: logData.pid,
                hostname: logData.hostname,
                version: logData.version,
                traceId: logData.traceId,
                userId: logData.userId,
                deviceId: logData.deviceId
            });
            
            // Persist user-specific logs if userId is provided
            if (userId) {
                try {
                    const storage = getStorageService();
                    if (storage) {
                        // Don't await to avoid blocking - let it run in background
                        storage.addUserLog(userId, 'error', message, category, context, traceId, deviceId)
                            .catch(err => {
                                console.error(`[MCP ERROR] Failed to persist user log: ${err.message}`);
                            });
                    }
                } catch (storageError) {
                    console.error(`[MCP ERROR] Error accessing storage for user log: ${storageError.message}`);
                }
            }
        } catch (err) {
            console.error(`[MONITORING] Failed to log error: ${err.message}`);
        }
    }
}

/**
 * Logs an info message - maintains same signature as original
 */
async function info(message, context = {}, category = 'general', traceId = null, userId = null, deviceId = null) {
    if (checkMemoryForEmergency()) {
        return;
    }
    
    if (!logger) initLogger();
    
    if (shouldFilterLog('info', message, category, context)) {
        return;
    }
    
    const logData = createLogData('info', message, context, category, traceId, userId, deviceId);
    
    // Add to circular buffer
    logBuffer.add(logData);
    
    // Don't emit event for our own logs - only handle events from other services
    
    try {
        logger.info(logData.message, {
            context: logData.context,
            category: logData.category,
            timestamp: logData.timestamp,
            id: logData.id,
            pid: logData.pid,
            hostname: logData.hostname,
            version: logData.version,
            traceId: logData.traceId,
            userId: logData.userId,
            deviceId: logData.deviceId
        });
        
        // Persist user-specific logs if userId is provided
        if (userId) {
            try {
                const storage = getStorageService();
                if (storage) {
                    // Don't await to avoid blocking - let it run in background
                    storage.addUserLog(userId, 'info', message, category, context, traceId, deviceId)
                        .catch(err => {
                            console.error(`[MCP INFO] Failed to persist user log: ${err.message}`);
                        });
                }
            } catch (storageError) {
                console.error(`[MCP INFO] Error accessing storage for user log: ${storageError.message}`);
            }
        }
    } catch (err) {
        console.error(`[MONITORING] Failed to log info message: ${err.message}`);
    }
}

/**
 * Logs a warning message - maintains same signature as original
 */
async function warn(message, context = {}, category = 'general', traceId = null, userId = null, deviceId = null) {
    if (checkMemoryForEmergency()) {
        return;
    }
    
    if (!logger) initLogger();
    
    if (shouldFilterLog('warn', message, category, context)) {
        return;
    }
    
    const logData = createLogData('warn', message, context, category, traceId, userId, deviceId);
    
    // Add to circular buffer
    logBuffer.add(logData);
    
    try {
        logger.warn(logData.message, {
            context: logData.context,
            category: logData.category,
            timestamp: logData.timestamp,
            id: logData.id,
            pid: logData.pid,
            hostname: logData.hostname,
            version: logData.version,
            traceId: logData.traceId,
            userId: logData.userId,
            deviceId: logData.deviceId
        });
        
        // Persist user-specific logs if userId is provided
        if (userId) {
            try {
                const storage = getStorageService();
                if (storage) {
                    // Don't await to avoid blocking - let it run in background
                    storage.addUserLog(userId, 'warn', message, category, context, traceId, deviceId)
                        .catch(err => {
                            console.error(`[MCP WARN] Failed to persist user log: ${err.message}`);
                        });
                }
            } catch (storageError) {
                console.error(`[MCP WARN] Error accessing storage for user log: ${storageError.message}`);
            }
        }
    } catch (err) {
        console.error(`[MONITORING] Failed to log warning message: ${err.message}`);
    }
}

/**
 * Logs a debug message - maintains same signature as original
 */
async function debug(message, context = {}, category = 'general', traceId = null, userId = null, deviceId = null) {
    if (checkMemoryForEmergency()) {
        return;
    }
    
    if (!logger) initLogger();
    
    if (shouldFilterLog('debug', message, category, context)) {
        return;
    }
    
    const logData = createLogData('debug', message, context, category, traceId, userId, deviceId);
    
    // Add to circular buffer
    logBuffer.add(logData);
    
    // Don't emit event for our own logs - only handle events from other services
    
    try {
        logger.debug(logData.message, {
            context: logData.context,
            category: logData.category,
            timestamp: logData.timestamp,
            id: logData.id,
            pid: logData.pid,
            hostname: logData.hostname,
            version: logData.version,
            traceId: logData.traceId,
            userId: logData.userId,
            deviceId: logData.deviceId
        });
        
        // Persist user-specific logs if userId is provided
        if (userId) {
            try {
                const storage = getStorageService();
                if (storage) {
                    // Don't await to avoid blocking - let it run in background
                    storage.addUserLog(userId, 'debug', message, category, context, traceId, deviceId)
                        .catch(err => {
                            console.error(`[MCP DEBUG] Failed to persist user log: ${err.message}`);
                        });
                }
            } catch (storageError) {
                console.error(`[MCP DEBUG] Error accessing storage for user log: ${storageError.message}`);
            }
        }
    } catch (err) {
        console.error(`[MONITORING] Failed to log debug message: ${err.message}`);
    }
}

/**
 * Track a metric
 */
async function trackMetric(name, value, context = {}, userId = null, deviceId = null) {
    // Skip metrics about storage operations to prevent recursive loops
    if (name.startsWith('storage_') || context.category === 'storage') {
        // Just log to console instead of persisting to prevent recursion
        if (logger) {
            logger.debug(`[METRIC] ${name}: ${value}`, { 
                metricName: name, 
                metricValue: value,
                ...context
            });
        }
        return;
    }

    // Emergency memory protection
    if (emergencyLoggingDisabled) return;
    
    // Check memory periodically during metric tracking
    if (Date.now() - lastMemoryCheck > MEMORY_CHECK_INTERVAL_MS) {
        checkMemoryForEmergency();
    }
    
    // Add to circular buffer
    const logData = {
        type: 'metric',
        name,
        value,
        context,
        timestamp: new Date().toISOString(),
        userId,
        deviceId
    };
    
    logBuffer.add(logData);
    
    // Log to Winston
    if (logger) {
        logger.debug(`[METRIC] ${name}: ${value}`, { 
            metricName: name, 
            metricValue: value,
            ...context
        });
    }
    
    // Emit metric event if event service is available
    if (eventService) {
        try {
            await eventService.publish(eventTypes.METRIC, logData);
        } catch (error) {
            // Don't log this error to avoid potential recursion
            console.error(`[MCP MONITORING] Failed to publish metric event: ${error.message}`);
        }
    }
    
    // Store user-specific metrics in database if storage service is available
    // and we have a user ID
    if (userId && name !== 'storage_add_user_log_success') {
        try {
            const storage = getStorageService();
            if (storage && typeof storage.addUserLog === 'function') {
                storage.addUserLog(userId, 'info', `Metric: ${name}`, 'metrics', {
                    metricName: name,
                    metricValue: value,
                    ...context
                }, null, deviceId)
                    .catch(err => {
                        console.error(`[MCP METRIC] Failed to persist user log: ${err.message}`);
                    });
            }
        } catch (storageError) {
            console.error(`[MCP METRIC] Error accessing storage for user log: ${storageError.message}`);
        }
    }
    
    if (!logger) initLogger();
    
    // Filter out excessive metrics
    if (shouldFilterLog('info', `Metric: ${name}`, 'metrics', { name, value, ...context })) {
        return;
    }
    
    const metricLogData = {
        level: 'info',
        message: `Metric: ${name}`,
        context: {
            metricName: name,
            metricValue: value,
            ...context
        },
        category: 'metrics',
        timestamp: new Date().toISOString()
    };
    
    if (userId) {
        metricLogData.userId = userId;
    }
    
    if (deviceId) {
        metricLogData.deviceId = deviceId;
    }
    
    // Add to circular buffer
    logBuffer.add(metricLogData);
    
    // Log to Winston
    logger.info(`Metric: ${name}`, {
        context: metricLogData.context,
        category: metricLogData.category,
        timestamp: metricLogData.timestamp,
        userId: metricLogData.userId,
        deviceId: metricLogData.deviceId
    });
    
    // Persist user-specific logs if userId is provided
    if (userId) {
        try {
            const storage = getStorageService();
            if (storage) {
                // Don't await to avoid blocking - let it run in background
                storage.addUserLog(userId, 'info', `Metric: ${name}`, 'metrics', {
                    metricName: name,
                    metricValue: value,
                    ...context
                }, null, deviceId)
                    .catch(err => {
                        console.error(`[MCP METRIC] Failed to persist user log: ${err.message}`);
                    });
            }
        } catch (storageError) {
            console.error(`[MCP METRIC] Error accessing storage for user log: ${storageError.message}`);
        }
    }
    
    // Don't emit events for metrics to prevent recursion
}

/**
 * Subscribe to log events - maintains same signature as original
 */
function subscribeToLogs(callback) {
    // For backward compatibility, subscribe to all log events
    const unsubscribeFunctions = [];
    
    // Lazy load event service if not available
    if (!eventService) {
      try {
        eventService = require('./event-service.cjs');
      } catch (error) {
        console.warn('[MONITORING] Event service not available for log subscription:', error.message);
        return () => {}; // Return no-op unsubscribe function
      }
    }
    
    const subscribeToEvent = async (eventType) => {
        const id = await eventService.subscribe(eventType, callback);
        return () => eventService.unsubscribe(id);
    };
    
    Promise.all([
        subscribeToEvent(eventTypes.ERROR),
        subscribeToEvent(eventTypes.INFO),
        subscribeToEvent(eventTypes.WARN),
        subscribeToEvent(eventTypes.DEBUG)
    ]).then(unsubscribes => {
        unsubscribeFunctions.push(...unsubscribes);
    }).catch(error => {
        console.warn('[MONITORING] Failed to subscribe to log events:', error.message);
    });
    
    // Return unsubscribe function that cleans up all subscriptions
    return () => {
        unsubscribeFunctions.forEach(unsub => unsub());
    };
}

/**
 * Subscribe to metric events - maintains same signature as original
 */
function subscribeToMetrics(callback) {
    let unsubscribeFunction = null;
    
    // Lazy load event service if not available
    if (!eventService) {
      try {
        eventService = require('./event-service.cjs');
      } catch (error) {
        console.warn('[MONITORING] Event service not available for metrics subscription:', error.message);
        return () => {}; // Return no-op unsubscribe function
      }
    }
    
    eventService.subscribe(eventTypes.METRIC, callback).then(id => {
        unsubscribeFunction = () => eventService.unsubscribe(id);
    }).catch(error => {
        console.warn('[MONITORING] Failed to subscribe to metric events:', error.message);
    });
    
    return () => {
        if (unsubscribeFunction) unsubscribeFunction();
    };
}

/**
 * Get latest logs from circular buffer instead of files
 */
async function getLatestLogs(limit = 100) {
    const logs = logBuffer.getAll();
    
    // Sort by timestamp (newest first) and limit
    return logs
        .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
        .slice(0, limit);
}

/**
 * Get the circular buffer for direct access (new method)
 */
function getLogBuffer() {
    return logBuffer;
}

/**
 * For test: allow resetting logger with new path - maintains same signature as original
 */
function _resetLoggerForTest(logFilePath, logLevel = 'info') {
    if (logger) {
        for (const t of logger.transports) logger.remove(t);
    }
    initLogger(logFilePath, logLevel);
}

// Initialize logger and memory monitoring at startup
initLogger();
startMemoryMonitoring();

// Defer event service initialization to avoid circular dependency
setTimeout(() => {
  initialize().catch(error => {
    console.warn('[MONITORING] Event service initialization failed:', error.message);
  });
}, 100); // Small delay to ensure all modules are loaded

module.exports = {
    logError,
    error,
    info,
    warn,
    debug,
    trackMetric,
    LOG_FILE_PATH,
    _resetLoggerForTest,
    initLogger,
    subscribeToLogs,
    subscribeToMetrics,
    getLatestLogs,
    getLogBuffer // New method for direct buffer access
};