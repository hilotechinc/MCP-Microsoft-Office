/**
 * @fileoverview User ID Resolver - Ensures consistent user identification across the application
 * This module provides a unified way to resolve user IDs, prioritizing Microsoft 365 identity
 * over session-based identity for better security and log consistency.
 */

const MonitoringService = require('./monitoring-service.cjs');
const ErrorService = require('./error-service.cjs');

/**
 * Resolves the consistent user ID for a request, prioritizing Microsoft 365 identity
 * @param {Object} req - Express request object
 * @param {string} userId - Optional userId for context
 * @param {string} sessionId - Optional sessionId for context
 * @returns {string|null} Consistent user ID in format ms365:email@domain.com or session:sessionId
 */
function resolveUserId(req, userId, sessionId) {
    const startTime = Date.now();
    
    try {
        // Extract context for logging
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing user ID resolution request', {
                hasSession: !!req.session,
                hasMsUser: !!req.session?.msUser,
                hasUserObject: !!req.user,
                hasMicrosoftEmail: !!req.user?.microsoftEmail,
                sessionId: contextSessionId,
                userAgent: req?.get ? req.get('User-Agent') : 'N/A',
                timestamp: new Date().toISOString(),
                userId: contextUserId
            }, 'user-resolver');
        }
        
        let resolvedUserId = null;
        let resolutionMethod = null;
        
        // Priority 1: Microsoft 365 email from session (most secure)
        if (req.session?.msUser?.username) {
            resolvedUserId = `ms365:${req.session.msUser.username}`;
            resolutionMethod = 'session-ms365';
        }
        // Priority 2: Microsoft 365 email from JWT token (for API calls)
        else if (req.user?.microsoftEmail) {
            resolvedUserId = `ms365:${req.user.microsoftEmail}`;
            resolutionMethod = 'jwt-ms365';
        }
        // Priority 3: Existing userId from req.user (if already set correctly with ms365 prefix)
        else if (req.user?.userId?.startsWith('ms365:')) {
            resolvedUserId = req.user.userId;
            resolutionMethod = 'existing-ms365';
        }
        // Priority 4: Try to extract Microsoft 365 identity from any available source
        // Check if auth middleware has already set a proper user context
        else if (req.user?.userId && req.user.microsoftEmail) {
            // Trust the auth middleware's determination
            resolvedUserId = req.user.userId;
            resolutionMethod = 'auth-middleware';
        }
        // Priority 5: Session-based fallback (less secure, avoid if possible)
        else if (req.session?.id && req.session.msUser?.username) {
            // Even in fallback, prefer Microsoft 365 identity if available
            resolvedUserId = `ms365:${req.session.msUser.username}`;
            resolutionMethod = 'session-fallback-ms365';
        }
        // Priority 6: Last resort - session ID (should be avoided)
        else if (req.session?.id) {
            console.warn('[USER-ID-RESOLVER] Falling back to session ID - Microsoft 365 auth missing');
            resolvedUserId = `session:${req.session.id}`;
            resolutionMethod = 'session-fallback';
        }
        // Priority 7: Legacy userId from req.user (should not happen with proper auth)
        else if (req.user?.userId) {
            console.warn('[USER-ID-RESOLVER] Using legacy userId format:', req.user.userId);
            resolvedUserId = req.user.userId;
            resolutionMethod = 'legacy-user';
        }
        
        // Pattern 2: User Activity Logs
        if (resolvedUserId) {
            if (contextUserId) {
                MonitoringService.info('User ID resolved successfully', {
                    resolvedUserId: resolvedUserId.substring(0, 20) + '...',
                    resolutionMethod,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'user-resolver', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.info('User ID resolved with session', {
                    sessionId: contextSessionId,
                    resolvedUserId: resolvedUserId.substring(0, 20) + '...',
                    resolutionMethod,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'user-resolver');
            }
        }
        
        return resolvedUserId;
        
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'user-resolver',
            'Failed to resolve user ID',
            'error',
            {
                operation: 'resolveUserId',
                error: error.message,
                stack: error.stack,
                hasSession: !!req.session,
                hasUser: !!req.user,
                userId: contextUserId,
                sessionId: contextSessionId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        if (contextUserId) {
            MonitoringService.error('User ID resolution failed', {
                error: error.message,
                operation: 'resolveUserId',
                timestamp: new Date().toISOString()
            }, 'user-resolver', null, contextUserId);
        } else if (contextSessionId) {
            MonitoringService.error('User ID resolution failed', {
                sessionId: contextSessionId,
                error: error.message,
                operation: 'resolveUserId',
                timestamp: new Date().toISOString()
            }, 'user-resolver');
        }
        
        return null;
    }
}

/**
 * Gets Microsoft 365 user details if available
 * @param {Object} req - Express request object
 * @param {string} userId - Optional userId for context
 * @param {string} sessionId - Optional sessionId for context
 * @returns {Object|null} Microsoft 365 user details
 */
function getMicrosoftUserDetails(req, userId, sessionId) {
    const startTime = Date.now();
    
    try {
        // Extract context for logging
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing Microsoft user details request', {
                hasSession: !!req.session,
                hasMsUser: !!req.session?.msUser,
                hasUserObject: !!req.user,
                hasMicrosoftEmail: !!req.user?.microsoftEmail,
                sessionId: contextSessionId,
                userAgent: req?.get ? req.get('User-Agent') : 'N/A',
                timestamp: new Date().toISOString(),
                userId: contextUserId
            }, 'user-resolver');
        }
        
        let userDetails = null;
        let detailsSource = null;
        
        // From session
        if (req.session?.msUser) {
            userDetails = {
                email: req.session.msUser.username,
                name: req.session.msUser.name,
                homeAccountId: req.session.msUser.homeAccountId
            };
            detailsSource = 'session';
        }
        // From JWT token
        else if (req.user?.microsoftEmail) {
            userDetails = {
                email: req.user.microsoftEmail,
                name: req.user.microsoftName,
                homeAccountId: req.user.homeAccountId
            };
            detailsSource = 'jwt-token';
        }
        
        // Pattern 2: User Activity Logs
        if (userDetails) {
            if (contextUserId) {
                MonitoringService.info('Microsoft user details retrieved successfully', {
                    detailsSource,
                    hasEmail: !!userDetails.email,
                    hasName: !!userDetails.name,
                    hasHomeAccountId: !!userDetails.homeAccountId,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'user-resolver', null, contextUserId);
            } else if (contextSessionId) {
                MonitoringService.info('Microsoft user details retrieved with session', {
                    sessionId: contextSessionId,
                    detailsSource,
                    hasEmail: !!userDetails.email,
                    hasName: !!userDetails.name,
                    hasHomeAccountId: !!userDetails.homeAccountId,
                    duration: Date.now() - startTime,
                    timestamp: new Date().toISOString()
                }, 'user-resolver');
            }
        }
        
        return userDetails;
        
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'user-resolver',
            'Failed to get Microsoft user details',
            'error',
            {
                operation: 'getMicrosoftUserDetails',
                error: error.message,
                stack: error.stack,
                hasSession: !!req.session,
                hasUser: !!req.user,
                userId: contextUserId,
                sessionId: contextSessionId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        if (contextUserId) {
            MonitoringService.error('Microsoft user details retrieval failed', {
                error: error.message,
                operation: 'getMicrosoftUserDetails',
                timestamp: new Date().toISOString()
            }, 'user-resolver', null, contextUserId);
        } else if (contextSessionId) {
            MonitoringService.error('Microsoft user details retrieval failed', {
                sessionId: contextSessionId,
                error: error.message,
                operation: 'getMicrosoftUserDetails',
                timestamp: new Date().toISOString()
            }, 'user-resolver');
        }
        
        return null;
    }
}

/**
 * Ensures req.user has the correct userId format
 * This should be called after authentication middleware
 * @param {Object} req - Express request object
 * @param {string} userId - Optional userId for context
 * @param {string} sessionId - Optional sessionId for context
 */
function normalizeUserContext(req, userId, sessionId) {
    const startTime = Date.now();
    
    try {
        // Extract context for logging
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing user context normalization request', {
                hasUserObject: !!req.user,
                hasSession: !!req.session,
                hasMsUser: !!req.session?.msUser,
                sessionId: contextSessionId,
                userAgent: req?.get ? req.get('User-Agent') : 'N/A',
                timestamp: new Date().toISOString(),
                userId: contextUserId
            }, 'user-resolver');
        }
        
        if (!req.user) {
            req.user = {};
        }
        
        const originalUserId = req.user.userId;
        const resolvedUserId = resolveUserId(req, contextUserId, contextSessionId);
        const msUserDetails = getMicrosoftUserDetails(req, contextUserId, contextSessionId);
        
        // Update req.user with consistent information
        req.user.userId = resolvedUserId;
        
        if (msUserDetails) {
            req.user.microsoftEmail = msUserDetails.email;
            req.user.microsoftName = msUserDetails.name;
            req.user.homeAccountId = msUserDetails.homeAccountId;
        }
        
        // Pattern 2: User Activity Logs
        if (contextUserId) {
            MonitoringService.info('User context normalized successfully', {
                userIdChanged: originalUserId !== resolvedUserId,
                hasResolvedUserId: !!resolvedUserId,
                hasMicrosoftDetails: !!msUserDetails,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'user-resolver', null, contextUserId);
        } else if (contextSessionId) {
            MonitoringService.info('User context normalized with session', {
                sessionId: contextSessionId,
                userIdChanged: originalUserId !== resolvedUserId,
                hasResolvedUserId: !!resolvedUserId,
                hasMicrosoftDetails: !!msUserDetails,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'user-resolver');
        }
        
        return req.user;
        
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'user-resolver',
            'Failed to normalize user context',
            'error',
            {
                operation: 'normalizeUserContext',
                error: error.message,
                stack: error.stack,
                hasSession: !!req.session,
                hasUser: !!req.user,
                userId: contextUserId,
                sessionId: contextSessionId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        const contextUserId = userId || req?.user?.userId;
        const contextSessionId = sessionId || req?.session?.id;
        if (contextUserId) {
            MonitoringService.error('User context normalization failed', {
                error: error.message,
                operation: 'normalizeUserContext',
                timestamp: new Date().toISOString()
            }, 'user-resolver', null, contextUserId);
        } else if (contextSessionId) {
            MonitoringService.error('User context normalization failed', {
                sessionId: contextSessionId,
                error: error.message,
                operation: 'normalizeUserContext',
                timestamp: new Date().toISOString()
            }, 'user-resolver');
        }
        
        // Return original req.user or empty object on error
        return req.user || {};
    }
}

module.exports = {
    resolveUserId,
    getMicrosoftUserDetails,
    normalizeUserContext
};
