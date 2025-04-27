/**
 * @fileoverview Authentication middleware for MCP API routes.
 * Validates user token via AuthService and attaches user context to request.
 */

const authService = require('../../core/auth-service.cjs');

/**
 * Express middleware to require authentication.
 * Adds req.user if authenticated, else 401.
 */
async function requireAuth(req, res, next) {
    console.log(`[Auth Middleware] Request to: ${req.method} ${req.path}`);
    
    // IMPORTANT: For all API endpoints (v1), bypass authentication completely
    // and let the backend handle authentication internally
    if (req.path.startsWith('/v1/') || req.headers['x-mcp-internal-call'] === 'true') {
        console.log('[Auth Middleware] API or internal MCP call detected - bypassing authentication');
        
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
        console.error('Authentication error:', err);
        return res.status(401).json({ 
            error: 'Authentication failed', 
            message: err.message,
            loginUrl: '/api/auth/login' 
        });
    }
}

module.exports = { requireAuth };
