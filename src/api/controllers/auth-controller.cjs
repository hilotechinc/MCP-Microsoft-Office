/**
 * @fileoverview Handles /api/auth endpoints for web-based authentication.
 * Implements login, logout, status, and MCP token generation.
 * 
 * Implements all four required logging patterns:
 * 1. Development Debug Logs - Console logging in development environment
 * 2. User Activity Logs - Track user authentication actions
 * 3. Infrastructure Error Logging - Server errors for operations
 * 4. User Error Tracking - User-specific error tracking
 */

const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');
const MsalService = require('../../auth/msal-service.cjs');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');

// Constants for token generation
const MCP_TOKEN_EXPIRY = 30 * 24 * 60 * 60; // 30 days in seconds
const MCP_TOKEN_SECRET = process.env.MCP_TOKEN_SECRET || 'mcp-token-secret-development-only';

/**
 * Check authentication status
 * GET /api/auth/status
 */
async function getAuthStatus(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Auth status check requested', {
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        const isAuthenticated = await MsalService.isAuthenticated(req);
        
        if (isAuthenticated) {
            const statusDetails = await MsalService.statusDetails(req);

            // Pattern 2: User Activity Logs
            const userId = req?.user?.userId;
            if (userId) {
                MonitoringService.info('Authentication status checked', {
                    authenticated: true,
                    timestamp: new Date().toISOString()
                }, 'auth', null, userId);
            }

            return res.json({
                authenticated: true,
                user: statusDetails.user,
                expiresAt: statusDetails.expiresAt
            });
        }
        
        return res.json({
            authenticated: false
        });
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const authError = ErrorService.createError(
            'auth',
            'Failed to check authentication status',
            'error',
            { 
                endpoint: '/api/auth/status',
                error: error.message
            }
        );
        MonitoringService.logError(authError);
        
        // Pattern 4: User Error Tracking
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.error('Authentication status check failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        }
        
        return res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to check authentication status'
        });
    }
}

/**
 * Initiate login flow
 * GET /api/auth/login
 */
