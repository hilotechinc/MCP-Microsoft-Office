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

function info(msg) {
    if (!logger) initLogger();
    logger.info(msg);
}

function logError(error) {
    if (!logger) initLogger();
    logger.error(error);
}

module.exports = {
    initLogger,
    info,
    logError
};
