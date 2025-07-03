/**
 * @fileoverview Authentication middleware for MCP API routes.
 * Validates user token via AuthService and attaches user context to request.
 * Uses MSAL for Microsoft 365 authentication and JWT for API authentication.
 */

const authService = require('../../core/auth-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');
const jwt = require('jsonwebtoken');
const msalService = require('../../auth/msal-service.cjs');

// JWT Configuration for API authentication
const JWT_SECRET = process.env.JWT_SECRET || process.env.STATIC_JWT_SECRET || require('crypto').randomBytes(64).toString('hex');
const MCP_BEARER_TOKEN_EXPIRY = process.env.MCP_BEARER_TOKEN_EXPIRY || '24h';

/**
 * Express middleware to require authentication.
 * Adds req.user if authenticated, else 401.
 */
async function requireAuth(req, res, next) {
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Auth middleware processing request', {
            method: req.method,
            path: req.path,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    // Check if this is an API endpoint that needs authentication
    if (req.path.startsWith('/api/v1/') || req.path.startsWith('/v1/') || req.headers['x-mcp-internal-call'] === 'true') {
        
        // First, try session-based authentication (for browser requests)
        if (req.session && req.session.id) {
            try {
                const msalService = require('../../auth/msal-service.cjs');
                const isAuthenticated = await msalService.isAuthenticated(req);
                
                if (isAuthenticated) {
                    // MICROSOFT 365-CENTRIC AUTH: Use Microsoft 365 email as consistent user ID
                    const msUser = req.session.msUser;
                    
                    if (!msUser?.username) {
                        throw new Error('Microsoft 365 user information missing from session');
                    }
                    
                    req.user = {
                        userId: `ms365:${msUser.username}`,
                        sessionId: req.session.id,
                        microsoftEmail: msUser.username,
                        microsoftName: msUser.name,
                        homeAccountId: msUser.homeAccountId
                    };
                    
                    MonitoringService.debug('Microsoft 365 session authentication successful', {
                        sessionId: req.session.id,
                        microsoftEmail: msUser.username,
                        userId: `ms365:${msUser.username}`,
                        path: req.path,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                    
                    return next();
                }
            } catch (sessionError) {
                MonitoringService.debug('Session authentication failed, trying JWT', {
                    sessionId: req.session?.id,
                    error: sessionError.message,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
        }
        
        // If session auth failed or not available, try JWT authentication (for MCP adapter requests)
        try {
            // Extract JWT token from Authorization header
            const authHeader = req.headers.authorization;
            if (!authHeader) {
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('No Authorization header found for API call', {
                        path: req.path,
                        hasSession: !!req.session?.id,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Missing Authorization header or valid session'
                }).header('WWW-Authenticate', 'Bearer realm="MCP Remote Service"');
            }

            // Extract token from Authorization header
            const token = extractTokenFromHeader(authHeader);
            
            if (!token) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Invalid Authorization header format'
                }).header('WWW-Authenticate', 'Bearer realm="MCP Remote Service"');
            }
            
            // Verify token signature and expiration
            const decoded = validateAccessToken(token);
            
            // Set user context for controllers - handle both userId and sub claims
            req.user = {
                userId: decoded.userId || decoded.sub, // Use sub claim as fallback (JWT standard)
                deviceId: decoded.deviceId || 'api-client',
                microsoftName: decoded.microsoftName,
                microsoftEmail: decoded.microsoftEmail || (decoded.sub && decoded.sub.startsWith('ms365:') ? decoded.sub.substring(6) : undefined),
                isApiCall: true,
                tokenExp: decoded.exp,
                sessionId: decoded.sessionId
            };
            
            // Log successful authentication
            MonitoringService.debug('JWT authentication successful', {
                userId: req.user.userId,
                deviceId: req.user.deviceId,
                path: req.path,
                tokenType: decoded.type,
                timestamp: new Date().toISOString()
            }, 'auth');

            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('API call authenticated successfully', {
                    path: req.path,
                    deviceId: decoded.deviceId,
                    userId: decoded.userId.substring(0, 8) + '...',
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            
            return next();

        } catch (error) {
            // Handle JWT validation errors
            if (error.category === 'auth') {
                MonitoringService.debug('JWT token validation failed', {
                    path: req.path,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'auth');

                const statusCode = error.message.includes('expired') ? 401 : 401;
                return res.status(statusCode).json({
                    error: 'Authentication failed',
                    message: error.message
                }).header('WWW-Authenticate', 'Bearer realm="MCP Remote Service"');
            }

            // Log unexpected errors
            MonitoringService.logError(error);
            return res.status(500).json({
                error: 'Internal server error',
                message: 'Authentication service unavailable'
            });
        }
    }
    
    // For non-API endpoints, use session-based authentication
    try {
        // Check if user is authenticated via Express session
        if (req.session && req.session.id) {
            // Check if the session has MSAL authentication
            const msalService = require('../../auth/msal-service.cjs');
            const isAuthenticated = await msalService.isAuthenticated(req);
            
            if (isAuthenticated) {
                // MICROSOFT 365-CENTRIC AUTH: Use Microsoft 365 email as consistent user ID
                const msUser = req.session.msUser;
                
                if (!msUser?.username) {
                    throw new Error('Microsoft 365 user information missing from session');
                }
                
                // Set user context for controllers with Microsoft 365 identity
                req.user = {
                    userId: `ms365:${msUser.username}`,
                    sessionId: req.session.id,
                    microsoftEmail: msUser.username,
                    microsoftName: msUser.name,
                    homeAccountId: msUser.homeAccountId
                };
                
                MonitoringService.debug('Session-based authentication successful', {
                    sessionId: req.session.id,
                    path: req.path,
                    timestamp: new Date().toISOString()
                }, 'auth');
                
                return next();
            }
        }
        
        // If we reach here, authentication failed
        res.setHeader('WWW-Authenticate', 'Bearer realm="MCP", authorization_uri="/.well-known/oauth-protected-resource"');
        return res.status(401).json({ 
            error: 'Authentication required', 
            loginUrl: '/api/auth/login' 
        });
    } catch (err) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Authentication error: ${err.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                path: req.path,
                method: req.method,
                stack: err.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        res.setHeader('WWW-Authenticate', 'Bearer realm="MCP", authorization_uri="/.well-known/oauth-protected-resource"');
        return res.status(401).json({ 
            error: 'Authentication failed', 
            message: err.message,
            loginUrl: '/api/auth/login' 
        });
    }
}

/**
 * Extract token from Authorization header
 * @param {string} authHeader - Authorization header value
 * @returns {string|null} Extracted token or null if not found
 */
function extractTokenFromHeader(authHeader) {
    if (!authHeader) {
        return null;
    }

    const match = authHeader.match(/^Bearer\s+(.+)$/);
    return match ? match[1] : null;
}

/**
 * Validate and decode an access token
 * @param {string} token - JWT token to validate
 * @returns {Object} Decoded token payload
 */
function validateAccessToken(token) {
    try {
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

        // Verify the token with our secret
        const decoded = jwt.verify(cleanToken, JWT_SECRET, {
            issuer: 'mcp-remote-service',
            audience: 'mcp-client'
        });

        // Validate token type - support both regular access tokens and mcp-bearer tokens
        if (decoded.type !== 'access' && decoded.type !== 'mcp-bearer') {
            throw ErrorService.createError(
                'auth',
                'Invalid token type. Expected access or mcp-bearer token.',
                'warning',
                { tokenType: decoded.type, expected: 'access or mcp-bearer' }
            );
        }

        // For mcp-bearer tokens, we have different validation rules
        if (decoded.type === 'mcp-bearer') {
            // MCP bearer tokens must have userId (which is the Microsoft 365 identity)
            if (!decoded.userId && !decoded.sub) {
                throw ErrorService.createError(
                    'auth',
                    'MCP bearer token missing user identity',
                    'warning',
                    { hasUserId: !!decoded.userId, hasSub: !!decoded.sub }
                );
            }
            
            // Use sub as userId if it exists (JWT standard)
            const userId = decoded.userId || decoded.sub;
            
            MonitoringService.debug('MCP bearer token validated successfully', {
                userId: userId.substring(0, 8) + '...',
                sessionId: decoded.sessionId || 'direct-generation',
                exp: decoded.exp,
                timestamp: new Date().toISOString()
            }, 'auth');
            
            return {
                deviceId: decoded.deviceId || 'mcp-client',
                userId: userId,
                microsoftEmail: decoded.microsoftEmail,
                microsoftName: decoded.microsoftName,
                type: decoded.type,
                iat: decoded.iat,
                exp: decoded.exp,
                sessionId: decoded.sessionId
            };
        } else {
            // Regular access tokens validation
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
            
            MonitoringService.debug('Access token validated successfully', {
                deviceId: decoded.deviceId,
                userId: decoded.userId.substring(0, 8) + '...',
                exp: decoded.exp,
                timestamp: new Date().toISOString()
            }, 'auth');
            
            return {
                deviceId: decoded.deviceId,
                userId: decoded.userId,
                type: decoded.type,
                iat: decoded.iat,
                exp: decoded.exp
            };
        }
    } catch (error) {
        let mcpError;
        
        if (error.name === 'TokenExpiredError') {
            mcpError = ErrorService.createError(
                'auth',
                'Access token has expired',
                'warning',
                { expiredAt: error.expiredAt }
            );
        } else if (error.name === 'JsonWebTokenError') {
            mcpError = ErrorService.createError(
                'auth',
                'Invalid access token format',
                'warning',
                { jwtError: error.message }
            );
        } else if (error.category) {
            // Already an MCP error
            mcpError = error;
        } else {
            mcpError = ErrorService.createError(
                'auth',
                'Token validation failed',
                'error',
                { error: error.message }
            );
        }

        MonitoringService.logError(mcpError);
        throw mcpError;
    }
}

module.exports = { requireAuth };
