/**
 * @fileoverview Log controller for MCP API.
 * Handles logging from the adapter for UI display.
 * Now uses the improved monitoring-service.cjs for log storage and retrieval.
 */

const express = require('express');
const monitoringService = require('../../core/monitoring-service.cjs');
const errorService = require('../../core/error-service.cjs');

// In-memory cache for recent log entries (additionally to file logs)
let logEntries = [];
const MAX_LOG_ENTRIES = 200; // Limit the number of entries to prevent memory issues

/**
 * Initialize the log controller by subscribing to the monitoring service
 */
function initialize() {
    // Subscribe to log events from the monitoring service
    const unsubscribe = monitoringService.subscribeToLogs((logData) => {
        // Cache log for faster retrieval by API
        addToCachedLogs({
            timestamp: logData.timestamp,
            level: logData.level,
            category: logData.category || 'app',
            message: logData.message,
            data: logData.context || {}
        });
    });
    
    // Handle clean shutdown
    process.on('SIGINT', () => {
        unsubscribe();
    });
    
    process.on('SIGTERM', () => {
        unsubscribe();
    });
}

/**
 * Add a log entry to the in-memory cache
 */
function addToCachedLogs(logEntry) {
    // Add to log entries (at the beginning for newest first)
    logEntries.unshift(logEntry);
    
    // Trim log entries if needed
    if (logEntries.length > MAX_LOG_ENTRIES) {
        logEntries = logEntries.slice(0, MAX_LOG_ENTRIES);
    }
}

/**
 * Add a log entry from the adapter or client
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function addLogEntry(req, res) {
    try {
        // Log the request for debugging
        monitoringService.debug('Received log entry request', req.body, 'log-controller');
        
        const logEntry = req.body;
        
        // Validate log entry
        if (!logEntry) {
            monitoringService.error('Invalid log entry format', { body: req.body }, 'log-controller');
            return res.status(400).json({ error: 'Invalid log entry format' });
        }
        
        // Determine log level
        const level = logEntry.level || (logEntry.error ? 'error' : 'info');
        
        // Log to monitoring service
        if (level === 'error') {
            monitoringService.error(
                logEntry.message || 'External log entry', 
                logEntry.data || logEntry, 
                logEntry.category || 'external'
            );
        } else if (level === 'warn') {
            monitoringService.warn(
                logEntry.message || 'External log entry', 
                logEntry.data || logEntry, 
                logEntry.category || 'external'
            );
        } else {
            monitoringService.info(
                logEntry.message || 'External log entry', 
                logEntry.data || logEntry, 
                logEntry.category || 'external'
            );
        }
        
        // Also add to the in-memory cache directly
        addToCachedLogs({
            timestamp: logEntry.timestamp || new Date().toISOString(),
            level: level,
            category: logEntry.category || 'external',
            message: logEntry.message || 'External log entry',
            data: logEntry.data || logEntry
        });
        
        monitoringService.debug(`Added log entry. Total cached entries: ${logEntries.length}`, {}, 'log-controller');
        
        res.status(200).json({ success: true });
    } catch (error) {
        monitoringService.error('Error adding log entry', { error: error.message, stack: error.stack }, 'log-controller');
        res.status(500).json({ error: 'Failed to add log entry' });
    }
}

/**
 * Get log entries - combines cached entries with ones from the log file
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getLogEntries(req, res) {
    try {
        monitoringService.debug(`Getting log entries. Cached count: ${logEntries.length}`, {}, 'log-controller');
        
        // Parse query parameters
        const limit = parseInt(req.query.limit) || 100;
        const source = req.query.source; // 'cache', 'file', or undefined for both
        const level = req.query.level; // Filter by log level
        
        let result = [];
        
        // Get logs from in-memory cache if requested
        if (!source || source === 'cache') {
            let filteredCacheEntries = [...logEntries];
            
            // Apply level filter if provided
            if (level) {
                filteredCacheEntries = filteredCacheEntries.filter(entry => entry.level === level);
            }
            
            // Limit the number of entries
            filteredCacheEntries = filteredCacheEntries.slice(0, limit);
            
            result = [...filteredCacheEntries];
        }
        
        // Get logs from file if requested
        if ((!source || source === 'file') && result.length < limit) {
            try {
                // Get remaining entries to fetch
                const remainingLimit = limit - result.length;
                
                // Get logs from the monitoring service
                const fileEntries = await monitoringService.getLatestLogs(remainingLimit);
                
                // Apply level filter if provided
                let filteredFileEntries = fileEntries;
                if (level) {
                    filteredFileEntries = filteredFileEntries.filter(entry => entry.level === level);
                }
                
                // Combine results, ensuring no duplicates
                // Use timestamp as a key to detect duplicates
                const existingTimestamps = new Set(result.map(entry => entry.timestamp));
                for (const entry of filteredFileEntries) {
                    if (!existingTimestamps.has(entry.timestamp) && result.length < limit) {
                        result.push({
                            timestamp: entry.timestamp,
                            level: entry.level || 'info',
                            category: entry.category || 'app',
                            message: entry.message,
                            data: entry.context || {}
                        });
                        existingTimestamps.add(entry.timestamp);
                    }
                }
            } catch (fileError) {
                monitoringService.error('Error reading log file', { error: fileError.message }, 'log-controller');
                // Continue with just the cached entries
            }
        }
        
        // Sort by timestamp (newest first)
        result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Limit final result to requested limit
        result = result.slice(0, limit);
        
        res.status(200).json(result);
    } catch (error) {
        monitoringService.error('Error getting log entries', { error: error.message, stack: error.stack }, 'log-controller');
        res.status(500).json({ error: 'Failed to get log entries' });
    }
}

/**
 * Clear cached log entries
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function clearLogEntries(req, res) {
    try {
        logEntries = [];
        monitoringService.info('Cleared cached log entries', {}, 'log-controller');
        res.status(200).json({ success: true });
    } catch (error) {
        monitoringService.error('Error clearing log entries', { error: error.message, stack: error.stack }, 'log-controller');
        res.status(500).json({ error: 'Failed to clear log entries' });
    }
}

// Initialize the controller
initialize();

module.exports = {
    addLogEntry,
    getLogEntries,
    clearLogEntries
};