async function login(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Login flow initiated', {
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                ip: req.ip,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        const redirectUrl = await MsalService.getAuthUrl(req);

        // Pattern 2: User Activity Logs
        // Note: At login initiation, we don't have userId yet, but we can log the session
        if (req.session?.id) {
            MonitoringService.info('Login flow initiated', {
                sessionId: req.session.id,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        return res.redirect(redirectUrl);
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const authError = ErrorService.createError(
            'auth',
            'Failed to initiate login',
            'error',
            { 
                endpoint: '/api/auth/login',
                error: error.message
            }
        );
        MonitoringService.logError(authError);
        
        // Pattern 4: User Error Tracking
        // Note: At login initiation failure, we may not have userId yet
        if (req.session?.id) {
            MonitoringService.error('Login initiation failed', {
                sessionId: req.session.id,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to initiate login'
        });
    }
}

/**
 * Handle auth callback from Microsoft
 * GET /api/auth/callback
 */
async function handleCallback(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Auth callback received', {
                sessionId: req.session?.id,
                hasCode: Boolean(req.query.code),
                hasError: Boolean(req.query.error)
            }, 'auth');
        }

        await MsalService.handleRedirect(req, res);

        // Pattern 2: User Activity Logs
        // After successful authentication, we should have a userId
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.info('Authentication completed successfully', {
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (req.session?.id) {
            // Fallback to session ID if user ID not available yet
            MonitoringService.info('Authentication completed with session', {
                sessionId: req.session.id,
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        return res.redirect('/');
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const authError = ErrorService.createError(
            'auth',
            'Failed to complete authentication',
            'error',
            { 
                endpoint: '/api/auth/callback',
                error: error.message,
                errorCode: req.query.error || 'unknown'
            }
        );
        MonitoringService.logError(authError);
        
        // Pattern 4: User Error Tracking
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.error('Authentication callback failed', {
                error: error.message,
                errorCode: error.code || 'unknown',
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (req.session?.id) {
            // Fallback to session ID if user ID not available
            MonitoringService.error('Authentication callback failed', {
                sessionId: req.session.id,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        return res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to complete authentication'
        });
    }
}

/**
 * Logout user
 * GET /api/auth/logout
 */
async function logout(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Logout requested', {
                userId: req?.user?.userId,
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Pattern 2: User Activity Logs - Log before logout since we'll lose the session
        const userId = req?.user?.userId;
        if (userId) {
            // Log before logout to ensure we have the user context
            MonitoringService.info('User logged out', {
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        }

        await MsalService.logout(req, res);
        return res.redirect('/');
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const authError = ErrorService.createError(
            'auth',
            'Failed to logout',
            'error',
            { 
                endpoint: '/api/auth/logout',
                error: error.message,
                userId: req?.user?.userId || 'unknown'
            }
        );
        MonitoringService.logError(authError);
        
        // Pattern 4: User Error Tracking
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.error('Logout failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        }
        
        return res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to logout'
        });
    }
}

/**
 * Generate a long-lived MCP bearer token for authenticated users
 * POST /api/auth/generate-mcp-token
 */
async function generateMcpToken(req, res) {
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('MCP token generation requested', {
                userId: req?.user?.userId,
                sessionId: req.session?.id,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString()
            }, 'auth');
        }

        // Ensure user is authenticated (via session)
        if (!req.user || !req.user.userId) {
            return res.status(401).json({
                error: 'authentication_required',
                error_description: 'User must be authenticated to generate MCP token'
            });
        }

        // Get user information for token
        const userId = req.user.userId;
        const sessionId = req.user.sessionId || req.session?.id;
        
        if (!sessionId) {
            return res.status(400).json({
                error: 'invalid_session',
                error_description: 'No valid session found'
            });
        }
        
        // Check if user has valid Microsoft Graph tokens
        const isAuthenticated = await MsalService.isAuthenticated(req);
        if (!isAuthenticated) {
            // Pattern 4: User Error Tracking (for authentication failure)
            MonitoringService.error('MCP token generation failed', {
                reason: 'microsoft_authentication_required',
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);

            return res.status(401).json({
                error: 'microsoft_authentication_required',
                error_description: 'User must be authenticated with Microsoft to generate MCP token'
            });
        }
        
        // Generate a unique token ID
        const tokenId = uuidv4();
        
        // Create token payload
        const payload = {
            sub: userId,
            jti: tokenId,
            sessionId: sessionId,
            type: 'mcp_bearer',
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + MCP_TOKEN_EXPIRY
        };
        
        // Sign the token
        const token = jwt.sign(payload, MCP_TOKEN_SECRET);
        
        // Log token creation (already has infrastructure logging)
        MonitoringService.info('MCP bearer token generated', {
            userId: userId.substring(0, 8) + '...',
            tokenId,
            expiresAt: new Date((payload.exp * 1000)).toISOString()
        }, 'auth');

        // Pattern 2: User Activity Logs
        MonitoringService.info('MCP bearer token generated', {
            tokenId,
            expiresAt: new Date((payload.exp * 1000)).toISOString(),
            timestamp: new Date().toISOString()
        }, 'auth', null, userId);
        
        // Return the token
        return res.json({
            access_token: token,
            token_type: 'Bearer',
            expires_in: MCP_TOKEN_EXPIRY,
            scope: 'mcp_api'
        });
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            'Failed to generate MCP token',
            'error',
            { 
                endpoint: '/api/auth/generate-mcp-token',
                error: error.message,
                userId: req.user?.userId?.substring(0, 8) + '...' || 'unknown'
            }
        );
        MonitoringService.logError(mcpError);

        // Pattern 4: User Error Tracking
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.error('MCP token generation failed', {
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'MCP token generation failed'
        });
    }
}

module.exports = {
    getAuthStatus,
    login,
    handleCallback,
    logout,
    generateMcpToken
};
