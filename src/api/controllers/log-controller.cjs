/**
 * @fileoverview New Event-Based Log Controller for MCP API.
 * Uses monitoring service's circular buffer instead of maintaining separate cache.
 * Maintains backward compatibility with existing API endpoints.
 * Includes per-user session log filtering for authenticated users.
 */

const express = require('express');
const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');
const StorageService = require('../../core/storage-service.cjs');

// No need to maintain a separate cache of logs - use monitoring service's circular buffer for global logs
// User-specific logs are retrieved from the database

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
 * Get log entries - either from user's persisted logs or global circular buffer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getLogEntries(req, res) {
    try {
        // Get query parameters
        const { limit = '100', category, level, source, scope = 'user' } = req.query;
        const parsedLimit = parseInt(limit, 10) || 100;
        
        // Check if user is authenticated and we have user context
        const isAuthenticated = req.user && req.user.userId;
        const userId = isAuthenticated ? req.user.userId : null;
        
        // Only log if this is not an auto-refresh request to prevent feedback loops
        if ((req.headers['x-requested-by'] !== 'auto-refresh') && process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Log entries requested', { 
                query: req.query,
                parsedLimit,
                requestId: req.requestId || 'none',
                userId: userId || 'none',
                isAuthenticated,
                scope
            }, 'logs');
        }
        
        // Determine which logs to retrieve based on scope and authentication
        let result = [];
        
        if (isAuthenticated && scope !== 'global') {
            // Get user-specific logs from the database
            try {
                // Prepare options for getUserLogs
                const options = {
                    limit: parsedLimit,
                    offset: 0,
                    level: level || null,
                    category: category !== 'all' ? category : null
                };
                
                // Get user logs from storage service
                const userLogs = await StorageService.getUserLogs(userId, options);
                
                if (userLogs && userLogs.length > 0) {
                    result = userLogs;
                    
                    // Only log detailed info for non-auto-refresh requests
                    if ((req.headers['x-requested-by'] !== 'auto-refresh') && process.env.NODE_ENV === 'development') {
                        MonitoringService.debug('Retrieved user-specific logs', { 
                            userId,
                            count: userLogs.length,
                            oldestEntryTime: result.length > 0 ? result[result.length-1].timestamp : 'none',
                            newestEntryTime: result.length > 0 ? result[0].timestamp : 'none'
                        }, 'logs');
                    }
                }
            } catch (storageError) {
                // Log the error but fall back to in-memory logs
                MonitoringService.warn('Failed to retrieve user logs from storage, falling back to memory buffer', {
                    error: storageError.message,
                    userId
                }, 'logs');
            }
        }
        
        // If no user logs were found or we're requesting global logs, get from circular buffer
        if (result.length === 0 || scope === 'global') {
            // Get logs from monitoring service's circular buffer
            const logs = MonitoringService.getLogBuffer().getAll();
            
            // Apply filtering based on query parameters
            let filteredLogs = filterLogs(logs, { category, level });
            
            // If user is authenticated and we're not explicitly requesting global logs,
            // filter to only show logs that match the user's ID or have no user ID
            if (isAuthenticated && scope !== 'global') {
                filteredLogs = filteredLogs.filter(log => {
                    // Include logs that have matching userId or no userId at all
                    return (!log.userId || log.userId === userId);
                });
            }
            
            // Sort by timestamp (newest first)
            filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // Limit final result to requested limit
            result = filteredLogs.slice(0, parsedLimit);
        }
        
        // Only log detailed info for non-auto-refresh requests to prevent feedback loops
        if ((req.headers['x-requested-by'] !== 'auto-refresh') && process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Returning log entries', { 
                requestedLimit: parsedLimit,
                returnedCount: result.length,
                userId: userId || 'none',
                scope,
                oldestEntryTime: result.length > 0 ? result[result.length-1].timestamp : 'none',
                newestEntryTime: result.length > 0 ? result[0].timestamp : 'none',
                categories: [...new Set(result.map(entry => entry.category || ''))]
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
 * Clear log entries - either user's persisted logs or global circular buffer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function clearLogEntries(req, res) {
    try {
        const { scope = 'user' } = req.query;
        const isAuthenticated = req.user && req.user.userId;
        const userId = isAuthenticated ? req.user.userId : null;
        
        // If user is authenticated and we're not explicitly clearing global logs,
        // clear only the user's logs
        if (isAuthenticated && scope !== 'global') {
            try {
                // Clear the user's logs from the database
                await StorageService.clearUserLogs(userId);
                
                MonitoringService.info('Cleared user logs from database', { userId }, 'logs');
            } catch (storageError) {
                MonitoringService.error('Failed to clear user logs from database', {
                    error: storageError.message,
                    userId
                }, 'logs');
                throw storageError; // Re-throw to be caught by the outer catch block
            }
        } else {
            // Clear the global circular buffer in the monitoring service
            MonitoringService.getLogBuffer().clear();
            MonitoringService.info('Cleared log entries from circular buffer', { scope }, 'logs');
        }
        
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