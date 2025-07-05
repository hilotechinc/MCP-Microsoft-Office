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
const { resolveUserId } = require('../../core/user-id-resolver.cjs');

// No need to maintain a separate cache of logs - use monitoring service's circular buffer for global logs
// User-specific logs are retrieved from the database

/**
 * Add a log entry from the adapter or client
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function addLogEntry(req, res) {
    try {
        // Extract user context
        const { userId, deviceId } = req.user || {};
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing log entry addition request', {
                sessionId: req.session?.id,
                userId: userId || 'none',
                deviceId: deviceId || 'none',
                userAgent: req.get('User-Agent'),
                bodySize: JSON.stringify(req.body || {}).length,
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        const logEntry = req.body;
        
        // Validate log entry
        if (!logEntry) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'logs',
                'Invalid log entry format received',
                'error',
                { 
                    endpoint: '/api/logs',
                    body: req.body,
                    userId: userId || 'none',
                    sessionId: req.session?.id,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Log entry addition failed - invalid format', {
                    error: 'Invalid log entry format',
                    endpoint: '/api/logs',
                    timestamp: new Date().toISOString()
                }, 'logs', null, userId);
            } else if (req.session?.id) {
                MonitoringService.error('Log entry addition failed - invalid format', {
                    sessionId: req.session.id,
                    error: 'Invalid log entry format',
                    endpoint: '/api/logs',
                    timestamp: new Date().toISOString()
                }, 'logs');
            }
            
            return res.status(400).json({ 
                error: 'INVALID_LOG_ENTRY_FORMAT',
                error_description: 'Invalid log entry format' 
            });
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
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Log entry added successfully', {
                level,
                category: logEntry.category || 'external',
                messageLength: (logEntry.message || '').length,
                timestamp: new Date().toISOString()
            }, 'logs', null, userId);
        } else if (req.session?.id) {
            MonitoringService.info('Log entry added with session', {
                sessionId: req.session.id,
                level,
                category: logEntry.category || 'external',
                messageLength: (logEntry.message || '').length,
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Log entry processed successfully', {
                level,
                category: logEntry.category || 'external',
                userId: userId || 'none',
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        res.status(200).json({ success: true });
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'logs',
            `Error adding log entry: ${error.message}`,
            'error',
            { 
                endpoint: '/api/logs',
                error: error.message,
                stack: error.stack,
                userId: req.user?.userId || 'none',
                sessionId: req.session?.id,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        const userId = req.user?.userId;
        if (userId) {
            MonitoringService.error('Log entry addition failed', {
                error: error.message,
                endpoint: '/api/logs',
                timestamp: new Date().toISOString()
            }, 'logs', null, userId);
        } else if (req.session?.id) {
            MonitoringService.error('Log entry addition failed', {
                sessionId: req.session.id,
                error: error.message,
                endpoint: '/api/logs',
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        res.status(500).json({ 
            error: 'LOG_ENTRY_ADDITION_FAILED',
            error_description: 'Failed to add log entry' 
        });
    }
}

/**
 * Get log entries - either from user's persisted logs or global circular buffer
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getLogEntries(req, res) {
    try {
        // Extract user context
        const { userId: userIdFromAuth, deviceId } = req.user || {};
        
        // Get query parameters
        const { limit = '100', category, level, source, scope = 'user' } = req.query;
        const parsedLimit = parseInt(limit, 10) || 100;
        
        // Check if user is authenticated and resolve consistent user ID
        const userId = resolveUserId(req);
        const isAuthenticated = !!userId;
        
        // Pattern 1: Development Debug Logs
        // Only log if this is not an auto-refresh request to prevent feedback loops
        if ((req.headers['x-requested-by'] !== 'auto-refresh') && process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing log entries retrieval request', { 
                query: req.query,
                parsedLimit,
                requestId: req.requestId || 'none',
                userId: userId || 'none',
                userIdFromAuth: userIdFromAuth || 'none',
                deviceId: deviceId || 'none',
                isAuthenticated,
                scope,
                userAgent: req.get('User-Agent'),
                sessionId: req.session?.id,
                timestamp: new Date().toISOString()
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
                // Only log in development mode
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug(`Fetching user logs for userId: ${userId}`, {}, 'logs');
                }
                
                const userLogs = await StorageService.getUserLogs(userId, options);
                
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug(`Found ${userLogs ? userLogs.length : 0} user logs`, {}, 'logs');
                }
                
                if (userLogs && userLogs.length > 0) {
                    result = userLogs;
                    
                    if (process.env.NODE_ENV === 'development') {
                        MonitoringService.debug(`Using ${userLogs.length} user logs from database`, {}, 'logs');
                    }
                    
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
            // Only log in development mode
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug(`Falling back to system logs. User logs found: ${result.length}, scope: ${scope}`, {}, 'logs');
            }
            
            // Get logs from circular buffer
            const logs = MonitoringService.getLogBuffer().getAll();
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug(`Retrieved ${logs.length} system logs from circular buffer`, {}, 'logs');
            }
            
            // Apply filtering based on query parameters
            let filteredLogs = filterLogs(logs, { category, level });
            
            // If user is authenticated and we're not explicitly requesting global logs,
            // filter to only show logs that match the user's ID or have no user ID
            if (isAuthenticated && userId) {
                // Filter logs to only include those for the authenticated user
                // Do NOT include system logs (logs without userId) when fetching user logs
                filteredLogs = filteredLogs.filter(log => {
                    return log.userId === userId;
                });
            }
            
            // Sort by timestamp (newest first)
            filteredLogs.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
            
            // Limit final result to requested limit
            result = filteredLogs.slice(0, parsedLimit);
        }
        
        // Only log detailed info for non-auto-refresh requests to prevent feedback loops
        // Only log in development mode, never in production with silent mode
        // Also skip auto-refresh requests to prevent feedback loops
        const isAutoRefresh = req.headers['x-requested-by'] === 'auto-refresh';
        const isDevelopment = process.env.NODE_ENV === 'development';
        
        if (!isAutoRefresh && isDevelopment) {
            MonitoringService.debug('Returning log entries', { 
                requestedLimit: parsedLimit,
                returnedCount: result.length,
                userId: userId || 'none',
                scope,
                oldestEntryTime: result.length > 0 ? result[result.length-1].timestamp : 'none',
                newestEntryTime: result.length > 0 ? result[0].timestamp : 'none',
                categories: [...new Set(result.map(entry => entry.category || ''))],
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        // Pattern 2: User Activity Logs
        if (userIdFromAuth) {
            MonitoringService.info('Log entries retrieved successfully', {
                entriesCount: result.length,
                requestedLimit: parsedLimit,
                scope,
                category: category || 'all',
                level: level || 'all',
                timestamp: new Date().toISOString()
            }, 'logs', null, userIdFromAuth);
        } else if (req.session?.id) {
            MonitoringService.info('Log entries retrieved with session', {
                sessionId: req.session.id,
                entriesCount: result.length,
                requestedLimit: parsedLimit,
                scope,
                category: category || 'all',
                level: level || 'all',
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        res.status(200).json(result);
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'logs',
            `Error getting log entries: ${error.message}`,
            'error',
            { 
                endpoint: '/api/logs',
                error: error.message,
                stack: error.stack,
                userId: userIdFromAuth || 'none',
                sessionId: req.session?.id,
                queryParams: req.query,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userIdFromAuth) {
            MonitoringService.error('Log entries retrieval failed', {
                error: error.message,
                endpoint: '/api/logs',
                queryParams: req.query,
                timestamp: new Date().toISOString()
            }, 'logs', null, userIdFromAuth);
        } else if (req.session?.id) {
            MonitoringService.error('Log entries retrieval failed', {
                sessionId: req.session.id,
                error: error.message,
                endpoint: '/api/logs',
                queryParams: req.query,
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        res.status(500).json({ 
            error: 'LOG_ENTRIES_RETRIEVAL_FAILED',
            error_description: 'Failed to get log entries' 
        });
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
        // Extract user context
        const { userId: userIdFromAuth, deviceId } = req.user || {};
        
        const { scope = 'user' } = req.query;
        const { resolveUserId } = require('../../core/user-id-resolver.cjs');
        const userId = resolveUserId(req);
        const isAuthenticated = !!userId;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing log entries clearing request', {
                sessionId: req.session?.id,
                userId: userId || 'none',
                userIdFromAuth: userIdFromAuth || 'none',
                deviceId: deviceId || 'none',
                scope,
                isAuthenticated,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        // If user is authenticated and we're not explicitly clearing global logs,
        // clear only the user's logs
        if (isAuthenticated && scope !== 'global') {
            try {
                // Clear the user's logs from the database
                await StorageService.clearUserLogs(userId);
                
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('User logs cleared from database successfully', {
                        userId,
                        scope,
                        timestamp: new Date().toISOString()
                    }, 'logs');
                }
            } catch (storageError) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'logs',
                    `Failed to clear user logs from database: ${storageError.message}`,
                    'error',
                    {
                        endpoint: '/api/logs',
                        error: storageError.message,
                        userId,
                        scope,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userIdFromAuth) {
                    MonitoringService.error('Failed to clear user logs from database', {
                        error: storageError.message,
                        endpoint: '/api/logs',
                        scope,
                        timestamp: new Date().toISOString()
                    }, 'logs', null, userIdFromAuth);
                } else if (req.session?.id) {
                    MonitoringService.error('Failed to clear user logs from database', {
                        sessionId: req.session.id,
                        error: storageError.message,
                        endpoint: '/api/logs',
                        scope,
                        timestamp: new Date().toISOString()
                    }, 'logs');
                }
                
                throw storageError; // Re-throw to be caught by the outer catch block
            }
        } else {
            // Clear the global circular buffer in the monitoring service
            MonitoringService.getLogBuffer().clear();
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Global log buffer cleared successfully', {
                    scope,
                    timestamp: new Date().toISOString()
                }, 'logs');
            }
        }
        
        // Pattern 2: User Activity Logs
        if (userIdFromAuth) {
            MonitoringService.info('Log entries cleared successfully', {
                scope,
                clearType: isAuthenticated && scope !== 'global' ? 'user_database' : 'global_buffer',
                timestamp: new Date().toISOString()
            }, 'logs', null, userIdFromAuth);
        } else if (req.session?.id) {
            MonitoringService.info('Log entries cleared with session', {
                sessionId: req.session.id,
                scope,
                clearType: isAuthenticated && scope !== 'global' ? 'user_database' : 'global_buffer',
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        res.status(200).json({ success: true });
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'logs',
            `Error clearing log entries: ${error.message}`,
            'error',
            { 
                endpoint: '/api/logs',
                error: error.message,
                stack: error.stack,
                userId: userIdFromAuth || 'none',
                sessionId: req.session?.id,
                queryParams: req.query,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userIdFromAuth) {
            MonitoringService.error('Log entries clearing failed', {
                error: error.message,
                endpoint: '/api/logs',
                queryParams: req.query,
                timestamp: new Date().toISOString()
            }, 'logs', null, userIdFromAuth);
        } else if (req.session?.id) {
            MonitoringService.error('Log entries clearing failed', {
                sessionId: req.session.id,
                error: error.message,
                endpoint: '/api/logs',
                queryParams: req.query,
                timestamp: new Date().toISOString()
            }, 'logs');
        }
        
        res.status(500).json({ 
            error: 'LOG_ENTRIES_CLEARING_FAILED',
            error_description: 'Failed to clear log entries' 
        });
    }
}

module.exports = {
    addLogEntry,
    getLogEntries,
    clearLogEntries
};