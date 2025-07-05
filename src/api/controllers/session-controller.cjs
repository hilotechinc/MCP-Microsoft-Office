/**
 * @fileoverview Session Controller for MCP Microsoft Office
 * Handles user session creation, Microsoft Graph authentication, and MCP adapter generation
 */

const Joi = require('joi');
const SessionService = require('../../core/session-service.cjs');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');

/**
 * Helper function to validate requests
 */
function validateRequest(req, schema, endpoint, userContext = {}) {
    const { userId, sessionId } = userContext;
    const { error, value } = schema.validate(req.body);
    
    if (error) {
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Request validation failed', {
                endpoint,
                errors: error.details.map(d => d.message),
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Request validation failed', {
                sessionId,
                endpoint,
                errors: error.details.map(d => d.message),
                timestamp: new Date().toISOString()
            }, 'session');
        }
    } else {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Request validation successful', {
                endpoint,
                sessionId,
                userId,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, 'session');
        }
    }
    
    return { error, value };
}

// Validation schemas
const createSessionSchema = Joi.object({
    user_agent: Joi.string().optional().description('User agent string'),
    device_info: Joi.object().optional().description('Device information')
});

const updateTokensSchema = Joi.object({
    session_id: Joi.string().required().description('Session ID'),
    access_token: Joi.string().required().description('Microsoft Graph access token'),
    refresh_token: Joi.string().optional().description('Microsoft Graph refresh token'),
    expires_on: Joi.date().optional().description('Token expiration date'),
    account: Joi.object().optional().description('Microsoft account information')
});

/**
 * Create a new user session
 * POST /api/session/create
 */
async function createSession(req, res) {
    const startTime = Date.now();
    const sessionId = req.session?.id;
    const userId = req.user?.userId;
    
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session creation request', {
                method: req.method,
                path: req.path,
                sessionId,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                userId
            }, 'session');
        }
        
        // Validate request
        const { error, value } = validateRequest(req, createSessionSchema, '/api/session/create', { userId, sessionId });
        if (error) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Invalid session creation parameters',
                details: error.details.map(d => d.message)
            });
        }

        // Get client info
        const userAgent = req.headers['user-agent'] || value.user_agent || 'Unknown';
        const ipAddress = req.ip || req.connection.remoteAddress || 'Unknown';

        // Create session
        const session = await SessionService.createSession({
            userAgent,
            ipAddress
        });

        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Session created successfully', {
                sessionId: session.session_id,
                userAgent,
                ipAddress,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Session created with session context', {
                sessionId: session.session_id,
                originalSessionId: sessionId,
                userAgent,
                ipAddress,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.json({
            session_id: session.session_id,
            expires_in: session.expires_in,
            expires_at: session.expires_at
        });

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'session',
            'Session creation failed',
            'error',
            { 
                endpoint: '/api/session/create',
                error: error.message,
                stack: error.stack,
                operation: 'createSession',
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Session creation failed', {
                error: error.message,
                operation: 'createSession',
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Session creation failed', {
                sessionId,
                error: error.message,
                operation: 'createSession',
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Session creation service unavailable'
        });
    }
}

/**
 * Update session with Microsoft Graph tokens
 * POST /api/session/tokens
 */
async function updateSessionTokens(req, res) {
    const startTime = Date.now();
    const sessionId = req.session?.id;
    const userId = req.user?.userId;
    
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session token update request', {
                method: req.method,
                path: req.path,
                sessionId,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                userId
            }, 'session');
        }
        
        // Validate request
        const { error, value } = validateRequest(req, updateTokensSchema, '/api/session/tokens', { userId, sessionId });
        if (error) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Invalid token update parameters',
                details: error.details.map(d => d.message)
            });
        }

        // Update session with tokens
        const success = await SessionService.updateSessionTokens(value.session_id, {
            accessToken: value.access_token,
            refreshToken: value.refresh_token,
            expiresOn: value.expires_on,
            account: value.account
        });

        if (!success) {
            return res.status(404).json({
                error: 'session_not_found',
                error_description: 'Session not found or expired'
            });
        }

        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Session tokens updated successfully', {
                sessionId: value.session_id,
                hasRefreshToken: !!value.refresh_token,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Session tokens updated with session context', {
                sessionId: value.session_id,
                originalSessionId: sessionId,
                hasRefreshToken: !!value.refresh_token,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.json({
            success: true,
            message: 'Session tokens updated successfully'
        });

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'session',
            'Token update failed',
            'error',
            { 
                endpoint: '/api/session/tokens',
                error: error.message,
                stack: error.stack,
                operation: 'updateSessionTokens',
                userId,
                sessionId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Session token update failed', {
                error: error.message,
                operation: 'updateSessionTokens',
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Session token update failed', {
                sessionId,
                error: error.message,
                operation: 'updateSessionTokens',
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Token update service unavailable'
        });
    }
}

/**
 * Get session information
 * GET /api/session/:sessionId
 */
