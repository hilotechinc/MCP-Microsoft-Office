/**
 * @fileoverview User ID Resolver - Ensures consistent user identification across the application
 * This module provides a unified way to resolve user IDs, prioritizing Microsoft 365 identity
 * over session-based identity for better security and log consistency.
 */

/**
 * Resolves the consistent user ID for a request, prioritizing Microsoft 365 identity
 * @param {Object} req - Express request object
 * @returns {string|null} Consistent user ID in format ms365:email@domain.com or session:sessionId
 */
function resolveUserId(req) {
    // Priority 1: Microsoft 365 email from session (most secure)
    if (req.session?.msUser?.username) {
        return `ms365:${req.session.msUser.username}`;
    }
    
    // Priority 2: Microsoft 365 email from JWT token (for API calls)
    if (req.user?.microsoftEmail) {
        return `ms365:${req.user.microsoftEmail}`;
    }
    
    // Priority 3: Existing userId from req.user (if already set correctly with ms365 prefix)
    if (req.user?.userId?.startsWith('ms365:')) {
        return req.user.userId;
    }
    
    // Priority 4: Try to extract Microsoft 365 identity from any available source
    // Check if auth middleware has already set a proper user context
    if (req.user?.userId && req.user.microsoftEmail) {
        // Trust the auth middleware's determination
        return req.user.userId;
    }
    
    // Priority 5: Session-based fallback (less secure, avoid if possible)
    if (req.session?.id && req.session.msUser?.username) {
        // Even in fallback, prefer Microsoft 365 identity if available
        return `ms365:${req.session.msUser.username}`;
    }
    
    // Priority 6: Last resort - session ID (should be avoided)
    if (req.session?.id) {
        console.warn('[USER-ID-RESOLVER] Falling back to session ID - Microsoft 365 auth missing');
        return `session:${req.session.id}`;
    }
    
    // Priority 7: Legacy userId from req.user (should not happen with proper auth)
    if (req.user?.userId) {
        console.warn('[USER-ID-RESOLVER] Using legacy userId format:', req.user.userId);
        return req.user.userId;
    }
    
    return null;
}

/**
 * Gets Microsoft 365 user details if available
 * @param {Object} req - Express request object
 * @returns {Object|null} Microsoft 365 user details
 */
function getMicrosoftUserDetails(req) {
    // From session
    if (req.session?.msUser) {
        return {
            email: req.session.msUser.username,
            name: req.session.msUser.name,
            homeAccountId: req.session.msUser.homeAccountId
        };
    }
    
    // From JWT token
    if (req.user?.microsoftEmail) {
        return {
            email: req.user.microsoftEmail,
            name: req.user.microsoftName,
            homeAccountId: req.user.homeAccountId
        };
    }
    
    return null;
}

/**
 * Ensures req.user has the correct userId format
 * This should be called after authentication middleware
 * @param {Object} req - Express request object
 */
function normalizeUserContext(req) {
    if (!req.user) {
        req.user = {};
    }
    
    const resolvedUserId = resolveUserId(req);
    const msUserDetails = getMicrosoftUserDetails(req);
    
    // Update req.user with consistent information
    req.user.userId = resolvedUserId;
    
    if (msUserDetails) {
        req.user.microsoftEmail = msUserDetails.email;
        req.user.microsoftName = msUserDetails.name;
        req.user.homeAccountId = msUserDetails.homeAccountId;
    }
    
    return req.user;
}

module.exports = {
    resolveUserId,
    getMicrosoftUserDetails,
    normalizeUserContext
};
