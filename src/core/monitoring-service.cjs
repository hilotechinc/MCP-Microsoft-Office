/**
 * @fileoverview MonitoringService provides centralized logging for MCP Desktop.
 * Handles logging of errors, warnings, info, and performance metrics.
 * Uses Winston for log management and log rotation.
 * Includes error throttling and memory monitoring to prevent crashes.
 */

const winston = require('winston');
const path = require('path');
const os = require('os');
const fs = require('fs');

// Allow dynamic log file path for testability
let logger = null;
// Generate a datestamped log file name to prevent multiple file creation
const dateSuffix = new Date().toISOString().slice(0,10).replace(/-/g, '');
let LOG_FILE_PATH = process.env.MCP_LOG_PATH || path.join(__dirname, `../../logs/mcp${dateSuffix}.log`);

// Read version from package.json
let appVersion = 'unknown';
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    appVersion = pkg.version || 'unknown';
} catch (e) {}

// Create log event emitter for UI components to subscribe to
const EventEmitter = require('events');
const logEmitter = new EventEmitter();

// Increase max listeners to avoid warnings
logEmitter.setMaxListeners(20);

// Error throttling mechanism to prevent error storms
const errorThrottles = new Map();
const ERROR_THRESHOLD = 10; // Max errors per category in the time window
const ERROR_WINDOW_MS = 1000; // 1 second time window
const MEMORY_CHECK_INTERVAL = 30000; // 30 seconds
const MEMORY_WARNING_THRESHOLD = 0.85; // 85% of max memory

// Log deduplication to prevent duplicate log emissions
const recentLogHashes = new Map();
const LOG_DEDUP_WINDOW_MS = 30000; // 30 second deduplication window (increased from 10s)
const MAX_RECENT_LOGS = 500; // Maximum number of recent logs to track (reduced from 1000)

// Category-specific deduplication for high-volume error categories
const categoryDedupWindows = {
  'calendar': 60000, // 60 second window for calendar errors
  'graph': 60000,   // 60 second window for graph API errors
  'api': 30000      // 30 second window for API errors
};

/**
 * Generate a hash for a log entry to detect duplicates
 * @param {Object} logData - Log data to hash
 * @returns {string} - Hash string
 */
function generateLogHash(logData) {
  // Extract key fields for deduplication
  const category = logData.category || '';
  const message = logData.message || '';
  const level = logData.level || '';
  
  // For calendar and graph API errors, create a more specific hash
  // that ignores the specific event IDs but captures the error type
  if ((category === 'calendar' || category === 'graph') && 
      message.includes('API request failed')) {
    // Extract the error type and status code, but ignore the specific event ID
    const statusMatch = message.match(/([0-9]{3})\s*-\s*([^:]+)/);
    const errorType = message.includes('cancel event') ? 'cancel' : 
                     message.includes('tentativelyAccept') ? 'tentative' : 'other';
    
    // Create a hash that ignores the specific event ID but captures the error type
    return `${category}:${level}:${errorType}:${statusMatch ? statusMatch[1] : 'unknown'}`;
  }
  
  // Include context data for better deduplication if available
  let contextHash = '';
  if (logData.context && typeof logData.context === 'object') {
    try {
      // Only include specific fields that are useful for deduplication
      const relevantFields = ['statusCode', 'errorCode', 'requestId', 'method', 'path'];
      const relevantContext = {};
      
      for (const field of relevantFields) {
        if (logData.context[field] !== undefined && 
            (typeof logData.context[field] === 'string' || 
             typeof logData.context[field] === 'number')) {
          relevantContext[field] = logData.context[field];
        }
      }
      
      if (Object.keys(relevantContext).length > 0) {
        contextHash = `:${JSON.stringify(relevantContext)}`;
      }
    } catch (e) {
      // Ignore errors in context serialization
    }
  }
  
  // Create a hash by combining these fields
  return `${category}:${level}:${message.substring(0, 100)}${contextHash}`;
}

/**
 * Check if a log is a duplicate that should be skipped
 * @param {Object} logData - Log data to check
 * @returns {boolean} - True if the log should be skipped (is a duplicate)
 */
