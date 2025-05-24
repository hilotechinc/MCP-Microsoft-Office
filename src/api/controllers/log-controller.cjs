/**
 * @fileoverview Log controller for MCP API.
 * Handles logging from the adapter for UI display.
 * Now uses the improved monitoring-service.cjs for log storage and retrieval.
 */

const express = require('express');
const monitoringService = require('../../core/monitoring-service.cjs');
const errorService = require('../../core/error-service.cjs');

// Use a Map instead of an array for O(1) lookups and built-in deduplication
// The key is a unique identifier for the log entry, the value is the log entry itself
const logEntriesMap = new Map();
const MAX_LOG_ENTRIES = 50; // Drastically reduced limit to prevent memory issues

// Keep track of entry order for retrieval (newest first)
const logEntryOrder = [];

// Track the last time we cleaned up old entries
let lastCleanupTime = Date.now();

// Set to track preserved log IDs to prevent them from being re-emitted
const preservedLogIds = new Set();
const MAX_PRESERVED_IDS = 100; // Reduced maximum number of preserved log IDs to track

// Track categories with high log volume for more aggressive cleanup
const categoryLogCounts = new Map();
const CATEGORY_THRESHOLD = 10; // Maximum logs per category before aggressive cleanup

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
 * Add a log entry to the in-memory cache with deduplication
 * @param {Object} logEntry - The log entry to add
 */
function addToCachedLogs(logEntry) {
    // Check if this is a preserved log entry
    const isPreserved = !!logEntry.preserved || !!logEntry.originalTimestamp;
    
    // Normalize the log entry to ensure consistent format
    const normalizedEntry = normalizeLogEntry(logEntry);
    
    // Create a unique identifier for this log entry
    const entryId = generateLogId(normalizedEntry);
    
    // Get the category for category-based limiting
    const category = normalizedEntry.category || 'unknown';
    
    // Track category counts for aggressive cleanup of noisy categories
    if (!categoryLogCounts.has(category)) {
        categoryLogCounts.set(category, 1);
    } else {
        categoryLogCounts.set(category, categoryLogCounts.get(category) + 1);
    }
    
    // If a category is generating too many logs, aggressively clean it up
    // This prevents any single category from overwhelming the log system
    if (categoryLogCounts.get(category) > CATEGORY_THRESHOLD) {
        // Reset the counter
        categoryLogCounts.set(category, 0);
        
        // Find and remove older logs from this category
        const categoryEntriesToRemove = [];
        let count = 0;
        
        // Find entries from this category to remove (keep newest 3)
        for (const id of logEntryOrder) {
            const entry = logEntriesMap.get(id);
            if (entry && (entry.category === category)) {
                count++;
                if (count > 3) { // Keep only the 3 newest entries from this category
                    categoryEntriesToRemove.push(id);
                }
            }
        }
        
        // Remove the identified entries
        for (const id of categoryEntriesToRemove) {
            logEntriesMap.delete(id);
            const index = logEntryOrder.indexOf(id);
            if (index !== -1) {
                logEntryOrder.splice(index, 1);
            }
        }
    }
    
    // CRITICAL FIX: Completely ignore preserved logs as they're causing memory growth
    if (isPreserved) {
        // Skip ALL preserved logs - they're causing the memory issues
        return;
    }
    
    // We're no longer tracking preserved logs at all
    // This is a drastic measure to prevent memory growth
    
    // Skip if we've already processed this exact log entry recently
    if (logEntriesMap.has(entryId)) {
        return;
    }
    
    // Add to map with the unique ID as the key
    logEntriesMap.set(entryId, normalizedEntry);
    
    // Add to the order array (newest first)
    logEntryOrder.unshift(entryId);
    
    // Always perform cleanup if we've exceeded 80% of the limit
    // This is more aggressive than before to prevent memory issues
    if (logEntryOrder.length > MAX_LOG_ENTRIES * 0.8) {
        cleanupOldEntries();
    }
    
    // Periodically perform a full cleanup (every 1 minute - more frequent than before)
    const now = Date.now();
    if (now - lastCleanupTime > 60 * 1000) {
        lastCleanupTime = now;
        performFullCleanup();
    }
}

/**
 * Normalize a log entry to ensure consistent format
 * @param {Object} logEntry - The log entry to normalize
 * @returns {Object} - Normalized log entry
 */
function normalizeLogEntry(logEntry) {
    // Create a clean entry with only the essential fields
    const normalizedEntry = {
        timestamp: logEntry.timestamp || new Date().toISOString(),
        level: logEntry.level || 'info',
        category: logEntry.category || '',
        message: logEntry.message || '',
        data: logEntry.data || {}
    };
    
    // Only add originalTimestamp if it exists and is different from the current timestamp
    // This helps with deduplication of preserved logs
    if (logEntry.originalTimestamp && logEntry.originalTimestamp !== normalizedEntry.timestamp) {
        normalizedEntry.originalTimestamp = logEntry.originalTimestamp;
    }
    
    // Never propagate the preserved flag to prevent endless preservation
    // Instead, we track preserved logs separately using the preservedLogIds set
    
    return normalizedEntry;
}

