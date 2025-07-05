/**
 * @fileoverview AuthService manages user-provided Microsoft Graph access tokens.
 * No client secret is used; only user-supplied tokens are accepted and securely stored.
 * Tokens are encrypted at rest using StorageService.
 * All methods are async and testable.
 */

const storageService = require('./storage-service.cjs');
const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');

const TOKEN_KEY = 'auth-token';

// Log service initialization
MonitoringService.info('Auth service initialized', {
    serviceName: 'auth-service',
    tokenKey: TOKEN_KEY,
    timestamp: new Date().toISOString()
}, 'auth');

/**
 * Stores the user's Microsoft Graph access token securely (encrypted).
 * @param {string} token - The access token to store
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<void>}
 * @throws {Error} If token is missing or invalid
 */
async function setToken(token, userId = null, sessionId = null) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Setting authentication token', {
            tokenLength: token ? token.length : 0,
            userId,
            sessionId,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        if (!token || typeof token !== 'string' || !token.trim()) {
            const mcpError = ErrorService.createError(
                'auth',
                'Invalid token: must be a non-empty string',
                'warning',
                {
                    tokenProvided: !!token,
                    tokenType: typeof token,
                    userId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Token validation failed', {
                    error: 'Invalid token format',
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Token validation failed', {
                    sessionId,
                    error: 'Invalid token format',
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            throw mcpError;
        }
        
        await storageService.setSecure(TOKEN_KEY, token);
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_set_token_success', executionTime, {
            timestamp: new Date().toISOString()
        });
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Authentication token stored successfully', {
                tokenLength: token.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Authentication token stored with session', {
                sessionId,
                tokenLength: token.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        } else {
            MonitoringService.info('Authentication token stored successfully', {
                tokenLength: token.length,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // If it's already an MCP error, just track metrics and rethrow
        if (error.category) {
            MonitoringService.trackMetric('auth_set_token_failure', executionTime, {
                errorType: error.code || 'validation_error',
                timestamp: new Date().toISOString()
            });
            
            // Pattern 4: User Error Tracking (for validation errors)
            if (userId) {
                MonitoringService.error('Token storage failed', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Token storage failed', {
                    sessionId,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            throw error;
        }
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            `Failed to set authentication token: ${error.message}`,
            'error',
            {
                stack: error.stack,
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_set_token_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Token storage failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Token storage failed', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        throw mcpError;
    }
}

/**
 * Retrieves the stored access token (decrypted).
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<string|null>} The access token, or null if not set
 */
async function getToken(userId = null, sessionId = null) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Retrieving authentication token', {
            userId,
            sessionId,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        const token = await storageService.getSecure(TOKEN_KEY);
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_get_token_success', executionTime, {
            tokenFound: !!token,
            timestamp: new Date().toISOString()
        });
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Authentication token retrieved successfully', {
                tokenFound: !!token,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Authentication token retrieved with session', {
                sessionId,
                tokenFound: !!token,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return token;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            `Failed to retrieve authentication token: ${error.message}`,
            'error',
            {
                stack: error.stack,
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_get_token_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Token retrieval failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Token retrieval failed', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        throw mcpError;
    }
}

/**
 * Returns true if a valid access token is stored, false otherwise.
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<boolean>}
 */
async function isAuthenticated(userId = null, sessionId = null) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Checking authentication status', {
            userId,
            sessionId,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        const token = await getToken(userId, sessionId);
        const isAuth = !!(token && typeof token === 'string' && token.trim());
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_check_success', executionTime, {
            isAuthenticated: isAuth,
            timestamp: new Date().toISOString()
        });
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Authentication check completed', {
                isAuthenticated: isAuth,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Authentication check completed with session', {
                sessionId,
                isAuthenticated: isAuth,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return isAuth;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            `Authentication check failed: ${error.message}`,
            'error',
            {
                stack: error.stack,
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_check_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Authentication check failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Authentication check failed', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        throw mcpError;
    }
}

/**
 * Clears the stored access token (logout).
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<void>}
 */