function isDuplicateLog(logData) {
  const now = Date.now();
  const hash = generateLogHash(logData);
  const category = logData.category || '';
  const level = logData.level || '';
  
  // Use category-specific deduplication window if available, otherwise use default
  let dedupWindow = LOG_DEDUP_WINDOW_MS;
  
  // For error and warning logs, use longer deduplication windows
  if (level === 'error' || level === 'warn') {
    // Check if we have a specific window for this category
    if (categoryDedupWindows[category]) {
      dedupWindow = categoryDedupWindows[category];
    } else if (category.includes('graph') || category.includes('api')) {
      // Special handling for any graph or API related categories
      dedupWindow = 45000; // 45 seconds
    }
  }
  
  // For calendar errors specifically, use an even more aggressive approach
  if (category === 'calendar' && logData.message && 
      (logData.message.includes('Graph API request failed') || 
       logData.message.includes('Unable to read error response'))) {
    dedupWindow = 120000; // 2 minutes for Graph API calendar errors
  }
  
  // Clean up old entries first - do this less frequently to improve performance
  if (Math.random() < 0.1) { // Only clean up ~10% of the time
    for (const [key, timestamp] of recentLogHashes.entries()) {
      if (now - timestamp > dedupWindow) {
        recentLogHashes.delete(key);
      }
    }
  }
  
  // Check if this is a duplicate
  if (recentLogHashes.has(hash)) {
    return true;
  }
  
  // Add to recent logs
  recentLogHashes.set(hash, now);
  
  // Trim if we have too many entries - more aggressive trimming
  if (recentLogHashes.size > MAX_RECENT_LOGS) {
    // Convert to array, sort by timestamp, and keep only the newest entries
    const entries = Array.from(recentLogHashes.entries());
    entries.sort((a, b) => b[1] - a[1]); // Sort by timestamp, newest first
    
    // Create a new map with only 1/3 of the max entries (more aggressive cleanup)
    recentLogHashes.clear();
    entries.slice(0, Math.floor(MAX_RECENT_LOGS / 3)).forEach(([key, value]) => {
      recentLogHashes.set(key, value);
    });
  }
  
  return false;
}

/**
 * Check if an error should be logged based on throttling rules
 * @param {string} category - Error category
 * @returns {boolean} - Whether the error should be logged
 */
function shouldLogError(category) {
  const now = Date.now();
  const key = `error:${category || 'unknown'}`;
  
  if (!errorThrottles.has(key)) {
    errorThrottles.set(key, { count: 1, timestamp: now, suppressed: 0 });
    return true;
  }
  
  const record = errorThrottles.get(key);
  
  // Reset counter if time window has passed
  if (now - record.timestamp > ERROR_WINDOW_MS) {
    // If we suppressed errors, log a summary before resetting
    if (record.suppressed > 0) {
      console.error(`[MONITORING] Suppressed ${record.suppressed} similar errors in category '${category}' in the last ${ERROR_WINDOW_MS}ms`);
    }
    
    record.count = 1;
    record.timestamp = now;
    record.suppressed = 0;
    return true;
  }
  
  // Check if we're over the threshold
  if (record.count >= ERROR_THRESHOLD) {
    record.suppressed++;
    return false;
  }
  
  record.count++;
  return true;
}

/**
 * Monitor system memory usage and log warnings if approaching limits
 */
function startMemoryMonitoring() {
  let memoryCheckInterval = null;
  
  const checkMemory = () => {
    try {
      const memoryUsage = process.memoryUsage();
      const heapUsed = memoryUsage.heapUsed;
      const heapTotal = memoryUsage.heapTotal;
      const usageRatio = heapUsed / heapTotal;
      
      // Log memory usage for monitoring
      if (usageRatio > MEMORY_WARNING_THRESHOLD) {
        console.warn(`[MEMORY WARNING] High memory usage: ${Math.round(usageRatio * 100)}% (${Math.round(heapUsed / 1024 / 1024)}MB / ${Math.round(heapTotal / 1024 / 1024)}MB)`);
        
        // Force garbage collection if available (Node.js with --expose-gc flag)
        if (global.gc) {
          console.log('[MEMORY] Forcing garbage collection');
          global.gc();
        }
      }
    } catch (err) {
      // Silently ignore memory monitoring errors
    }
  };
  
  // Start memory monitoring interval
  memoryCheckInterval = setInterval(checkMemory, MEMORY_CHECK_INTERVAL);
  
  // Clean up on process exit
  process.on('exit', () => {
    if (memoryCheckInterval) {
      clearInterval(memoryCheckInterval);
    }
  });
  
  // Initial memory check
  checkMemory();
}

// Start memory monitoring
startMemoryMonitoring();

// Emergency memory protection - used to completely disable logging if memory usage gets too high
let emergencyLoggingDisabled = false;
let lastMemoryCheck = Date.now();
const MEMORY_CHECK_INTERVAL_MS = 5000; // Check memory every 5 seconds

/**
 * Emergency check to see if we should disable all logging
 * This is a last resort to prevent application crashes
 */
