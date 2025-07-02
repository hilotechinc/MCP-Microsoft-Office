/**
 * @fileoverview Authentication middleware for MCP API routes.
 * Validates user token via AuthService and attaches user context to request.
 */

const authService = require('../../core/auth-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');

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

            // Validate the access token
            const DeviceJwtService = require('../../auth/device-jwt.cjs');
            const token = DeviceJwtService.extractTokenFromHeader(authHeader);
            
            if (!token) {
                return res.status(401).json({
                    error: 'Authentication required',
                    message: 'Invalid Authorization header format'
                }).header('WWW-Authenticate', 'Bearer realm="MCP Remote Service"');
            }

            const decoded = DeviceJwtService.validateAccessToken(token);
            
            // Set authenticated user context from validated token
            console.log(`[DEBUG] JWT Token Validated with Microsoft 365 Identity:`, {
                decodedUserId: decoded.userId,
                microsoftEmail: decoded.microsoftEmail,
                deviceId: decoded.deviceId,
                tokenExp: decoded.exp,
                timestamp: new Date().toISOString()
            });
            
            // MICROSOFT 365-CENTRIC AUTH: Use the same Microsoft 365-based user ID
            // that was used when generating the token to ensure log consistency
            req.user = {
                deviceId: decoded.deviceId,
                userId: decoded.userId,  // This is ms365:email@domain.com format
                microsoftEmail: decoded.microsoftEmail,
                microsoftName: decoded.microsoftName,
                isApiCall: true,
                tokenExp: decoded.exp
            };

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

module.exports = { requireAuth };