/**
 * Generate a unique identifier for a log entry to prevent duplicates
 * @param {Object} logEntry - The log entry to generate an ID for
 * @returns {string} A unique identifier based on the log entry content
 */
function generateLogId(logEntry) {
    // Extract relevant fields for deduplication
    // Use originalTimestamp if available, otherwise use timestamp
    const timestamp = logEntry.originalTimestamp || logEntry.timestamp;
    const category = logEntry.category || '';
    const level = logEntry.level || '';
    const message = logEntry.message || '';
    
    // Include data fields if they exist and are simple types
    let dataString = '';
    if (logEntry.data) {
        try {
            // Only include certain keys that are useful for deduplication
            const relevantKeys = ['error', 'errorCode', 'statusCode', 'requestId', 'path', 'method'];
            const relevantData = {};
            
            for (const key of relevantKeys) {
                if (logEntry.data[key] !== undefined) {
                    // Only include primitive values, not objects or arrays
                    const value = logEntry.data[key];
                    if (typeof value !== 'object' || value === null) {
                        relevantData[key] = value;
                    }
                }
            }
            
            if (Object.keys(relevantData).length > 0) {
                dataString = JSON.stringify(relevantData);
            }
        } catch (e) {
            // Ignore errors in data serialization
        }
    }
    
    // Create a unique hash by combining these fields
    // Include only the first 50 chars of message to keep IDs manageable
    return `${timestamp}:${category}:${level}:${message.substring(0, 50)}${dataString ? ':' + dataString : ''}`;
}

/**
 * Clean up old entries when we exceed the maximum limit
 */
function cleanupOldEntries() {
    // Calculate how many entries to remove - more aggressive cleanup
    // Remove enough to get down to 70% of the maximum to prevent frequent cleanups
    const targetSize = Math.floor(MAX_LOG_ENTRIES * 0.7);
    const entriesToRemove = logEntryOrder.length - targetSize;
    
    if (entriesToRemove <= 0) {
        return;
    }
    
    // Prioritize removing error logs from high-volume categories first
    const highVolumeCategories = new Set();
    
    // Identify high-volume categories
    for (const [category, count] of categoryLogCounts.entries()) {
        if (count > CATEGORY_THRESHOLD / 2) { // Lower threshold for cleanup
            highVolumeCategories.add(category);
        }
    }
    
    // First pass: find entries from high-volume categories to remove
    const entriesToRemoveByCategory = [];
    let remainingToRemove = entriesToRemove;
    
    // Start from the oldest entries (end of the array)
    for (let i = logEntryOrder.length - 1; i >= 0 && remainingToRemove > 0; i--) {
        const entryId = logEntryOrder[i];
        const entry = logEntriesMap.get(entryId);
        
        if (entry && highVolumeCategories.has(entry.category)) {
            entriesToRemoveByCategory.push(entryId);
            remainingToRemove--;
        }
    }
    
    // Second pass: if we still need to remove more, take the oldest entries regardless of category
    let oldestEntries = [];
    if (remainingToRemove > 0) {
        oldestEntries = logEntryOrder.splice(-remainingToRemove);
    }
    
    // Remove the identified entries from the order array
    for (const entryId of entriesToRemoveByCategory) {
        const index = logEntryOrder.indexOf(entryId);
        if (index !== -1) {
            logEntryOrder.splice(index, 1);
        }
    }
    
    // Remove from the map as well
    for (const entryId of [...entriesToRemoveByCategory, ...oldestEntries]) {
        logEntriesMap.delete(entryId);
    }
    
    // Only log this at a lower frequency to avoid creating more logs during cleanup
    const now = Date.now();
    if (now - lastCleanupTime > 30 * 1000) { // Only log cleanup details every 30 seconds
        monitoringService.debug(`Cleaned up ${entriesToRemoveByCategory.length + oldestEntries.length} log entries`, {
            byCategory: entriesToRemoveByCategory.length,
            byAge: oldestEntries.length,
            remaining: logEntryOrder.length,
            mapSize: logEntriesMap.size
        }, 'log-controller');
    }
}

/**
 * Perform a full cleanup of the log entries
 * This ensures that the map and order array stay in sync
 */
