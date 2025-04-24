/**
 * @fileoverview MonitoringService provides centralized logging for MCP Desktop.
 * Handles logging of errors, warnings, info, and performance metrics.
 * Uses Winston for log management and log rotation.
 */

const winston = require('winston');
const path = require('path');
const os = require('os');
const storageService = require('./storage-service.cjs');
const fs = require('fs');

// Allow dynamic log file path for testability
let logger = null;
let LOG_FILE_PATH = process.env.MCP_LOG_PATH || path.join(__dirname, '../../logs/mcp.log');

// Read version from package.json
let appVersion = 'unknown';
try {
    const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '../../package.json'), 'utf8'));
    appVersion = pkg.version || 'unknown';
} catch (e) {}

function initLogger(logFilePath, logLevel = 'info') {
    LOG_FILE_PATH = logFilePath || process.env.MCP_LOG_PATH || path.join(__dirname, '../../logs/mcp.log');
    logger = winston.createLogger({
        level: logLevel,
        defaultMeta: {
            pid: process.pid,
            hostname: os.hostname(),
            version: appVersion
        },
        format: winston.format.combine(
            winston.format.timestamp(),
            winston.format.json()
        ),
        transports: [
            new winston.transports.File({ filename: LOG_FILE_PATH, maxsize: 1048576, maxFiles: 5 }),
            new winston.transports.Console({ format: winston.format.simple() })
        ]
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
    logger.error({
        id: error.id,
        category: error.category,
        message: error.message,
        severity: error.severity,
        context: error.context,
        timestamp: error.timestamp,
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    });
}

/**
 * Logs an info event.
 * @param {string} message
 * @param {Object} [context]
 */
function info(message, context = {}) {
    if (!logger) initLogger();
    logger.info({
        message,
        context,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    });
}

/**
 * Logs a warning event.
 * @param {string} message
 * @param {Object} [context]
 */
function warn(message, context = {}) {
    if (!logger) initLogger();
    logger.warn({
        message,
        context,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    });
}

/**
 * Logs a debug event.
 * @param {string} message
 * @param {Object} [context]
 */
function debug(message, context = {}) {
    if (!logger) initLogger();
    logger.debug({
        message,
        context,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    });
}

/**
 * Tracks a performance metric.
 * @param {string} name - Metric name
 * @param {number} value - Metric value
 * @param {Object} [context] - Additional context
 */
function trackMetric(name, value, context = {}) {
    if (!logger) initLogger();
    logger.info({
        type: 'metric',
        metric: name,
        value,
        context,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        hostname: os.hostname(),
        version: appVersion
    });
}

module.exports = {
    logError,
    info,
    warn,
    debug,
    trackMetric,
    LOG_FILE_PATH,
    _resetLoggerForTest,
    initLogger
};
