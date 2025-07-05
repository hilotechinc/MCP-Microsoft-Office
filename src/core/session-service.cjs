/**
 * @fileoverview Session Service for MCP Microsoft Office
 * Manages user sessions, linking Microsoft Graph tokens to session IDs
 * Enables multi-user support with session-based isolation
 */

const { v4: uuid } = require('uuid');
const crypto = require('crypto');
const ErrorService = require('./error-service.cjs');
const MonitoringService = require('./monitoring-service.cjs');
const StorageService = require('./storage-service.cjs');

// Session configuration
const SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours
const CLEANUP_INTERVAL = 60 * 60 * 1000; // 1 hour
const SESSION_SECRET_LENGTH = 32;

class SessionService {
    constructor() {
        this.cleanupInterval = null;
        this.startCleanupTimer();
    }

    /**
     * Create a new user session
     * @param {Object} options - Session options
     * @param {string} [options.userAgent] - User agent string
     * @param {string} [options.ipAddress] - Client IP address
     * @param {string} [userId] - User ID for logging context
     * @param {string} [sessionId] - Session ID for logging context
     * @returns {Promise<Object>} Session data
     */
    async createSession(options = {}, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session creation request', {
                userAgent: options.userAgent,
                ipAddress: options.ipAddress,
                sessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, sessionId);
        }
        
        try {
            const newSessionId = uuid();
            const sessionSecret = crypto.randomBytes(SESSION_SECRET_LENGTH).toString('hex');
            const expiresAt = Date.now() + SESSION_EXPIRY;
            const createdAt = Date.now();

            const sessionData = {
                session_id: newSessionId,
                session_secret: sessionSecret,
                expires_at: expiresAt,
                created_at: createdAt,
                last_seen: createdAt,
                user_agent: options.userAgent || 'Unknown',
                ip_address: options.ipAddress || 'Unknown',
                is_active: true,
                microsoft_token: null,
                microsoft_refresh_token: null,
                microsoft_token_expires_at: null,
                user_info: null
            };

            // Store session in database
            await this.storeSession(sessionData, userId, sessionId);

            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Session created successfully', {
                    sessionId: newSessionId,
                    expiresAt: new Date(expiresAt).toISOString(),
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, sessionId);
            } else if (sessionId) {
                MonitoringService.info('Session created with session context', {
                    sessionId: newSessionId,
                    contextSessionId: sessionId,
                    expiresAt: new Date(expiresAt).toISOString(),
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'session');
            }

            MonitoringService.trackMetric('session_creation_success', Date.now() - startTime, {
                timestamp: new Date().toISOString()
            }, userId, null, null, sessionId);

            return {
                session_id: newSessionId,
                session_secret: sessionSecret,
                expires_at: expiresAt,
                expires_in: SESSION_EXPIRY / 1000
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Session creation failed',
                'error',
                {
                    userAgent: options.userAgent,
                    ipAddress: options.ipAddress,
                    error: error.message,
                    stack: error.stack,
                    operation: 'createSession',
                    userId,
                    sessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, sessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Session creation failed', {
                    error: error.message,
                    operation: 'createSession',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, sessionId);
            } else if (sessionId) {
                MonitoringService.error('Session creation failed', {
                    sessionId,
                    error: error.message,
                    operation: 'createSession',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            MonitoringService.trackMetric('session_creation_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            }, userId, null, null, sessionId);
            
            throw mcpError;
        }
    }

    /**
     * Get session by ID
     * @param {string} sessionId - Session ID
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     * @returns {Promise<Object|null>} Session data or null
     */
    async getSession(sessionId, userId, contextSessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session retrieval request', {
                sessionId: sessionId?.substring(0, 8) + '...',
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const rows = await connection.query(
                    'SELECT * FROM user_sessions WHERE session_id = ? AND expires_at > ? AND is_active = 1',
                    [sessionId, Date.now()]
                );
                await connection.close();
                
                const sessionData = rows.length > 0 ? rows[0] : null;
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('Session retrieved successfully', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        found: !!sessionData,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session', null, userId, null, contextSessionId);
                } else if (contextSessionId) {
                    MonitoringService.info('Session retrieved with session context', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        contextSessionId,
                        found: !!sessionData,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
                
                return sessionData;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Failed to retrieve session',
                'error',
                {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    error: error.message,
                    stack: error.stack,
                    operation: 'getSession',
                    userId,
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, contextSessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Session retrieval failed', {
                    error: error.message,
                    operation: 'getSession',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.error('Session retrieval failed', {
                    contextSessionId,
                    error: error.message,
                    operation: 'getSession',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            return null;
        }
    }

    /**
     * Update session with Microsoft Graph tokens
     * @param {string} sessionId - Session ID
     * @param {Object} tokenData - Microsoft Graph token data
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     * @returns {Promise<boolean>} Success status
     */
    async updateSessionTokens(sessionId, tokenData, userId, contextSessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session token update request', {
                sessionId: sessionId?.substring(0, 8) + '...',
                hasAccessToken: !!tokenData.accessToken,
                hasRefreshToken: !!tokenData.refreshToken,
                hasAccount: !!tokenData.account,
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                // Safely serialize account data
                let userInfoJson = null;
                if (tokenData.account) {
                    try {
                        userInfoJson = JSON.stringify(tokenData.account);
                    } catch (serializeError) {
                        // If serialization fails, create a safe version
                        userInfoJson = JSON.stringify({
                            username: tokenData.account.username || 'unknown',
                            name: tokenData.account.name || 'Unknown User'
                        });
                    }
                }

                const result = await connection.query(
                    `UPDATE user_sessions SET 
                     microsoft_token = ?, 
                     microsoft_refresh_token = ?, 
                     microsoft_token_expires_at = ?,
                     user_info = ?,
                     last_seen = ? 
                     WHERE session_id = ?`,
                    [
                        tokenData.accessToken,
                        tokenData.refreshToken,
                        tokenData.expiresOn ? new Date(tokenData.expiresOn).getTime() : null,
                        userInfoJson,
                        Date.now(),
                        sessionId
                    ]
                );
                await connection.close();
                
                const success = result.changes > 0;
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('Session tokens updated successfully', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        hasAccessToken: !!tokenData.accessToken,
                        hasRefreshToken: !!tokenData.refreshToken,
                        updated: success,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session', null, userId, null, contextSessionId);
                } else if (contextSessionId) {
                    MonitoringService.info('Session tokens updated with session context', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        contextSessionId,
                        hasAccessToken: !!tokenData.accessToken,
                        hasRefreshToken: !!tokenData.refreshToken,
                        updated: success,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
                
                return success;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Failed to update session tokens',
                'error',
                {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    hasAccessToken: !!tokenData.accessToken,
                    hasRefreshToken: !!tokenData.refreshToken,
                    error: error.message,
                    stack: error.stack,
                    operation: 'updateSessionTokens',
                    userId,
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, contextSessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Session token update failed', {
                    error: error.message,
                    operation: 'updateSessionTokens',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.error('Session token update failed', {
                    contextSessionId,
                    error: error.message,
                    operation: 'updateSessionTokens',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            return false;
        }
    }

    /**
     * Get session with valid Microsoft Graph token
     * @param {string} sessionId - Session ID
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     * @returns {Promise<Object|null>} Session with token or null
     */
    async getSessionWithToken(sessionId, userId, contextSessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session with token retrieval request', {
                sessionId: sessionId?.substring(0, 8) + '...',
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        try {
            const session = await this.getSession(sessionId, userId, contextSessionId);
            
            if (!session || !session.microsoft_token) {
                // Pattern 2: User Activity Logs (for null result)
                if (userId) {
                    MonitoringService.info('Session with token not found', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        hasSession: !!session,
                        hasToken: !!(session?.microsoft_token),
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session', null, userId, null, contextSessionId);
                } else if (contextSessionId) {
                    MonitoringService.info('Session with token not found (session context)', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        contextSessionId,
                        hasSession: !!session,
                        hasToken: !!(session?.microsoft_token),
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
                return null;
            }

            // Check if token is expired
            if (session.microsoft_token_expires_at && session.microsoft_token_expires_at < Date.now()) {
                // Pattern 2: User Activity Logs (for expired token)
                if (userId) {
                    MonitoringService.info('Session token expired', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        expiredAt: new Date(session.microsoft_token_expires_at).toISOString(),
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session', null, userId, null, contextSessionId);
                } else if (contextSessionId) {
                    MonitoringService.info('Session token expired (session context)', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        contextSessionId,
                        expiredAt: new Date(session.microsoft_token_expires_at).toISOString(),
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
                return null;
            }

            // Pattern 2: User Activity Logs (for successful retrieval)
            if (userId) {
                MonitoringService.info('Session with token retrieved successfully', {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    hasValidToken: true,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.info('Session with token retrieved successfully (session context)', {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    contextSessionId,
                    hasValidToken: true,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'session');
            }

            return session;
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Failed to retrieve session with token',
                'error',
                {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    error: error.message,
                    stack: error.stack,
                    operation: 'getSessionWithToken',
                    userId,
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, contextSessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Session with token retrieval failed', {
                    error: error.message,
                    operation: 'getSessionWithToken',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.error('Session with token retrieval failed', {
                    contextSessionId,
                    error: error.message,
                    operation: 'getSessionWithToken',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            return null;
        }
    }

    /**
     * Generate MCP adapter credentials for session
     * @param {string} sessionId - Session ID
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     * @returns {Promise<Object|null>} Adapter credentials or null
     */
    async generateAdapterCredentials(sessionId, userId, contextSessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing adapter credentials generation request', {
                sessionId: sessionId?.substring(0, 8) + '...',
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        try {
            const session = await this.getSessionWithToken(sessionId, userId, contextSessionId);
            
            if (!session) {
                // Pattern 2: User Activity Logs (for null result)
                if (userId) {
                    MonitoringService.info('Adapter credentials generation failed - no valid session', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session', null, userId, null, contextSessionId);
                } else if (contextSessionId) {
                    MonitoringService.info('Adapter credentials generation failed - no valid session (session context)', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        contextSessionId,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
                return null;
            }

            // Create encrypted credentials for MCP adapter
            const credentials = {
                session_id: sessionId,
                session_secret: session.session_secret,
                server_url: process.env.MCP_SERVER_URL || 'http://localhost:3000',
                created_at: Date.now()
            };

            // Pattern 2: User Activity Logs (for successful generation)
            if (userId) {
                MonitoringService.info('Adapter credentials generated successfully', {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    serverUrl: credentials.server_url,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.info('Adapter credentials generated successfully (session context)', {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    contextSessionId,
                    serverUrl: credentials.server_url,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'session');
            }

            return credentials;
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Failed to generate adapter credentials',
                'error',
                {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    error: error.message,
                    stack: error.stack,
                    operation: 'generateAdapterCredentials',
                    userId,
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, contextSessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Adapter credentials generation failed', {
                    error: error.message,
                    operation: 'generateAdapterCredentials',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.error('Adapter credentials generation failed', {
                    contextSessionId,
                    error: error.message,
                    operation: 'generateAdapterCredentials',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            return null;
        }
    }

    /**
     * Store session in database
     * @param {Object} sessionData - Session data to store
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     * @returns {Promise<void>}
     */
    async storeSession(sessionData, userId, contextSessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session storage request', {
                sessionId: sessionData.session_id?.substring(0, 8) + '...',
                userAgent: sessionData.user_agent,
                ipAddress: sessionData.ip_address,
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                await connection.query(
                    `INSERT INTO user_sessions (
                        session_id, session_secret, expires_at, created_at, last_seen,
                        user_agent, ip_address, is_active, microsoft_token, 
                        microsoft_refresh_token, microsoft_token_expires_at, user_info
                    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        sessionData.session_id,
                        sessionData.session_secret,
                        sessionData.expires_at,
                        sessionData.created_at,
                        sessionData.last_seen,
                        sessionData.user_agent,
                        sessionData.ip_address,
                        sessionData.is_active,
                        sessionData.microsoft_token,
                        sessionData.microsoft_refresh_token,
                        sessionData.microsoft_token_expires_at,
                        sessionData.user_info
                    ]
                );
                await connection.close();
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('Session stored successfully', {
                        sessionId: sessionData.session_id?.substring(0, 8) + '...',
                        expiresAt: new Date(sessionData.expires_at).toISOString(),
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session', null, userId, null, contextSessionId);
                } else if (contextSessionId) {
                    MonitoringService.info('Session stored successfully (session context)', {
                        sessionId: sessionData.session_id?.substring(0, 8) + '...',
                        contextSessionId,
                        expiresAt: new Date(sessionData.expires_at).toISOString(),
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Failed to store session',
                'error',
                {
                    sessionId: sessionData.session_id?.substring(0, 8) + '...',
                    error: error.message,
                    stack: error.stack,
                    operation: 'storeSession',
                    userId,
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, contextSessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Session storage failed', {
                    error: error.message,
                    operation: 'storeSession',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.error('Session storage failed', {
                    contextSessionId,
                    error: error.message,
                    operation: 'storeSession',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            throw error;
        }
    }

    /**
     * Update session last seen timestamp
     * @param {string} sessionId - Session ID
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     * @returns {Promise<boolean>} Success status
     */
    async updateLastSeen(sessionId, userId, contextSessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session last seen update request', {
                sessionId: sessionId?.substring(0, 8) + '...',
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const result = await connection.query(
                    'UPDATE user_sessions SET last_seen = ? WHERE session_id = ?',
                    [Date.now(), sessionId]
                );
                await connection.close();
                
                const success = result.changes > 0;
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('Session last seen updated successfully', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        updated: success,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session', null, userId, null, contextSessionId);
                } else if (contextSessionId) {
                    MonitoringService.info('Session last seen updated successfully (session context)', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        contextSessionId,
                        updated: success,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
                
                return success;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Failed to update session last seen',
                'error',
                {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    error: error.message,
                    stack: error.stack,
                    operation: 'updateLastSeen',
                    userId,
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, contextSessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Session last seen update failed', {
                    error: error.message,
                    operation: 'updateLastSeen',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.error('Session last seen update failed', {
                    contextSessionId,
                    error: error.message,
                    operation: 'updateLastSeen',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            return false;
        }
    }

    /**
     * Deactivate session (logout)
     * @param {string} sessionId - Session ID
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     * @returns {Promise<boolean>} Success status
     */
    async deactivateSession(sessionId, userId, contextSessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session deactivation request', {
                sessionId: sessionId?.substring(0, 8) + '...',
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const result = await connection.query(
                    'UPDATE user_sessions SET is_active = 0 WHERE session_id = ?',
                    [sessionId]
                );
                await connection.close();
                
                const success = result.changes > 0;
                
                // Pattern 2: User Activity Logs
                if (userId) {
                    MonitoringService.info('Session deactivated successfully', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        deactivated: success,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session', null, userId, null, contextSessionId);
                } else if (contextSessionId) {
                    MonitoringService.info('Session deactivated successfully (session context)', {
                        sessionId: sessionId?.substring(0, 8) + '...',
                        contextSessionId,
                        deactivated: success,
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
                
                return success;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Failed to deactivate session',
                'error',
                {
                    sessionId: sessionId?.substring(0, 8) + '...',
                    error: error.message,
                    stack: error.stack,
                    operation: 'deactivateSession',
                    userId,
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, contextSessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Session deactivation failed', {
                    error: error.message,
                    operation: 'deactivateSession',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.error('Session deactivation failed', {
                    contextSessionId,
                    error: error.message,
                    operation: 'deactivateSession',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            return false;
        }
    }

    /**
     * Clean up expired sessions
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     * @returns {Promise<number>} Number of sessions cleaned up
     */
    async cleanupExpiredSessions(userId, contextSessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing expired sessions cleanup request', {
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        try {
            const connection = await StorageService.getConnection();
            const now = Date.now();
            
            try {
                const result = await connection.query(
                    'DELETE FROM user_sessions WHERE expires_at < ?',
                    [now]
                );
                await connection.close();
                
                const deletedCount = result.changes;
                
                // Pattern 2: User Activity Logs
                if (deletedCount > 0) {
                    if (userId) {
                        MonitoringService.info('Expired sessions cleaned up successfully', {
                            deletedCount,
                            duration: Date.now() - startTime,
                            timestamp: new Date().toISOString()
                        }, 'session', null, userId, null, contextSessionId);
                    } else if (contextSessionId) {
                        MonitoringService.info('Expired sessions cleaned up successfully (session context)', {
                            contextSessionId,
                            deletedCount,
                            duration: Date.now() - startTime,
                            timestamp: new Date().toISOString()
                        }, 'session');
                    } else {
                        MonitoringService.info('Expired sessions cleaned up successfully', {
                            deletedCount,
                            duration: Date.now() - startTime,
                            timestamp: new Date().toISOString()
                        }, 'session');
                    }
                }
                
                return deletedCount;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'session',
                'Failed to clean up expired sessions',
                'error',
                {
                    error: error.message,
                    stack: error.stack,
                    operation: 'cleanupExpiredSessions',
                    userId,
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError, userId, contextSessionId);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Expired sessions cleanup failed', {
                    error: error.message,
                    operation: 'cleanupExpiredSessions',
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.error('Expired sessions cleanup failed', {
                    contextSessionId,
                    error: error.message,
                    operation: 'cleanupExpiredSessions',
                    timestamp: new Date().toISOString()
                }, 'session');
            } else {
                MonitoringService.error('Expired sessions cleanup failed', {
                    error: error.message,
                    operation: 'cleanupExpiredSessions',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
            
            return 0;
        }
    }

    /**
     * Start cleanup timer
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     */
    startCleanupTimer(userId, contextSessionId) {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing cleanup timer start request', {
                interval: CLEANUP_INTERVAL,
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.cleanupExpiredSessions();
            } catch (error) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'session',
                    'Session cleanup timer error',
                    'error',
                    {
                        error: error.message,
                        stack: error.stack,
                        operation: 'cleanupTimer',
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                MonitoringService.error('Session cleanup timer error', {
                    error: error.message,
                    operation: 'cleanupTimer',
                    timestamp: new Date().toISOString()
                }, 'session');
            }
        }, CLEANUP_INTERVAL);
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Session cleanup timer started successfully', {
                interval: CLEANUP_INTERVAL,
                timestamp: new Date().toISOString()
            }, 'session', null, userId, null, contextSessionId);
        } else if (contextSessionId) {
            MonitoringService.info('Session cleanup timer started successfully (session context)', {
                contextSessionId,
                interval: CLEANUP_INTERVAL,
                timestamp: new Date().toISOString()
            }, 'session');
        } else {
            MonitoringService.info('Session cleanup timer started successfully', {
                interval: CLEANUP_INTERVAL,
                timestamp: new Date().toISOString()
            }, 'session');
        }
    }

    /**
     * Stop cleanup timer
     * @param {string} [userId] - User ID for logging context
     * @param {string} [contextSessionId] - Context session ID for logging
     */
    stopCleanupTimer(userId, contextSessionId) {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing cleanup timer stop request', {
                hasInterval: !!this.cleanupInterval,
                contextSessionId,
                timestamp: new Date().toISOString(),
                userId
            }, 'session', null, userId, null, contextSessionId);
        }
        
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Session cleanup timer stopped successfully', {
                    timestamp: new Date().toISOString()
                }, 'session', null, userId, null, contextSessionId);
            } else if (contextSessionId) {
                MonitoringService.info('Session cleanup timer stopped successfully (session context)', {
                    contextSessionId,
                    timestamp: new Date().toISOString()
                }, 'session');
            } else {
                MonitoringService.info('Session cleanup timer stopped successfully', {
                    timestamp: new Date().toISOString()
                }, 'session');
            }
        }
    }
}

// Singleton instance
const sessionService = new SessionService();

module.exports = sessionService;