function checkMemoryForEmergency() {
  // Only check periodically to avoid performance impact
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
    
    // If memory usage is extremely high (95%+), disable all logging
    if (usageRatio > 0.95) {
      if (!emergencyLoggingDisabled) {
        console.error(`[EMERGENCY] Disabling all logging due to critical memory usage: ${Math.round(usageRatio * 100)}%`);
        emergencyLoggingDisabled = true;
      }
      return true;
    } else if (emergencyLoggingDisabled && usageRatio < 0.80) {
      // Re-enable logging if memory usage drops below 80%
      console.log(`[EMERGENCY] Re-enabling logging as memory usage has decreased: ${Math.round(usageRatio * 100)}%`);
      emergencyLoggingDisabled = false;
    }
  } catch (e) {
    // If we can't check memory, assume it's safe to log
  }
  
  return emergencyLoggingDisabled;
}

function initLogger(logFilePath, logLevel = 'info') {
    // If no custom path provided, use date-stamped file name
    if (!logFilePath && !process.env.MCP_LOG_PATH) {
        const dateSuffix = new Date().toISOString().slice(0,10).replace(/-/g, '');
        LOG_FILE_PATH = path.join(__dirname, `../../logs/mcp${dateSuffix}.log`);
    } else {
        LOG_FILE_PATH = logFilePath || process.env.MCP_LOG_PATH;
    }
    
    // Create logs directory if it doesn't exist
    const logsDir = path.dirname(LOG_FILE_PATH);
    if (!fs.existsSync(logsDir)) {
        fs.mkdirSync(logsDir, { recursive: true });
    }
    
    // Custom format for console output
    const consoleFormat = winston.format.printf(({ level, message, timestamp, context, category }) => {
        const prefix = category ? `[MCP ${category.toUpperCase()}]` : '[MCP]';
        // Keep context as an object rather than trying to stringify it
        // This avoids circular reference issues and keeps the console output clean
        return `${prefix} ${message}`;
    });
    
    // Custom format for file output (more detailed JSON)
    const fileFormat = winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    );
    
    logger = winston.createLogger({
        level: logLevel,
        defaultMeta: {
            pid: process.pid,
            hostname: os.hostname(),
            version: appVersion
        },
        transports: [
            // Log file transport (JSON format with rotation)
            new winston.transports.File({ 
                filename: LOG_FILE_PATH, 
                maxsize: 2097152, // 2MB (reduced from 5MB)
                maxFiles: 5, // Reduced from 10
                tailable: true,
                format: fileFormat,
                handleExceptions: true,
                handleRejections: true
            }),
            // Console transport (formatted for readability)
            new winston.transports.Console({ 
                format: winston.format.combine(
                    winston.format.colorize(),
                    consoleFormat
                ),
                stderrLevels: ['error', 'warn'],
                consoleWarnLevels: [], // Ensure no levels go to stdout
                handleExceptions: true,
                handleRejections: true
            })
        ],
        exitOnError: false // Don't crash on error
    });
}

// Initialize logger at startup
initLogger();

// For test: allow resetting logger with new path
function _resetLoggerForTest(logFilePath, logLevel = 'info') {
    if (logger) {
        for (const t of logger.transports) logger.remove(t);
    }
    initLogger(logFilePath, logLevel);
}

/**
 * Logs an error event.
 * @param {Object} error - Error object (from ErrorService)
 */
function logError(error) {
    if (!logger) initLogger();
    
    // Apply error throttling to prevent error storms
    if (!shouldLogError(error.category)) {
        // Skip logging this error due to throttling
        return;
    }
    
    const logData = {
        id: error.id,
        category: error.category,
        message: error.message,
        severity: error.severity,
        context: error.context || {},
        timestamp: error.timestamp || new Date().toISOString(),
        level: 'error' // Add level for consistent deduplication
    };
    
    // Add trace ID if available
    if (error.traceId) {
        logData.traceId = error.traceId;
    }
    
    // Check for duplicates before logging
    if (isDuplicateLog(logData)) {
        // Skip duplicate logs
        return;
    }
    
    try {
        logger.error(logData);
        
        // Emit error event for UI subscribers
        logEmitter.emit('log', logData);
    } catch (err) {
        // Prevent cascading errors by logging to console only
        console.error(`[MONITORING] Failed to log error: ${err.message}`);
    }
}

/**
 * Logs an info event.
 * @param {string} message - Log message
 * @param {Object} [context] - Additional context data
 * @param {string} [category] - Category for the log (e.g., 'api', 'graph', 'auth')
 * @param {string} [traceId] - Optional trace ID for request correlation
 */