function performFullCleanup() {
    // Ensure the order array only contains valid IDs
    const validIds = new Set(logEntriesMap.keys());
    const newOrder = logEntryOrder.filter(id => validIds.has(id));
    
    // Replace the order array
    logEntryOrder.length = 0;
    logEntryOrder.push(...newOrder);
    
    // Ensure we don't exceed the maximum limit
    if (logEntryOrder.length > MAX_LOG_ENTRIES) {
        cleanupOldEntries();
    }
    
    monitoringService.debug(`Performed full log cleanup`, {
        entriesInMap: logEntriesMap.size,
        entriesInOrder: logEntryOrder.length
    }, 'log-controller');
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
        
        // Normalize the log entry using our helper function
        const normalizedEntry = normalizeLogEntry({
            timestamp: logEntry.timestamp || new Date().toISOString(),
            level: level,
            category: logEntry.category || 'external',
            message: logEntry.message || 'External log entry',
            data: logEntry.data || {},
            originalTimestamp: logEntry.originalTimestamp || null
        });
        
        // Add to the in-memory cache with deduplication
        addToCachedLogs(normalizedEntry);
        
        monitoringService.debug(`Added log entry. Total cached entries: ${logEntriesMap.size}`, {
            orderSize: logEntryOrder.length,
            originalTimestamp: normalizedEntry.originalTimestamp
        }, 'log-controller');
        
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
        // EMERGENCY FIX: Clear all logs if we're approaching memory limits
        // This is a safety valve to prevent crashes
        if (logEntriesMap.size > 1000 || logEntryOrder.length > 1000) {
            monitoringService.warn('Emergency log cleanup triggered', {
                mapSize: logEntriesMap.size,
                orderSize: logEntryOrder.length
            }, 'log-controller');
            
            // Clear everything except the most recent 20 logs
            const recentLogs = [];
            for (let i = 0; i < Math.min(20, logEntryOrder.length); i++) {
                const id = logEntryOrder[i];
                if (logEntriesMap.has(id)) {
                    recentLogs.push({ id, entry: logEntriesMap.get(id) });
                }
            }
            
            // Clear everything
            logEntriesMap.clear();
            logEntryOrder.length = 0;
            preservedLogIds.clear();
            categoryLogCounts.clear();
            
            // Add back only the most recent logs
            for (const { id, entry } of recentLogs) {
                logEntriesMap.set(id, entry);
                logEntryOrder.push(id);
            }
        }
        
        // Get query parameters
        const { limit = '100', category, level, source } = req.query;
        const parsedLimit = parseInt(limit, 10) || 100;
        
        // We're not logging every log request to prevent feedback loops
        // Only log if this is not an auto-refresh request or if we're in development
        if ((req.headers['x-requested-by'] !== 'auto-refresh') && process.env.NODE_ENV === 'development') {
            monitoringService.debug('Log entries requested', { 
                query: req.query,
                parsedLimit,
                requestId: req.requestId || 'none',
                mapSize: logEntriesMap.size,
                orderSize: logEntryOrder.length
            }, 'log-controller');
        }
        
        // Get cached log entries
        let result = [];
        let fileEntriesNeeded = parsedLimit;
        
        // If we're not explicitly requesting file logs only
        if (!source || source !== 'file') {
            // Track unique log IDs to avoid duplicates
            const uniqueIds = new Set();
            
            // Get entries from the map in the correct order
            for (const entryId of logEntryOrder) {
                // Get the entry from the map
                const entry = logEntriesMap.get(entryId);
                if (!entry) continue; // Skip if entry doesn't exist (shouldn't happen)
                
                // Match category if provided
                if (category && category !== 'all') {
                    if (category === 'system') {
                        // For system category, include entries with empty category too
                        if (entry.category && entry.category !== 'system' && entry.category !== '') {
                            continue; // Skip this entry
                        }
                    } else if (entry.category !== category) {
                        continue; // Skip this entry
                    }
                }
                
                // Match level if provided
                if (level && entry.level !== level && entry.severity !== level) {
                    continue; // Skip this entry
                }
                
                // Skip duplicates (shouldn't happen with our Map-based approach, but just in case)
                const logId = generateLogId(entry);
                if (uniqueIds.has(logId)) {
                    continue;
                }
                uniqueIds.add(logId);
                
                // Add to result if it passed all filters
                result.push(entry);
                
                // Stop if we've reached the limit
                if (result.length >= parsedLimit) {
                    break;
                }
            }
            
            // Update how many file entries we need
            fileEntriesNeeded = parsedLimit - result.length;
            
            monitoringService.debug(`Found ${result.length} cached log entries matching criteria`, {
                category,
                level,
                limit: parsedLimit,
                uniqueEntries: uniqueIds.size,
                fileEntriesNeeded
            }, 'log-controller');
        }
        
        // DISABLED: File log reading functionality to prevent errors
        // We're only using in-memory logs now to avoid the issues with file reading
        if (fileEntriesNeeded > 0 && (!source || source !== 'cache')) {
            // We've completely disabled file log reading to prevent errors
            // No need to log anything here as it creates unnecessary log entries
            // that can cause feedback loops with auto-refresh
            
            // Instead of trying to read from files which is causing errors,
            // we'll just use what we have in memory
        }
        
        // Sort by timestamp (newest first)
        result.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
        
        // Limit final result to requested limit
        result = result.slice(0, parsedLimit);
        
        // Only log detailed info for non-auto-refresh requests to prevent feedback loops
        if ((req.headers['x-requested-by'] !== 'auto-refresh') && process.env.NODE_ENV === 'development') {
            monitoringService.debug('Returning log entries', { 
                requestedLimit: parsedLimit,
                returnedCount: result.length,
                oldestEntryTime: result.length > 0 ? result[result.length-1].timestamp : 'none',
                newestEntryTime: result.length > 0 ? result[0].timestamp : 'none',
                categories: [...new Set(result.map(entry => entry.category))]
            }, 'log-controller');
        }
        
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