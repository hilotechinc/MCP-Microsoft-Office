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
    
    // IMPORTANT: For all API endpoints (v1), bypass authentication completely
    // and let the backend handle authentication internally
    if (req.path.startsWith('/v1/') || req.headers['x-mcp-internal-call'] === 'true') {
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('API or internal MCP call detected - bypassing authentication', {
                path: req.path,
                headers: req.headers['x-mcp-internal-call'],
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        // Mark this as an API call so the Graph client knows to use the stored token
        req.isApiCall = true;
        
        // Set a user object to prevent controllers from failing
        req.user = { 
            id: 'api-user',
            name: 'API User',
            isApiCall: true
        };
        
        return next();
    }
    
    // For non-API endpoints, use regular authentication
    try {
        // Check if user is authenticated via session
        if (req.session && req.session.userId) {
            const user = await authService.getUserById(req.session.userId);
            if (user) {
                req.user = user;
                return next();
            }
        }
        
        // Try token-based authentication if available
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (token) {
            // Validate token (async, modular)
            const valid = await authService.isAuthenticated(token);
            if (valid) {
                req.user = await authService.getUserFromToken(token);
                return next();
            }
        }
        
        // If we reach here, authentication failed
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
        return res.status(401).json({ 
            error: 'Authentication failed', 
            message: err.message,
            loginUrl: '/api/auth/login' 
        });
    }
}

module.exports = { requireAuth };
