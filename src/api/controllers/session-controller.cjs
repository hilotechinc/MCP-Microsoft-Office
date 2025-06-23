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
function validateRequest(req, schema, endpoint) {
    const { error, value } = schema.validate(req.body);
    if (error) {
        MonitoringService.warn('Request validation failed', {
            endpoint,
            errors: error.details.map(d => d.message),
            timestamp: new Date().toISOString()
        }, 'session');
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
    try {
        // Validate request
        const { error, value } = validateRequest(req, createSessionSchema, '/api/session/create');
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

        MonitoringService.info('Session created via API', {
            sessionId: session.session_id,
            userAgent,
            ipAddress,
            timestamp: new Date().toISOString()
        }, 'session');

        res.json({
            session_id: session.session_id,
            expires_in: session.expires_in,
            expires_at: session.expires_at
        });

    } catch (error) {
        const mcpError = ErrorService.createError(
            'session',
            'Session creation failed',
            'error',
            { 
                endpoint: '/api/session/create',
                error: error.message 
            }
        );
        MonitoringService.logError(mcpError);

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
    try {
        // Validate request
        const { error, value } = validateRequest(req, updateTokensSchema, '/api/session/tokens');
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

        MonitoringService.info('Session tokens updated', {
            sessionId: value.session_id,
            hasAccessToken: !!value.access_token,
            hasRefreshToken: !!value.refresh_token,
            timestamp: new Date().toISOString()
        }, 'session');

        res.json({
            success: true,
            message: 'Tokens updated successfully'
        });

    } catch (error) {
        const mcpError = ErrorService.createError(
            'session',
            'Token update failed',
            'error',
            { 
                endpoint: '/api/session/tokens',
                error: error.message 
            }
        );
        MonitoringService.logError(mcpError);

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
    try {
        const sessionId = req.params.sessionId;
        
        if (!sessionId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Session ID is required'
            });
        }

        const session = await SessionService.getSession(sessionId);
        
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
        const mcpError = ErrorService.createError(
            'session',
            'Session retrieval failed',
            'error',
            { 
                endpoint: '/api/session/:sessionId',
                error: error.message 
            }
        );
        MonitoringService.logError(mcpError);

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
    try {
        const sessionId = req.params.sessionId;
        
        if (!sessionId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Session ID is required'
            });
        }

        const credentials = await SessionService.generateAdapterCredentials(sessionId);
        
        if (!credentials) {
            return res.status(404).json({
                error: 'session_not_found',
                error_description: 'Session not found, expired, or not authenticated'
            });
        }

        MonitoringService.info('MCP adapter credentials generated', {
            sessionId,
            timestamp: new Date().toISOString()
        }, 'session');

        res.json(credentials);

    } catch (error) {
        const mcpError = ErrorService.createError(
            'session',
            'Adapter credential generation failed',
            'error',
            { 
                endpoint: '/api/session/:sessionId/adapter',
                error: error.message 
            }
        );
        MonitoringService.logError(mcpError);

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
    try {
        const sessionId = req.params.sessionId;
        
        if (!sessionId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Session ID is required'
            });
        }

        const success = await SessionService.deactivateSession(sessionId);
        
        if (!success) {
            return res.status(404).json({
                error: 'session_not_found',
                error_description: 'Session not found'
            });
        }

        MonitoringService.info('Session logged out', {
            sessionId,
            timestamp: new Date().toISOString()
        }, 'session');

        res.json({
            success: true,
            message: 'Session logged out successfully'
        });

    } catch (error) {
        const mcpError = ErrorService.createError(
            'session',
            'Session logout failed',
            'error',
            { 
                endpoint: '/api/session/:sessionId/logout',
                error: error.message 
            }
        );
        MonitoringService.logError(mcpError);

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
