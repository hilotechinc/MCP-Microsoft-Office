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
     * @returns {Promise<Object>} Session data
     */
    async createSession(options = {}) {
        const startTime = Date.now();
        
        try {
            const sessionId = uuid();
            const sessionSecret = crypto.randomBytes(SESSION_SECRET_LENGTH).toString('hex');
            const expiresAt = Date.now() + SESSION_EXPIRY;
            const createdAt = Date.now();

            const sessionData = {
                session_id: sessionId,
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
            await this.storeSession(sessionData);

            MonitoringService.info('Session created successfully', {
                sessionId,
                expiresAt: new Date(expiresAt).toISOString(),
                timestamp: new Date().toISOString()
            }, 'session');

            MonitoringService.trackMetric('session_creation_success', Date.now() - startTime, {
                timestamp: new Date().toISOString()
            });

            return {
                session_id: sessionId,
                session_secret: sessionSecret,
                expires_at: expiresAt,
                expires_in: SESSION_EXPIRY / 1000
            };

        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                'session',
                'Session creation failed',
                'error',
                {
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('session_creation_failure', executionTime, {
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Get session by ID
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>} Session data or null
     */
    async getSession(sessionId) {
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const rows = await connection.query(
                    'SELECT * FROM user_sessions WHERE session_id = ? AND expires_at > ? AND is_active = 1',
                    [sessionId, Date.now()]
                );
                await connection.close();
                return rows.length > 0 ? rows[0] : null;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            MonitoringService.warn('Failed to get session', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'session');
            return null;
        }
    }

    /**
     * Update session with Microsoft Graph tokens
     * @param {string} sessionId - Session ID
     * @param {Object} tokenData - Microsoft Graph token data
     * @returns {Promise<boolean>} Success status
     */
    async updateSessionTokens(sessionId, tokenData) {
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
                
                MonitoringService.info('Session tokens updated', {
                    sessionId,
                    hasAccessToken: !!tokenData.accessToken,
                    hasRefreshToken: !!tokenData.refreshToken,
                    timestamp: new Date().toISOString()
                }, 'session');
                
                return result.changes > 0;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            MonitoringService.warn('Failed to update session tokens', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'session');
            return false;
        }
    }

    /**
     * Get session with valid Microsoft Graph token
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>} Session with token or null
     */
    async getSessionWithToken(sessionId) {
        const session = await this.getSession(sessionId);
        
        if (!session || !session.microsoft_token) {
            return null;
        }

        // Check if token is expired
        if (session.microsoft_token_expires_at && session.microsoft_token_expires_at < Date.now()) {
            MonitoringService.info('Session token expired', {
                sessionId,
                expiredAt: new Date(session.microsoft_token_expires_at).toISOString(),
                timestamp: new Date().toISOString()
            }, 'session');
            return null;
        }

        return session;
    }

    /**
     * Generate MCP adapter credentials for session
     * @param {string} sessionId - Session ID
     * @returns {Promise<Object|null>} Adapter credentials or null
     */
    async generateAdapterCredentials(sessionId) {
        const session = await this.getSessionWithToken(sessionId);
        
        if (!session) {
            return null;
        }

        // Create encrypted credentials for MCP adapter
        const credentials = {
            session_id: sessionId,
            session_secret: session.session_secret,
            server_url: process.env.MCP_SERVER_URL || 'http://localhost:3000',
            created_at: Date.now()
        };

        return credentials;
    }

    /**
     * Store session in database
     * @param {Object} sessionData - Session data to store
     * @returns {Promise<void>}
     */
    async storeSession(sessionData) {
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
        } catch (error) {
            await connection.close();
            throw error;
        }
    }

    /**
     * Update session last seen timestamp
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>} Success status
     */
    async updateLastSeen(sessionId) {
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const result = await connection.query(
                    'UPDATE user_sessions SET last_seen = ? WHERE session_id = ?',
                    [Date.now(), sessionId]
                );
                await connection.close();
                return result.changes > 0;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            MonitoringService.warn('Failed to update session last seen', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'session');
            return false;
        }
    }

    /**
     * Deactivate session (logout)
     * @param {string} sessionId - Session ID
     * @returns {Promise<boolean>} Success status
     */
    async deactivateSession(sessionId) {
        try {
            const connection = await StorageService.getConnection();
            
            try {
                const result = await connection.query(
                    'UPDATE user_sessions SET is_active = 0 WHERE session_id = ?',
                    [sessionId]
                );
                await connection.close();
                
                MonitoringService.info('Session deactivated', {
                    sessionId,
                    timestamp: new Date().toISOString()
                }, 'session');
                
                return result.changes > 0;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            MonitoringService.warn('Failed to deactivate session', {
                sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'session');
            return false;
        }
    }

    /**
     * Clean up expired sessions
     * @returns {Promise<number>} Number of sessions cleaned up
     */
    async cleanupExpiredSessions() {
        try {
            const connection = await StorageService.getConnection();
            const now = Date.now();
            
            try {
                const result = await connection.query(
                    'DELETE FROM user_sessions WHERE expires_at < ?',
                    [now]
                );
                await connection.close();
                
                if (result.changes > 0) {
                    MonitoringService.info('Cleaned up expired sessions', {
                        deletedCount: result.changes,
                        timestamp: new Date().toISOString()
                    }, 'session');
                }
                
                return result.changes;
            } catch (error) {
                await connection.close();
                throw error;
            }
        } catch (error) {
            MonitoringService.warn('Session cleanup failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'session');
            return 0;
        }
    }

    /**
     * Start cleanup timer
     */
    startCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        
        this.cleanupInterval = setInterval(async () => {
            try {
                await this.cleanupExpiredSessions();
            } catch (error) {
                MonitoringService.warn('Session cleanup timer error', {
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'session');
            }
        }, CLEANUP_INTERVAL);
        
        MonitoringService.info('Session cleanup timer started', {
            interval: CLEANUP_INTERVAL,
            timestamp: new Date().toISOString()
        }, 'session');
    }

    /**
     * Stop cleanup timer
     */
    stopCleanupTimer() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
            this.cleanupInterval = null;
            
            MonitoringService.info('Session cleanup timer stopped', {
                timestamp: new Date().toISOString()
            }, 'session');
        }
    }
}

// Singleton instance
const sessionService = new SessionService();

module.exports = sessionService;