function info(message, context = {}, category = '', traceId = null) {
    // EMERGENCY FIX: Skip all logging if memory usage is critical
    if (checkMemoryForEmergency()) {
        return;
    }
    
    if (!logger) initLogger();
    
    try {
        const logData = {
            message,
            context,
            category,
            timestamp: new Date().toISOString(),
            pid: process.pid,
            hostname: os.hostname(),
            version: appVersion,
            level: 'info'
        };
        
        // Add trace ID if provided
        if (traceId) {
            logData.traceId = traceId;
        }
        
        // Check for duplicates before logging
        if (isDuplicateLog(logData)) {
            // Skip duplicate logs
            return;
        }
        
        // Skip API and calendar info logs to reduce volume
        if (category === 'api' || category === 'calendar' || category === 'graph') {
            // Only log these categories if in development mode
            if (process.env.NODE_ENV !== 'development') {
                return;
            }
        }
        
        logger.info(logData);
        
        // Emit log event for UI subscribers
        logEmitter.emit('log', logData);
        
        // Debug log emission (only in development)
        if (process.env.NODE_ENV === 'development') {
            console.log(`[MonitoringService] Emitted info log: ${message}`);
        }
    } catch (err) {
        // Prevent cascading errors by logging to console only
        console.error(`[MONITORING] Failed to log info message: ${err.message}`);
    }
}

/**
 * Logs a warning event.
 * @param {string} message - Log message
 * @param {Object} [context] - Additional context data
 * @param {string} [category] - Category for the log (e.g., 'api', 'graph', 'auth')
 * @param {string} [traceId] - Optional trace ID for request correlation
 */
function warn(message, context = {}, category = '', traceId = null) {
    if (!logger) initLogger();
    
    try {
        const logData = {
            message,
            category,
            context,
            timestamp: new Date().toISOString(),
            pid: process.pid,
            hostname: os.hostname(),
            version: appVersion,
            level: 'warn'
        };
        
        // Add trace ID if provided
        if (traceId) {
            logData.traceId = traceId;
        }
        
        // Check for duplicates before logging
        if (isDuplicateLog(logData)) {
            // Skip duplicate logs
            return;
        }
        
        logger.warn(logData);
        
        // Emit log event for UI subscribers
        logEmitter.emit('log', logData);
        
        // Debug log emission (only in development)
        if (process.env.NODE_ENV === 'development') {
            console.log(`[MonitoringService] Emitted warning log: ${message}`);
        }
    } catch (err) {
        // Prevent cascading errors by logging to console only
        console.error(`[MONITORING] Failed to log warning message: ${err.message}`);
    }
}

/**
 * Logs a debug event.
 * @param {string} message - Log message
 * @param {Object} [context] - Additional context data
 * @param {string} [category] - Category for the log (e.g., 'api', 'graph', 'auth')
 * @param {string} [traceId] - Optional trace ID for request correlation
 */
function debug(message, context = {}, category = '', traceId = null) {
    if (!logger) initLogger();
    
    try {
        const logData = {
            message,
            category,
            context,
            timestamp: new Date().toISOString(),
            pid: process.pid,
            hostname: os.hostname(),
            version: appVersion,
            level: 'debug'
        };
        
        // Add trace ID if provided
        if (traceId) {
            logData.traceId = traceId;
        }
        
        // Check for duplicates before logging
        if (isDuplicateLog(logData)) {
            // Skip duplicate logs
            return;
        }
        
        logger.debug(logData);
        
        // Emit log event for UI subscribers
        logEmitter.emit('log', logData);
        
        // Debug log emission (only in development)
        if (process.env.NODE_ENV === 'development') {
            console.log(`[MonitoringService] Emitted debug log: ${message}`);
        }
    } catch (err) {
        // Prevent cascading errors by logging to console only
        console.error(`[MONITORING] Failed to log debug message: ${err.message}`);
    }
}

/**
 * Logs an error event.
 * @param {string} message - Error message
 * @param {Object} [context] - Additional context data
 * @param {string} [category] - Category for the log (e.g., 'api', 'graph', 'auth')
 * @param {string} [traceId] - Optional trace ID for request correlation
 */
