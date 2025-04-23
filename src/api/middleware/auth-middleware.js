/**
 * @fileoverview Authentication middleware for MCP API routes.
 * Validates user token via AuthService and attaches user context to request.
 */

const authService = require('../../core/auth-service');

/**
 * Express middleware to require authentication.
 * Adds req.user if authenticated, else 401.
 */
async function requireAuth(req, res, next) {
    try {
        const authHeader = req.headers.authorization || '';
        const token = authHeader.replace(/^Bearer\s+/i, '');
        if (!token) {
            return res.status(401).json({ error: 'Missing auth token' });
        }
        // Validate token (async, modular)
        const valid = await authService.isAuthenticated(token);
        if (!valid) {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }
        req.user = await authService.getUserFromToken(token);
        next();
    } catch (err) {
        res.status(401).json({ error: 'Authentication failed' });
    }
}

module.exports = { requireAuth };
