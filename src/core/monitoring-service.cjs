/**
 * @fileoverview MonitoringService provides centralized logging for MCP Desktop.
 * Handles logging of errors, warnings, info, and performance metrics.
 * Uses Winston for log management and log rotation.
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
    const logData = {
        id: error.id,
        category: error.category,
        message: error.message,
        severity: error.severity,
        context: error.context,
        timestamp: error.timestamp,
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    };
    
    logger.error(logData);
    
    // Emit log event for UI subscribers
    logEmitter.emit('log', {
        level: 'error',
        ...logData
    });
}

/**
 * Logs an info event.
 * @param {string} message - Log message
 * @param {Object} [context] - Additional context data
 * @param {string} [category] - Category for the log (e.g., 'api', 'graph', 'auth')
 */
function info(message, context = {}, category = '') {
    if (!logger) initLogger();
    const logData = {
        message,
        category,
        context,
        severity: 'info',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    };
    
    logger.info(logData);
    
    // Ensure context is serializable for event emission
    const safeContext = JSON.parse(JSON.stringify({
        ...context,
        _logType: 'info',
        _category: category
    }));
    
    // Emit log event for UI subscribers with safe context
    logEmitter.emit('log', {
        ...logData,
        context: safeContext
    });
    
    // Debug log emission
    console.log(`[MonitoringService] Emitted info log: ${message}`);
}

/**
 * Logs a warning event.
 * @param {string} message - Log message
 * @param {Object} [context] - Additional context data
 * @param {string} [category] - Category for the log (e.g., 'api', 'graph', 'auth')
 */
function warn(message, context = {}, category = '') {
    if (!logger) initLogger();
    const logData = {
        message,
        category,
        context,
        severity: 'warn',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    };
    
    logger.warn(logData);
    
    // Ensure context is serializable for event emission
    const safeContext = JSON.parse(JSON.stringify({
        ...context,
        _logType: 'warn',
        _category: category
    }));
    
    // Emit log event for UI subscribers with safe context
    logEmitter.emit('log', {
        level: 'warn',
        ...logData,
        context: safeContext
    });
}

/**
 * Logs a debug event.
 * @param {string} message - Log message
 * @param {Object} [context] - Additional context data
 * @param {string} [category] - Category for the log (e.g., 'api', 'graph', 'auth')
 */
function debug(message, context = {}, category = '') {
    if (!logger) initLogger();
    const logData = {
        message,
        category,
        context,
        severity: 'debug',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    };
    
    logger.debug(logData);
    
    try {
        // Ensure context is serializable for event emission
        const safeContext = JSON.parse(JSON.stringify({
            ...context,
            _logType: 'debug',
            _category: category
        }));
        
        // Emit log event for UI subscribers with safe context
        logEmitter.emit('log', {
            ...logData,
            context: safeContext
        });
    } catch (e) {
        console.error('Error emitting debug log:', e);
        // Emit a simplified log if serialization fails
        logEmitter.emit('log', {
            message,
            category,
            severity: 'debug',
            timestamp: new Date().toISOString(),
            context: { error: 'Context serialization failed' }
        });
    }
}

/**
 * Logs an error event.
 * @param {string} message - Error message
 * @param {Object} [context] - Additional context data
 * @param {string} [category] - Category for the log (e.g., 'api', 'graph', 'auth')
 */
function error(message, context = {}, category = '') {
    if (!logger) initLogger();
    const logData = {
        message,
        category,
        context,
        severity: 'error',
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    };
    
    logger.error(logData);
    
    try {
        // Ensure context is serializable for event emission
        const safeContext = JSON.parse(JSON.stringify({
            ...context,
            _logType: 'error',
            _category: category
        }));
        
        // Emit log event for UI subscribers with safe context
        logEmitter.emit('log', {
            ...logData,
            context: safeContext
        });
        
        console.error(`[MonitoringService] Emitted error log: ${message}`);
    } catch (e) {
        console.error('Error emitting error log:', e);
        // Emit a simplified log if serialization fails
        logEmitter.emit('log', {
            message,
            category,
            severity: 'error',
            timestamp: new Date().toISOString(),
            context: { error: 'Context serialization failed', originalMessage: message }
        });
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