async function clearToken(userId = null, sessionId = null) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Clearing authentication token (logout)', {
            userId,
            sessionId,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        await storageService.setSecure(TOKEN_KEY, '');
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_clear_token_success', executionTime, {
            timestamp: new Date().toISOString()
        });
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Authentication token cleared successfully', {
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Authentication token cleared with session', {
                sessionId,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        } else {
            MonitoringService.info('Authentication token cleared successfully', {
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            `Failed to clear authentication token: ${error.message}`,
            'error',
            {
                stack: error.stack,
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_clear_token_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Token clearing failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Token clearing failed', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        throw mcpError;
    }
}

/**
 * Gets the most recently authenticated user for internal MCP adapter calls.
 * This allows the MCP adapter to use the authenticated session without handling auth itself.
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<object|null>} User object with token, or null if no authenticated user
 */
async function getMostRecentAuthenticatedUser(userId = null, sessionId = null) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting most recent authenticated user', {
            userId,
            sessionId,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        // Check if we have a valid token
        const token = await getToken(userId, sessionId);
        if (token && typeof token === 'string' && token.trim()) {
            // Return a user object with the token
            // In a real implementation, you might want to include user details from a database
            const user = {
                id: 'authenticated-user',
                name: 'Authenticated User',
                token: token
            };
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('auth_get_recent_user_success', executionTime, {
                userFound: true,
                timestamp: new Date().toISOString()
            });
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Most recent authenticated user retrieved', {
                    userFound: true,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Most recent authenticated user retrieved with session', {
                    sessionId,
                    userFound: true,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return user;
        }
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_get_recent_user_success', executionTime, {
            userFound: false,
            timestamp: new Date().toISOString()
        });
        
        // Pattern 2: User Activity Logs (no user found)
        if (userId) {
            MonitoringService.info('No authenticated user found', {
                userFound: false,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.info('No authenticated user found with session', {
                sessionId,
                userFound: false,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return null;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            `Error getting most recent authenticated user: ${error.message}`,
            'error',
            {
                stack: error.stack,
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_get_recent_user_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Failed to get recent authenticated user', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Failed to get recent authenticated user', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return null;
    }
}

/**
 * Gets a user by ID from storage.
 * @param {string} userId - The user ID to look up
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<object|null>} User object, or null if not found
 */
async function getUserById(userId, sessionId = null) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting user by ID', {
            userId,
            sessionId,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        // In a real implementation, you would look up the user in a database
        // For now, we'll just check if we have a valid token and return a user object
        if (userId && await isAuthenticated(userId, sessionId)) {
            const token = await getToken(userId, sessionId);
            const user = {
                id: userId,
                name: 'Authenticated User',
                token: token
            };
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('auth_get_user_by_id_success', executionTime, {
                userId,
                userFound: true,
                timestamp: new Date().toISOString()
            });
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('User retrieved by ID successfully', {
                    userFound: true,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else if (sessionId) {
                MonitoringService.info('User retrieved by ID with session', {
                    sessionId,
                    userFound: true,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return user;
        }
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_get_user_by_id_success', executionTime, {
            userId,
            userFound: false,
            timestamp: new Date().toISOString()
        });
        
        // Pattern 2: User Activity Logs (user not found)
        if (userId) {
            MonitoringService.info('User not found by ID', {
                userFound: false,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.info('User not found by ID with session', {
                sessionId,
                userFound: false,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return null;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            `Error getting user by ID: ${error.message}`,
            'error',
            {
                userId,
                sessionId,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_get_user_by_id_failure', executionTime, {
            userId,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Failed to get user by ID', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Failed to get user by ID', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return null;
    }
}

/**
 * Gets a user from a token.
 * @param {string} token - The token to use
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<object|null>} User object, or null if invalid
 */
async function getUserFromToken(token, userId = null, sessionId = null) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting user from token', {
            tokenLength: token ? token.length : 0,
            userId,
            sessionId,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        // In a real implementation, you would validate the token and look up the user
        // For now, we'll just return a user object if the token is valid
        if (token && typeof token === 'string' && token.trim()) {
            const user = {
                id: 'token-user',
                name: 'Token User',
                token: token
            };
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('auth_get_user_from_token_success', executionTime, {
                userFound: true,
                timestamp: new Date().toISOString()
            });
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('User retrieved from token successfully', {
                    userFound: true,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else if (sessionId) {
                MonitoringService.info('User retrieved from token with session', {
                    sessionId,
                    userFound: true,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return user;
        }
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_get_user_from_token_success', executionTime, {
            userFound: false,
            timestamp: new Date().toISOString()
        });
        
        // Pattern 2: User Activity Logs (invalid token)
        if (userId) {
            MonitoringService.info('Invalid token provided', {
                userFound: false,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Invalid token provided with session', {
                sessionId,
                userFound: false,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return null;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            `Error getting user from token: ${error.message}`,
            'error',
            {
                tokenLength: token ? token.length : 0,
                userId,
                sessionId,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_get_user_from_token_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Failed to get user from token', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Failed to get user from token', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return null;
    }
}

module.exports = {
    setToken,
    getToken,
    isAuthenticated,
    clearToken,
    getMostRecentAuthenticatedUser,
    getUserById,
    getUserFromToken
};
