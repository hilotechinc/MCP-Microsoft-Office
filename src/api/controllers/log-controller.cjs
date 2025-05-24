/**
 * @fileoverview New Event-Based Log Controller for MCP API.
 * Uses monitoring service's circular buffer instead of maintaining separate cache.
 * Maintains backward compatibility with existing API endpoints.
 */

const express = require('express');
const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');

// No need to maintain a separate cache of logs - use monitoring service's circular buffer directly

/**
 * Add a log entry from the adapter or client
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function addLogEntry(req, res) {
    try {
        // Log the request for debugging (only in development)
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Received log entry request', req.body, 'logs');
        }
        
        const logEntry = req.body;
        
        // Validate log entry
        if (!logEntry) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API,
                'Invalid log entry format',
                ErrorService.SEVERITIES.WARNING,
                { body: req.body, timestamp: new Date().toISOString() }
            );
            MonitoringService.logError(mcpError);
            return res.status(400).json({ error: 'Invalid log entry format' });
        }
        
        // Determine log level
        const level = logEntry.level || (logEntry.error ? 'error' : 'info');
        
        // Log to monitoring service - this will automatically add to circular buffer
        if (level === 'error') {
            MonitoringService.error(
                logEntry.message || 'External log entry', 
                logEntry.data || logEntry, 
                logEntry.category || 'external'
            );
        } else if (level === 'warn') {
            MonitoringService.warn(
                logEntry.message || 'External log entry', 
                logEntry.data || logEntry, 
                logEntry.category || 'external'
            );
        } else {
            MonitoringService.info(
                logEntry.message || 'External log entry', 
                logEntry.data || logEntry, 
                logEntry.category || 'external'
            );
        }
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug(`Added log entry via monitoring service`, {
                level,
                category: logEntry.category || 'external'
            }, 'logs');
        }
        
        res.status(200).json({ success: true });
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.API,
            `Error adding log entry: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            { stack: error.stack, timestamp: new Date().toISOString() }
        );
        MonitoringService.logError(mcpError);
        res.status(500).json({ error: 'Failed to add log entry' });
    }
}

/**
 * Get log entries directly from monitoring service's circular buffer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getLogEntries(req, res) {
    try {
        // Get query parameters
        const { limit = '100', category, level, source } = req.query;
        const parsedLimit = parseInt(limit, 10) || 100;
        
        // Only log if this is not an auto-refresh request to prevent feedback loops
        if ((req.headers['x-requested-by'] !== 'auto-refresh') && process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Log entries requested', { 
                query: req.query,
                parsedLimit,
                requestId: req.requestId || 'none'
            }, 'logs');
        }
        
        // Get logs directly from monitoring service's circular buffer
        const logs = MonitoringService.getLogBuffer().getAll();
        
        // Apply filtering based on query parameters
        let filteredLogs = filterLogs(logs, { category, level });
        
        // Sort by timestamp (newest first)
        filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Limit final result to requested limit
        const result = filteredLogs.slice(0, parsedLimit);
        
        // Only log detailed info for non-auto-refresh requests to prevent feedback loops
        if ((req.headers['x-requested-by'] !== 'auto-refresh') && process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Returning log entries', { 
                requestedLimit: parsedLimit,
                returnedCount: result.length,
                totalInBuffer: logs.length,
                oldestEntryTime: result.length > 0 ? result[result.length-1].timestamp : 'none',
                newestEntryTime: result.length > 0 ? result[0].timestamp : 'none',
                categories: [...new Set(result.map(entry => entry.category))]
            }, 'logs');
        }
        
        res.status(200).json(result);
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.API,
            `Error getting log entries: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            { stack: error.stack, timestamp: new Date().toISOString() }
        );
        MonitoringService.logError(mcpError);
        res.status(500).json({ error: 'Failed to get log entries' });
    }
}

/**
 * Filter logs based on query parameters
 * @param {Array} logs - Array of log entries
 * @param {Object} filters - Filter criteria
 * @returns {Array} Filtered log entries
 */
function filterLogs(logs, filters) {
    return logs.filter(entry => {
        // Match category if provided
        if (filters.category && filters.category !== 'all') {
            if (filters.category === 'system') {
                // For system category, include entries with empty category too
                if (entry.category && entry.category !== 'system' && entry.category !== '') {
                    return false;
                }
            } else if (entry.category !== filters.category) {
                return false;
            }
        }
        
        // Match level if provided
        if (filters.level && entry.level !== filters.level && entry.severity !== filters.level) {
            return false;
        }
        
        return true;
    });
}

/**
 * Clear cached log entries - now clears monitoring service's circular buffer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function clearLogEntries(req, res) {
    try {
        // Clear the circular buffer in the monitoring service
        MonitoringService.getLogBuffer().clear();
        
        MonitoringService.info('Cleared log entries from circular buffer', {}, 'logs');
        res.status(200).json({ success: true });
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.API,
            `Error clearing log entries: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            { stack: error.stack, timestamp: new Date().toISOString() }
        );
        MonitoringService.logError(mcpError);
        res.status(500).json({ error: 'Failed to clear log entries' });
    }
}

module.exports = {
    addLogEntry,
    getLogEntries,
    clearLogEntries
};