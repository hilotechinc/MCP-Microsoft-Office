/**
 * @fileoverview JWT Token Service for Device Authentication
 * Handles generation and validation of access and refresh tokens for authenticated devices.
 * Implements secure token-based authentication for multi-user remote MCP service.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

// JWT Configuration
const JWT_SECRET = process.env.JWT_SECRET || (() => {
    // Generate a secure random secret if not provided
    const secret = crypto.randomBytes(64).toString('hex');
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.warn('JWT_SECRET not set, using generated secret. Set JWT_SECRET environment variable for production.', {
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    return secret;
})();

const ACCESS_TOKEN_EXPIRY = '5m';  // 5 minutes
const REFRESH_TOKEN_EXPIRY = '24h'; // 24 hours

class DeviceJwtService {
    constructor() {
        this.name = 'DeviceJwtService';
        
        // Validate JWT secret strength
        if (JWT_SECRET.length < 32) {
            const error = ErrorService.createError(
                'auth',
                'JWT secret is too weak. Must be at least 32 characters.',
                'error',
                { secretLength: JWT_SECRET.length }
            );
            MonitoringService.logError(error);
            throw new Error('Invalid JWT configuration');
        }
        
        MonitoringService.info('DeviceJwtService initialized', {
            accessTokenExpiry: ACCESS_TOKEN_EXPIRY,
            refreshTokenExpiry: REFRESH_TOKEN_EXPIRY,
            timestamp: new Date().toISOString()
        }, 'auth');
    }

    /**
     * Generate an access token for an authenticated device
     * @param {string} deviceId - Unique device identifier
     * @param {string} userId - Microsoft 365 user ID
     * @param {Object} metadata - Additional token metadata
     * @returns {string} Signed JWT access token
     */
    generateAccessToken(deviceId, userId, metadata = {}) {
        const startTime = Date.now();
        
        try {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Processing access token generation request', {
                    deviceId,
                    userId: userId ? userId.substring(0, 8) + '...' : 'undefined',
                    hasMetadata: Object.keys(metadata).length > 0,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            if (!deviceId || !userId) {
                throw ErrorService.createError(
                    'auth',
                    'Device ID and User ID are required for access token generation',
                    'error',
                    { deviceId: !!deviceId, userId: !!userId }
                );
            }

            const payload = {
                deviceId,
                userId,
                type: 'access',
                iat: Math.floor(Date.now() / 1000),
                ...metadata
            };

            const token = jwt.sign(payload, JWT_SECRET, {
                expiresIn: ACCESS_TOKEN_EXPIRY,
                issuer: 'mcp-remote-service',
                audience: 'mcp-client',
                subject: deviceId
            });

            // Pattern 2: User Activity Logs
            MonitoringService.info('Access token generated successfully', {
                deviceId,
                userId: userId.substring(0, 8) + '...',
                expiresIn: ACCESS_TOKEN_EXPIRY,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);

            return token;

        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                'Failed to generate access token',
                'error',
                { 
                    deviceId, 
                    error: error.message,
                    stack: error.stack,
                    operation: 'generateAccessToken',
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Access token generation failed', {
                    error: error.message,
                    operation: 'generateAccessToken',
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            }
            
            throw mcpError;
        }
    }

    /**
     * Generate a long-lived access token (24 hours) for MCP clients
     * @param {string} deviceId - Unique device identifier
     * @param {string} userId - Microsoft 365 user ID
     * @param {Object} metadata - Additional token metadata
     * @returns {string} Signed JWT access token with 24-hour expiry
     */
    generateLongLivedAccessToken(deviceId, userId, metadata = {}) {
        const startTime = Date.now();
        
        try {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Processing long-lived access token generation request', {
                    deviceId,
                    userId: userId ? userId.substring(0, 8) + '...' : 'undefined',
                    hasMetadata: Object.keys(metadata).length > 0,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            if (!deviceId || !userId) {
                throw ErrorService.createError(
                    'auth',
                    'Device ID and User ID are required for long-lived access token generation',
                    'error',
                    { deviceId: !!deviceId, userId: !!userId }
                );
            }

            const payload = {
                deviceId,
                userId,
                type: 'access',
                iat: Math.floor(Date.now() / 1000),
                ...metadata
            };

            const token = jwt.sign(payload, JWT_SECRET, {
                expiresIn: '24h', // Long-lived token for MCP clients
                issuer: 'mcp-remote-service',
                audience: 'mcp-client',
                subject: deviceId
            });

            // Pattern 2: User Activity Logs
            MonitoringService.info('Long-lived access token generated successfully', {
                deviceId,
                userId: userId.substring(0, 8) + '...',
                expiresIn: '24h',
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);

            return token;

        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                'Failed to generate long-lived access token',
                'error',
                { 
                    deviceId, 
                    error: error.message,
                    stack: error.stack,
                    operation: 'generateLongLivedAccessToken',
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Long-lived access token generation failed', {
                    error: error.message,
                    operation: 'generateLongLivedAccessToken',
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            }
            
            throw mcpError;
        }
    }

    /**
     * Generate a refresh token for device session management
     * @param {string} deviceId - Unique device identifier
     * @param {Object} metadata - Additional token metadata
     * @returns {string} Signed JWT refresh token
     */
    generateRefreshToken(deviceId, metadata = {}) {
        const startTime = Date.now();
        
        try {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Processing refresh token generation request', {
                    deviceId,
                    hasMetadata: Object.keys(metadata).length > 0,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            if (!deviceId) {
                throw ErrorService.createError(
                    'auth',
                    'Device ID is required for refresh token generation',
                    'error',
                    { deviceId: !!deviceId }
                );
            }

            const payload = {
                deviceId,
                type: 'refresh',
                iat: Math.floor(Date.now() / 1000),
                ...metadata
            };

            const token = jwt.sign(payload, JWT_SECRET, {
                expiresIn: REFRESH_TOKEN_EXPIRY,
                issuer: 'mcp-remote-service',
                audience: 'mcp-client',
                subject: deviceId
            });

            // Pattern 2: User Activity Logs
            MonitoringService.info('Refresh token generated successfully', {
                deviceId,
                expiresIn: REFRESH_TOKEN_EXPIRY,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'auth');

            return token;

        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                'Failed to generate refresh token',
                'error',
                { 
                    deviceId, 
                    error: error.message,
                    stack: error.stack,
                    operation: 'generateRefreshToken',
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking (Note: No userId available for refresh tokens)
            MonitoringService.error('Refresh token generation failed', {
                deviceId,
                error: error.message,
                operation: 'generateRefreshToken',
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }

    /**
     * Validate and decode an access token
     * @param {string} token - JWT token to validate
     * @returns {Object} Decoded token payload with { deviceId, userId, type, iat, exp }
     */
    validateAccessToken(token) {
        const startTime = Date.now();
        let userId = null;
        
        try {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Processing access token validation request', {
                    tokenProvided: !!token,
                    tokenLength: token ? token.length : 0,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            if (!token) {
                throw ErrorService.createError(
                    'auth',
                    'Token is required for validation',
                    'warning',
                    { tokenProvided: !!token }
                );
            }

            // Remove Bearer prefix if present
            const cleanToken = token.replace(/^Bearer\s+/, '');

            const decoded = jwt.verify(cleanToken, JWT_SECRET, {
                issuer: 'mcp-remote-service',
                audience: 'mcp-client'
            });

            // Extract userId for logging
            userId = decoded.userId;

            // Validate token type
            if (decoded.type !== 'access') {
                throw ErrorService.createError(
                    'auth',
                    'Invalid token type. Expected access token.',
                    'warning',
                    { tokenType: decoded.type, expected: 'access' }
                );
            }

            // Validate required fields
            if (!decoded.deviceId || !decoded.userId) {
                throw ErrorService.createError(
                    'auth',
                    'Token missing required fields',
                    'warning',
                    { 
                        hasDeviceId: !!decoded.deviceId, 
                        hasUserId: !!decoded.userId 
                    }
                );
            }

            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Access token validated successfully', {
                    deviceId: decoded.deviceId,
                    userId: userId.substring(0, 8) + '...',
                    exp: decoded.exp,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else {
                MonitoringService.info('Access token validated successfully', {
                    deviceId: decoded.deviceId,
                    exp: decoded.exp,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }

            return {
                deviceId: decoded.deviceId,
                userId: decoded.userId,
                type: decoded.type,
                iat: decoded.iat,
                exp: decoded.exp
            };

        } catch (error) {
            let mcpError;
            
            // Pattern 3: Infrastructure Error Logging
            if (error.name === 'TokenExpiredError') {
                mcpError = ErrorService.createError(
                    'auth',
                    'Access token has expired',
                    'warning',
                    { 
                        expiredAt: error.expiredAt,
                        operation: 'validateAccessToken',
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                );
            } else if (error.name === 'JsonWebTokenError') {
                mcpError = ErrorService.createError(
                    'auth',
                    'Invalid access token format',
                    'warning',
                    { 
                        jwtError: error.message,
                        operation: 'validateAccessToken',
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                );
            } else if (error.category) {
                // Already an MCP error
                mcpError = error;
            } else {
                mcpError = ErrorService.createError(
                    'auth',
                    'Token validation failed',
                    'error',
                    { 
                        error: error.message,
                        stack: error.stack,
                        operation: 'validateAccessToken',
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                );
            }

            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Access token validation failed', {
                    error: error.message,
                    operation: 'validateAccessToken',
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else {
                MonitoringService.error('Access token validation failed', {
                    error: error.message,
                    operation: 'validateAccessToken',
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            throw mcpError;
        }
    }

    /**
     * Validate and decode a refresh token
     * @param {string} token - JWT refresh token to validate
     * @returns {Object} Decoded token payload with { deviceId, type, iat, exp }
     */
    validateRefreshToken(token) {
        const startTime = Date.now();
        
        try {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Processing refresh token validation request', {
                    tokenProvided: !!token,
                    tokenLength: token ? token.length : 0,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            if (!token) {
                throw ErrorService.createError(
                    'auth',
                    'Refresh token is required for validation',
                    'warning',
                    { tokenProvided: !!token }
                );
            }

            // Remove Bearer prefix if present
            const cleanToken = token.replace(/^Bearer\s+/, '');

            const decoded = jwt.verify(cleanToken, JWT_SECRET, {
                issuer: 'mcp-remote-service',
                audience: 'mcp-client'
            });

            // Validate token type
            if (decoded.type !== 'refresh') {
                throw ErrorService.createError(
                    'auth',
                    'Invalid token type. Expected refresh token.',
                    'warning',
                    { tokenType: decoded.type, expected: 'refresh' }
                );
            }

            // Validate required fields
            if (!decoded.deviceId) {
                throw ErrorService.createError(
                    'auth',
                    'Refresh token missing device ID',
                    'warning',
                    { hasDeviceId: !!decoded.deviceId }
                );
            }

            // Pattern 2: User Activity Logs
            MonitoringService.info('Refresh token validated successfully', {
                deviceId: decoded.deviceId,
                exp: decoded.exp,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'auth');

            return {
                deviceId: decoded.deviceId,
                type: decoded.type,
                iat: decoded.iat,
                exp: decoded.exp
            };

        } catch (error) {
            let mcpError;
            
            // Pattern 3: Infrastructure Error Logging
            if (error.name === 'TokenExpiredError') {
                mcpError = ErrorService.createError(
                    'auth',
                    'Refresh token has expired',
                    'warning',
                    { 
                        expiredAt: error.expiredAt,
                        operation: 'validateRefreshToken',
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                );
            } else if (error.name === 'JsonWebTokenError') {
                mcpError = ErrorService.createError(
                    'auth',
                    'Invalid refresh token format',
                    'warning',
                    { 
                        jwtError: error.message,
                        operation: 'validateRefreshToken',
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                );
            } else if (error.category) {
                // Already an MCP error
                mcpError = error;
            } else {
                mcpError = ErrorService.createError(
                    'auth',
                    'Refresh token validation failed',
                    'error',
                    { 
                        error: error.message,
                        stack: error.stack,
                        operation: 'validateRefreshToken',
                        duration: Date.now() - startTime,
                        timestamp: new Date().toISOString()
                    }
                );
            }

            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking (Note: No userId available for refresh tokens)
            MonitoringService.error('Refresh token validation failed', {
                error: error.message,
                operation: 'validateRefreshToken',
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }

    /**
     * Extract token from Authorization header
     * @param {string} authHeader - Authorization header value
     * @returns {string|null} Extracted token or null if not found
     */
    extractTokenFromHeader(authHeader) {
        const startTime = Date.now();
        
        try {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Processing token extraction from header', {
                    hasAuthHeader: !!authHeader,
                    headerLength: authHeader ? authHeader.length : 0,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            if (!authHeader) {
                return null;
            }

            const match = authHeader.match(/^Bearer\s+(.+)$/);
            const token = match ? match[1] : null;
            
            // Pattern 2: User Activity Logs (only log successful extractions)
            if (token) {
                MonitoringService.info('Token extracted from header successfully', {
                    tokenLength: token.length,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return token;
            
        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                'Failed to extract token from header',
                'error',
                { 
                    error: error.message,
                    stack: error.stack,
                    operation: 'extractTokenFromHeader',
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            MonitoringService.error('Token extraction from header failed', {
                error: error.message,
                operation: 'extractTokenFromHeader',
                timestamp: new Date().toISOString()
            }, 'auth');
            
            throw mcpError;
        }
    }

    /**
     * Generate both access and refresh tokens for a device
     * @param {string} deviceId - Unique device identifier
     * @param {string} userId - Microsoft 365 user ID
     * @param {Object} metadata - Additional token metadata
     * @returns {Object} { accessToken, refreshToken }
     */
    generateTokenPair(deviceId, userId, metadata = {}) {
        const startTime = Date.now();
        
        try {
            // Pattern 1: Development Debug Logs
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Processing token pair generation request', {
                    deviceId,
                    userId: userId ? userId.substring(0, 8) + '...' : 'undefined',
                    hasMetadata: Object.keys(metadata).length > 0,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            const accessToken = this.generateAccessToken(deviceId, userId, metadata);
            const refreshToken = this.generateRefreshToken(deviceId, metadata);

            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Token pair generated successfully', {
                    deviceId,
                    userId: userId.substring(0, 8) + '...',
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else {
                MonitoringService.info('Token pair generated successfully', {
                    deviceId,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }

            return {
                accessToken,
                refreshToken,
                tokenType: 'Bearer',
                expiresIn: 300 // 5 minutes in seconds
            };

        } catch (error) {
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'auth',
                'Failed to generate token pair',
                'error',
                { 
                    deviceId, 
                    error: error.message,
                    stack: error.stack,
                    operation: 'generateTokenPair',
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Token pair generation failed', {
                    error: error.message,
                    operation: 'generateTokenPair',
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            } else {
                MonitoringService.error('Token pair generation failed', {
                    deviceId,
                    error: error.message,
                    operation: 'generateTokenPair',
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            throw mcpError;
        }
    }
}

// Export singleton instance
module.exports = new DeviceJwtService();