async function getSession(req, res) {
    const startTime = Date.now();
    const currentSessionId = req.session?.id;
    const userId = req.user?.userId;
    const requestedSessionId = req.params.sessionId;
    
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session retrieval request', {
                method: req.method,
                path: req.path,
                sessionId: currentSessionId,
                requestedSessionId,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                userId
            }, 'session');
        }
        
        if (!requestedSessionId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Session ID is required'
            });
        }

        const session = await SessionService.getSession(requestedSessionId);
        
        if (!session) {
            return res.status(404).json({
                error: 'session_not_found',
                error_description: 'Session not found or expired'
            });
        }

        // Return session info without sensitive data
        let userInfo = null;
        if (session.user_info) {
            try {
                userInfo = typeof session.user_info === 'string' 
                    ? JSON.parse(session.user_info) 
                    : session.user_info;
            } catch (parseError) {
                // If JSON parsing fails, just return null
                userInfo = null;
            }
        }

        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Session retrieved successfully', {
                requestedSessionId,
                isActive: session.is_active,
                hasMicrosoftToken: !!session.microsoft_token,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (currentSessionId) {
            MonitoringService.info('Session retrieved with session context', {
                sessionId: currentSessionId,
                requestedSessionId,
                isActive: session.is_active,
                hasMicrosoftToken: !!session.microsoft_token,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.json({
            session_id: session.session_id,
            created_at: session.created_at,
            last_seen: session.last_seen,
            expires_at: session.expires_at,
            is_active: session.is_active,
            has_microsoft_token: !!session.microsoft_token,
            user_info: userInfo
        });

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'session',
            'Session retrieval failed',
            'error',
            { 
                endpoint: '/api/session/:sessionId',
                error: error.message,
                stack: error.stack,
                operation: 'getSession',
                userId,
                sessionId: currentSessionId,
                requestedSessionId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Session retrieval failed', {
                error: error.message,
                operation: 'getSession',
                requestedSessionId,
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (currentSessionId) {
            MonitoringService.error('Session retrieval failed', {
                sessionId: currentSessionId,
                error: error.message,
                operation: 'getSession',
                requestedSessionId,
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Session retrieval service unavailable'
        });
    }
}

/**
 * Generate MCP adapter credentials for session
 * GET /api/session/:sessionId/adapter
 */
async function generateAdapterCredentials(req, res) {
    const startTime = Date.now();
    const currentSessionId = req.session?.id;
    const userId = req.user?.userId;
    const requestedSessionId = req.params.sessionId;
    
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing adapter credentials generation request', {
                method: req.method,
                path: req.path,
                sessionId: currentSessionId,
                requestedSessionId,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                userId
            }, 'session');
        }
        
        if (!requestedSessionId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Session ID is required'
            });
        }

        const credentials = await SessionService.generateAdapterCredentials(requestedSessionId);
        
        if (!credentials) {
            return res.status(404).json({
                error: 'session_not_found',
                error_description: 'Session not found, expired, or not authenticated'
            });
        }

        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('MCP adapter credentials generated successfully', {
                requestedSessionId,
                hasServerUrl: !!credentials.server_url,
                hasToken: !!credentials.bearer_token,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (currentSessionId) {
            MonitoringService.info('MCP adapter credentials generated with session context', {
                sessionId: currentSessionId,
                requestedSessionId,
                hasServerUrl: !!credentials.server_url,
                hasToken: !!credentials.bearer_token,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.json(credentials);

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'session',
            'Adapter credential generation failed',
            'error',
            { 
                endpoint: '/api/session/:sessionId/adapter',
                error: error.message,
                stack: error.stack,
                operation: 'generateAdapterCredentials',
                userId,
                sessionId: currentSessionId,
                requestedSessionId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Adapter credential generation failed', {
                error: error.message,
                operation: 'generateAdapterCredentials',
                requestedSessionId,
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (currentSessionId) {
            MonitoringService.error('Adapter credential generation failed', {
                sessionId: currentSessionId,
                error: error.message,
                operation: 'generateAdapterCredentials',
                requestedSessionId,
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Adapter credential service unavailable'
        });
    }
}

/**
 * Deactivate session (logout)
 * POST /api/session/:sessionId/logout
 */
async function logoutSession(req, res) {
    const startTime = Date.now();
    const currentSessionId = req.session?.id;
    const userId = req.user?.userId;
    const requestedSessionId = req.params.sessionId;
    
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing session logout request', {
                method: req.method,
                path: req.path,
                sessionId: currentSessionId,
                requestedSessionId,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                userId
            }, 'session');
        }
        
        if (!requestedSessionId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Session ID is required'
            });
        }

        const success = await SessionService.deactivateSession(requestedSessionId);
        
        if (!success) {
            return res.status(404).json({
                error: 'session_not_found',
                error_description: 'Session not found'
            });
        }

        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Session logged out successfully', {
                requestedSessionId,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (currentSessionId) {
            MonitoringService.info('Session logged out with session context', {
                sessionId: currentSessionId,
                requestedSessionId,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.json({
            success: true,
            message: 'Session logged out successfully'
        });

    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'session',
            'Session logout failed',
            'error',
            { 
                endpoint: '/api/session/:sessionId/logout',
                error: error.message,
                stack: error.stack,
                operation: 'logoutSession',
                userId,
                sessionId: currentSessionId,
                requestedSessionId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Session logout failed', {
                error: error.message,
                operation: 'logoutSession',
                requestedSessionId,
                timestamp: new Date().toISOString()
            }, 'session', null, userId);
        } else if (currentSessionId) {
            MonitoringService.error('Session logout failed', {
                sessionId: currentSessionId,
                error: error.message,
                operation: 'logoutSession',
                requestedSessionId,
                timestamp: new Date().toISOString()
            }, 'session');
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Session logout service unavailable'
        });
    }
}

module.exports = {
    createSession,
    updateSessionTokens,
    getSession,
    generateAdapterCredentials,
    logoutSession
};