function error(message, context = {}, category = '', traceId = null) {
    // EMERGENCY FIX: Skip all logging if memory usage is critical
    if (checkMemoryForEmergency()) {
        return;
    }
    
    if (!logger) initLogger();
    
    // Apply error throttling to prevent error storms
    if (!shouldLogError(category)) {
        // Skip logging this error due to throttling
        return;
    }
    
    try {
        // CRITICAL FIX: For calendar and graph API errors, apply extra filtering
        if ((category === 'calendar' || category === 'graph') && 
            (message.includes('Graph API request failed') || 
             message.includes('Unable to read error response'))) {
            // These errors are causing the memory issues - skip them completely
            // Just log to console for debugging but don't store or emit them
            if (process.env.NODE_ENV === 'development') {
                console.warn(`[FILTERED] ${category} error: ${message}`);
            }
            return;
        }
        
        const logData = {
            message,
            category,
            context,
            timestamp: new Date().toISOString(),
            pid: process.pid,
            hostname: os.hostname(),
            version: appVersion,
            level: 'error'
        };
        
        // Add trace ID if provided
        if (traceId) {
            logData.traceId = traceId;
        }
        
        // Check for duplicates before logging
        if (isDuplicateLog(logData)) {
            // Skip duplicate logs
            return;
        }
        
        logger.error(logData);
        
        // Emit log event for UI subscribers
        logEmitter.emit('log', logData);
        
        // Debug log emission (only in development)
        if (process.env.NODE_ENV === 'development') {
            console.log(`[MonitoringService] Emitted error log: ${message}`);
        }
    } catch (err) {
        // Last resort error handling - log to console only
        console.error(`[MONITORING] Failed to log error message: ${err.message}`);
        console.error(`[MONITORING] Original error: ${message}`);
    }
}

/**
 * Tracks a performance metric.
 * @param {string} name - Metric name
 * @param {number} value - Metric value
 * @param {Object} [context] - Additional context
 */
function trackMetric(name, value, context = {}) {
    if (!logger) initLogger();
    const logData = {
        type: 'metric',
        metric: name,
        value,
        context,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    };
    
    logger.info(logData);
    
    // Emit metric event for UI subscribers
    logEmitter.emit('metric', logData);
}

/**
 * Subscribes to log events for UI display.
 * @param {function} callback - Function to call with log data
 * @returns {function} Unsubscribe function
 */
function subscribeToLogs(callback) {
    logEmitter.on('log', callback);
    
    // Return unsubscribe function
    return () => {
        logEmitter.off('log', callback);
    };
}

/**
 * Subscribes to metric events for UI display.
 * @param {function} callback - Function to call with metric data
 * @returns {function} Unsubscribe function
 */
function subscribeToMetrics(callback) {
    logEmitter.on('metric', callback);
    
    // Return unsubscribe function
    return () => {
        logEmitter.off('metric', callback);
    };
}

/**
 * Gets the latest logs from the log files.
 * @param {number} [limit=100] - Maximum number of log entries to return
 * @returns {Promise<Array>} Array of log entries
 */
async function getLatestLogs(limit = 100) {
    return new Promise((resolve, reject) => {
        try {
            const logsDir = path.dirname(LOG_FILE_PATH);
            
            // Check if logs directory exists
            if (!fs.existsSync(logsDir)) {
                return resolve([]);
            }
            
            // Get all log files sorted by modification time (newest first)
            const logFiles = fs.readdirSync(logsDir)
                .filter(file => file.startsWith('mcp') && file.endsWith('.log'))
                .map(file => path.join(logsDir, file))
                .filter(file => fs.statSync(file).isFile())
                .sort((a, b) => fs.statSync(b).mtime.getTime() - fs.statSync(a).mtime.getTime());
            
            if (logFiles.length === 0) {
                return resolve([]);
            }
            
            const logs = [];
            
            // Read from up to 3 most recent log files
            for (let i = 0; i < Math.min(3, logFiles.length) && logs.length < limit; i++) {
                try {
                    const logContent = fs.readFileSync(logFiles[i], 'utf8');
                    const logLines = logContent.trim().split('\n');
                    
                    // Process from the end to get the most recent logs first
                    for (let j = logLines.length - 1; j >= 0 && logs.length < limit; j--) {
                        try {
                            if (logLines[j].trim()) {
                                const logEntry = JSON.parse(logLines[j]);
                                logs.push(logEntry);
                            }
                        } catch (e) {
                            // Skip invalid JSON lines
                            // Just silently ignore parse errors
                        }
                    }
                } catch (err) {
                    // Skip files that can't be read
                    // Just silently ignore file read errors
                }
            }
            
            // Cleanup old log files if there are more than 10
            if (logFiles.length > 10) {
                try {
                    // Remove oldest files, keeping the 10 most recent
                    for (let i = 10; i < logFiles.length; i++) {
                        fs.unlinkSync(logFiles[i]);
                    }
                } catch (err) {
                    // Silently ignore cleanup errors
                }
            }
            
            resolve(logs.reverse()); // Reverse to maintain chronological order
        } catch (error) {
            reject(error);
        }
    });
}

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
    logEmitter // Export for testing/direct access
};