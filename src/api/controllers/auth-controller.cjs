/**
 * @fileoverview Handles /api/auth endpoints for web-based authentication.
 * Implements login, logout, status, and MCP token generation.
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
        const isAuthenticated = await MsalService.isAuthenticated(req);
        
        if (isAuthenticated) {
            const statusDetails = await MsalService.statusDetails(req);
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
        const redirectUrl = await MsalService.getAuthUrl(req);
        return res.redirect(redirectUrl);
    } catch (error) {
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
        await MsalService.handleRedirect(req, res);
        return res.redirect('/');
    } catch (error) {
        const authError = ErrorService.createError(
            'auth',
            'Failed to complete authentication',
            'error',
            { 
                endpoint: '/api/auth/callback',
                error: error.message
            }
        );
        MonitoringService.logError(authError);
        
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
        await MsalService.logout(req, res);
        return res.redirect('/');
    } catch (error) {
        const authError = ErrorService.createError(
            'auth',
            'Failed to logout',
            'error',
            { 
                endpoint: '/api/auth/logout',
                error: error.message
            }
        );
        MonitoringService.logError(authError);
        
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
        
        // Log token creation
        MonitoringService.info('MCP bearer token generated', {
            userId: userId.substring(0, 8) + '...',
            tokenId,
            expiresAt: new Date((payload.exp * 1000)).toISOString()
        }, 'auth');
        
        // Return the token
        return res.json({
            access_token: token,
            token_type: 'Bearer',
            expires_in: MCP_TOKEN_EXPIRY,
            scope: 'mcp_api'
        });
    } catch (error) {
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
