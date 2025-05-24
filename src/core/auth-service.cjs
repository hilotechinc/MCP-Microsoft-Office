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
 * @returns {Promise<void>}
 * @throws {Error} If token is missing or invalid
 */
async function setToken(token) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Setting authentication token', {
            tokenLength: token ? token.length : 0,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        if (!token || typeof token !== 'string' || !token.trim()) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.AUTH,
                'Invalid token: must be a non-empty string',
                ErrorService.SEVERITIES.WARNING,
                {
                    tokenProvided: !!token,
                    tokenType: typeof token,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            throw mcpError;
        }
        
        await storageService.setSecure(TOKEN_KEY, token);
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_set_token_success', executionTime, {
            timestamp: new Date().toISOString()
        });
        
        MonitoringService.info('Authentication token stored successfully', {
            tokenLength: token.length,
            executionTimeMs: executionTime,
            timestamp: new Date().toISOString()
        }, 'auth');
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // If it's already an MCP error, just track metrics and rethrow
        if (error.category) {
            MonitoringService.trackMetric('auth_set_token_failure', executionTime, {
                errorType: error.code || 'validation_error',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
        
        // Otherwise, wrap in MCP error
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Failed to set authentication token: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_set_token_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

/**
 * Retrieves the stored access token (decrypted).
 * @returns {Promise<string|null>} The access token, or null if not set
 */
async function getToken() {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Retrieving authentication token', {
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
        
        return token;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Failed to retrieve authentication token: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_get_token_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

/**
 * Returns true if a valid access token is stored, false otherwise.
 * @returns {Promise<boolean>}
 */
async function isAuthenticated() {
    const startTime = Date.now();
    
    try {
        const token = await getToken();
        const isAuth = !!(token && typeof token === 'string' && token.trim());
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_check_success', executionTime, {
            isAuthenticated: isAuth,
            timestamp: new Date().toISOString()
        });
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Authentication check completed', {
                isAuthenticated: isAuth,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return isAuth;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Authentication check failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_check_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

/**
 * Clears the stored access token (logout).
 * @returns {Promise<void>}
 */
async function clearToken() {
    const startTime = Date.now();
    
    try {
        MonitoringService.info('Clearing authentication token (logout)', {
            timestamp: new Date().toISOString()
        }, 'auth');
        
        await storageService.setSecure(TOKEN_KEY, '');
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_clear_token_success', executionTime, {
            timestamp: new Date().toISOString()
        });
        
        MonitoringService.info('Authentication token cleared successfully', {
            executionTimeMs: executionTime,
            timestamp: new Date().toISOString()
        }, 'auth');
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Failed to clear authentication token: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_clear_token_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

/**
 * Gets the most recently authenticated user for internal MCP adapter calls.
 * This allows the MCP adapter to use the authenticated session without handling auth itself.
 * @returns {Promise<object|null>} User object with token, or null if no authenticated user
 */
async function getMostRecentAuthenticatedUser() {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting most recent authenticated user', {
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        // Check if we have a valid token
        const token = await getToken();
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
            
            return user;
        }
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_get_recent_user_success', executionTime, {
            userFound: false,
            timestamp: new Date().toISOString()
        });
        
        return null;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Error getting most recent authenticated user: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_get_recent_user_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        return null;
    }
}

/**
 * Gets a user by ID from storage.
 * @param {string} userId - The user ID to look up
 * @returns {Promise<object|null>} User object, or null if not found
 */
async function getUserById(userId) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting user by ID', {
            userId,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    try {
        // In a real implementation, you would look up the user in a database
        // For now, we'll just check if we have a valid token and return a user object
        if (userId && await isAuthenticated()) {
            const token = await getToken();
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
            
            return user;
        }
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_get_user_by_id_success', executionTime, {
            userId,
            userFound: false,
            timestamp: new Date().toISOString()
        });
        
        return null;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Error getting user by ID: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                userId,
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
        
        return null;
    }
}

/**
 * Gets a user from a token.
 * @param {string} token - The token to use
 * @returns {Promise<object|null>} User object, or null if invalid
 */
async function getUserFromToken(token) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting user from token', {
            tokenLength: token ? token.length : 0,
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
            
            return user;
        }
        
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('auth_get_user_from_token_success', executionTime, {
            userFound: false,
            timestamp: new Date().toISOString()
        });
        
        return null;
        
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Error getting user from token: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                tokenLength: token ? token.length : 0,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        MonitoringService.trackMetric('auth_get_user_from_token_failure', executionTime, {
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
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
