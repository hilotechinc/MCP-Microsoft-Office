/**
 * @fileoverview Handles Microsoft Graph authentication for MCP backend.
 * Provides status checks and simulated login for demo/dev.
 */

const msal = require('@azure/msal-node');
const url = require('url');
const crypto = require('crypto');
const storageService = require('../core/storage-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

// Load environment variables
const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID || 'common';
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
// Use scopes that match the permissions granted in Azure AD
const SCOPES = [
    'User.Read',        // Sign in and read user profile
    'openid',
    'profile',
    'email',
    'Calendars.ReadWrite',  // Full access to user calendars
    'Mail.ReadWrite',      // Read and write access to user mail
    'Mail.Send',          // Send mail as a user
    'Files.ReadWrite'      // Full access to user files
];

// Debug environment variables (only in development)
if (process.env.NODE_ENV === 'development') {
    MonitoringService.debug('MSAL environment variables', {
        clientIdSet: CLIENT_ID ? 'Set' : 'Not set',
        tenantId: TENANT_ID,
        redirectUri: REDIRECT_URI,
        timestamp: new Date().toISOString()
    }, 'auth');
}

// Initialize storage service
storageService.init().catch(err => {
    const mcpError = ErrorService.createError(
        ErrorService.CATEGORIES.SYSTEM,
        `MSAL storage service initialization failed: ${err.message}`,
        ErrorService.SEVERITIES.ERROR,
        { stack: err.stack, timestamp: new Date().toISOString() }
    );
    MonitoringService.logError(mcpError);
});

// Session storage for tokens and accounts - Multi-user support
const userSessions = new Map(); // Map<userId, sessionData>

/**
 * Get user session by user ID
 * @param {string} userId - User ID
 * @returns {Object|null} User session data or null
 */
function getUserSession(userId) {
    if (!userId) return null;
    return userSessions.get(userId) || null;
}

/**
 * Set user session data
 * @param {string} userId - User ID
 * @param {Object} sessionData - Session data
 */
function setUserSession(userId, sessionData) {
    if (!userId) return;
    userSessions.set(userId, sessionData);
}

/**
 * Clear user session
 * @param {string} userId - User ID
 */
function clearUserSession(userId) {
    if (!userId) return;
    userSessions.delete(userId);
}

const msalConfig = {
    auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        // NO clientSecret for public client
    },
    system: { 
        loggerOptions: { 
            loggerCallback(level, message) { 
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.AUTH,
                    `MSAL library message: ${message}`,
                    level === 'Error' ? ErrorService.SEVERITIES.ERROR : ErrorService.SEVERITIES.WARNING,
                    { level, timestamp: new Date().toISOString() }
                );
                MonitoringService.logError(mcpError);
            } 
        } 
    }
};

// Verify MSAL config (only in development)
if (process.env.NODE_ENV === 'development') {
    MonitoringService.debug('MSAL configuration', {
        authority: msalConfig.auth.authority,
        clientIdSet: !!msalConfig.auth.clientId,
        timestamp: new Date().toISOString()
    }, 'auth');
}

const pca = new msal.PublicClientApplication(msalConfig);

// Generate PKCE code verifier and code challenge
function generatePkceCodes() {
    const codeVerifier = base64URLEncode(crypto.randomBytes(32));
    const codeChallenge = base64URLEncode(sha256(codeVerifier));
    return { codeVerifier, codeChallenge };
}

function sha256(buffer) {
    return crypto.createHash('sha256').update(buffer).digest();
}

function base64URLEncode(buffer) {
    return buffer.toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
}

/**
 * Get the login URL for Microsoft authentication
 * @param {Object} req - Express request object
 */
async function getLoginUrl(req) {
    const { codeVerifier, codeChallenge } = generatePkceCodes();
    
    // Store PKCE verifier in session (simple approach)
    req.session.pkceCodeVerifier = codeVerifier;
    
    const authCodeUrlParameters = {
        scopes: SCOPES,
        redirectUri: REDIRECT_URI,
        codeChallenge,
        codeChallengeMethod: 'S256',
        prompt: 'select_account'
    };
    
    return pca.getAuthCodeUrl(authCodeUrlParameters);
}

/**
 * Handle login request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function login(req, res) {
    try {
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Login attempt received', {
                hasSession: !!req.session,
                sessionId: req.session?.id,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        // Check if session is available
        if (!req.session) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.AUTH,
                'Session middleware not available',
                'error',
                { endpoint: '/api/auth/login' }
            );
            MonitoringService.logError(mcpError);
            return res.status(500).json({ error: 'Session not available' });
        }
        
        const authUrl = await getLoginUrl(req);
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Generated auth URL', {
                authUrlLength: authUrl.length,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        // Set CORS headers for the redirect
        res.header('Access-Control-Allow-Origin', '*');
        res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
        res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
        
        res.redirect(authUrl);
    } catch (err) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `MSAL login error: ${err.message}`,
            ErrorService.SEVERITIES.ERROR,
            { stack: err.stack, timestamp: new Date().toISOString() }
        );
        MonitoringService.logError(mcpError);
        res.status(500).send('Failed to get login URL: ' + (err.message || err));
    }
}

/**
 * Handle the OAuth callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleAuthCallback(req, res) {
    // Debug: log env vars and PKCE verifier (only in development)
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Auth callback processing', {
            clientIdSet: !!CLIENT_ID,
            tenantId: TENANT_ID,
            redirectUri: REDIRECT_URI,
            timestamp: new Date().toISOString()
        }, 'auth');
    }
    
    // Get code verifier from session
    const codeVerifier = req.session.pkceCodeVerifier;
    if (!codeVerifier) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            'No PKCE codeVerifier found',
            ErrorService.SEVERITIES.ERROR,
            { timestamp: new Date().toISOString() }
        );
        MonitoringService.logError(mcpError);
        return res.status(400).send('Authentication failed: No code verifier found. Please try logging in again.');
    }
    
    const tokenRequest = {
        code: req.query.code,
        scopes: SCOPES,
        redirectUri: REDIRECT_URI,
        codeVerifier: codeVerifier
    };
    
    try {
        const response = await pca.acquireTokenByCode(tokenRequest);
        
        // Store user info in session, memory, and SQLite database
        const userInfo = {
            username: response.account.username,
            name: response.account.name,
            homeAccountId: response.account.homeAccountId,
            accessToken: response.accessToken,
            expiresOn: response.expiresOn,
            account: response.account
        };
        
        // Store in session if available
        if (req.session) {
            req.session.msUser = userInfo;
        }
        
        // Store in user session map
        setUserSession(userInfo.homeAccountId, { msUser: userInfo });
        
        // Clean up temporary session
        delete req.session.pkceCodeVerifier;
        
        // Also store in SQLite database for persistence across restarts
        try {
            MonitoringService.info('Storing authentication token in database', {
                username: userInfo.username,
                sessionId: req.session?.id,
                timestamp: new Date().toISOString()
            }, 'auth');
            
            // Store token using session ID as user identifier for session-based auth
            const userKey = req.session?.id ? `user:${req.session.id}` : 'default';
            await storageService.setSecureSetting(`${userKey}:ms-access-token`, userInfo.accessToken, req.session?.id);
            await storageService.setSetting(`${userKey}:ms-user-info`, {
                username: userInfo.username,
                name: userInfo.name,
                homeAccountId: userInfo.homeAccountId,
                expiresOn: userInfo.expiresOn
            }, req.session?.id);
            
            MonitoringService.info('Authentication token stored successfully', {
                username: userInfo.username,
                sessionId: req.session?.id,
                userKey: userKey,
                timestamp: new Date().toISOString()
            }, 'auth');
        } catch (dbError) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.DATABASE,
                `Error storing token in database: ${dbError.message}`,
                ErrorService.SEVERITIES.WARNING,
                { stack: dbError.stack, timestamp: new Date().toISOString() }
            );
            MonitoringService.logError(mcpError);
            // Continue even if database storage fails
        }
        
        res.redirect('/');
    } catch (err) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Authentication callback error: ${err.message}`,
            ErrorService.SEVERITIES.ERROR,
            { stack: err.stack, timestamp: new Date().toISOString() }
        );
        MonitoringService.logError(mcpError);
        res.status(500).send('Authentication failed: ' + (err.message || err));
    }
}

/**
 * Check if the user is authenticated
 * @param {Object} req - Express request object
 * @returns {Promise<boolean>} - True if authenticated
 */
async function isAuthenticated(req) {
    // Handle both session-based auth (browser) and device-based auth (MCP adapter)
    let userId, sessionId;
    
    if (req.user?.isApiCall && req.user?.userId) {
        // Device auth flow - use userId from JWT token
        userId = req.user.userId;
        sessionId = req.user.sessionId || req.user.userId;
    } else if (req.session?.id) {
        // Session-based auth flow - use session ID
        sessionId = req.session.id;
        userId = `user:${sessionId}`;
    }
    
    MonitoringService.info('Checking authentication status', {
        hasSession: !!req.session,
        sessionId: sessionId,
        hasUser: !!req.user,
        isApiCall: req.user?.isApiCall,
        userId: userId,
        hasMsUser: !!req.session?.msUser,
        hasAccessToken: !!req.session?.msUser?.accessToken,
        timestamp: new Date().toISOString()
    }, 'auth');
    
    // Check if user is authenticated via Express session (primary method for browser)
    if (req.session?.msUser?.accessToken) {
        MonitoringService.info('User authenticated via Express session', {
            username: req.session.msUser.username,
            sessionId: req.session.id,
            timestamp: new Date().toISOString()
        }, 'auth');
        return true;
    }
    
    // Check database storage using userId (works for both session and device auth)
    if (userId) {
        try {
            const tokenKey = `${userId}:ms-access-token`;
            const storedToken = await storageService.getSecureSetting(tokenKey, sessionId);
            if (storedToken) {
                MonitoringService.info('User authenticated via database', {
                    userId: userId,
                    sessionId: sessionId,
                    isApiCall: req.user?.isApiCall,
                    timestamp: new Date().toISOString()
                }, 'auth');
                return true;
            }
        } catch (error) {
            MonitoringService.debug('Failed to check database authentication', {
                userId: userId,
                sessionId: sessionId,
                error: error.message,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
    }
    
    MonitoringService.info('User not authenticated', {
        sessionId: sessionId,
        userId: userId,
        timestamp: new Date().toISOString()
    }, 'auth');
    return false;
}

/**
 * Get an access token for Microsoft Graph API
 * @param {Object} req - Express request object (optional)
 * @returns {Promise<string>} The access token
 */
async function getAccessToken(req) {
    try {
        // Handle both session-based auth (browser) and device-based auth (MCP adapter)
        let userId, sessionId;
        
        if (req.user?.isApiCall && req.user?.userId) {
            // Device auth flow - use userId from JWT token
            userId = req.user.userId;
            sessionId = req.user.sessionId || req.user.userId; // Use userId as sessionId if not provided
            console.log('[MSAL] Getting token for device auth user:', userId);
        } else if (req.session?.id) {
            // Session-based auth flow - use session ID
            sessionId = req.session.id;
            userId = `user:${sessionId}`;
            console.log('[MSAL] Getting token for session user:', userId);
        } else {
            // Fallback to query parameter
            userId = req.query?.userId;
            sessionId = userId;
            console.log('[MSAL] Getting token for query user:', userId);
        }
        
        if (process.env.NODE_ENV === 'development') {
            console.log(`[MSAL] Request details:`, {
                hasReq: !!req,
                hasUser: !!req?.user,
                userObj: req?.user,
                hasSession: !!req?.session,
                sessionId: req?.session?.id,
                extractedUserId: userId
            });
        }
        
        if (!userId) {
            throw new Error('No user ID available for token retrieval');
        }
        
        const userSession = getUserSession(userId);
        if (userSession?.msUser?.accessToken) {
            // TODO: Check token expiration and refresh if needed
            console.log('[MSAL] Using access token from user session');
            return userSession.msUser.accessToken;
        }
        
        // If not in memory, try to get from SQLite database using session-based key
        if (userId) {
            try {
                const tokenKey = `${userId}:ms-access-token`;
                const storedToken = await storageService.getSecureSetting(tokenKey, sessionId);
                if (storedToken) {
                    console.log('[MSAL] Using access token from SQLite database');
                    
                    // Also load it into memory for future use
                    const userInfoKey = `${userId}:ms-user-info`;
                    const userInfo = await storageService.getSetting(userInfoKey, sessionId) || {};
                    setUserSession(userId, {
                        msUser: {
                            ...userInfo,
                            accessToken: storedToken
                        }
                    });
                    
                    return storedToken;
                }
            } catch (dbError) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.DATABASE,
                    `Error getting token from database: ${dbError.message}`,
                    ErrorService.SEVERITIES.WARNING,
                    { stack: dbError.stack, timestamp: new Date().toISOString() }
                );
                MonitoringService.logError(mcpError);
            }
        }
        
        // If we have an account, try to get a token silently
        if (userSession?.msUser?.account) {
            const silentRequest = {
                account: userSession.msUser.account,
                scopes: SCOPES
            };
            
            try {
                const response = await pca.acquireTokenSilent(silentRequest);
                if (response && response.accessToken) {
                    // Update the token in session
                    setUserSession(userId, {
                        msUser: {
                            ...userSession.msUser,
                            accessToken: response.accessToken,
                            expiresOn: response.expiresOn
                        }
                    });
                    return response.accessToken;
                }
            } catch (error) {
                console.log('[MSAL] Silent token acquisition failed:', error);
                throw error;
            }
        }
        
        throw new Error('User not authenticated');
    } catch (error) {
        console.error('[MSAL] Failed to get access token:', error);
        throw error;
    }
}

/**
 * Get detailed status information about the authentication service
 * @param {Object} req - Express request object
 * @returns {Promise<Object>} Status details
 */
async function statusDetails(req) {
    if (await isAuthenticated(req)) {
        // First try to get user info from Express session
        let userInfo = req.session?.msUser;
        
        // Fallback: get from database using session ID
        if (!userInfo && req.session?.id) {
            try {
                const userKey = `user:${req.session.id}`;
                const storedUserInfo = await storageService.getSetting(`${userKey}:ms-user-info`, req.session.id);
                if (storedUserInfo) {
                    userInfo = storedUserInfo;
                }
            } catch (error) {
                MonitoringService.debug('Failed to get user info from database', {
                    sessionId: req.session.id,
                    error: error.message,
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
        }
        
        return {
            authenticated: true,
            user: userInfo?.username || 'Unknown User',
            name: userInfo?.name,
            sessionId: req.session?.id,
            message: 'Authenticated',
            logoutUrl: '/api/auth/logout'
        };
    } else {
        return {
            authenticated: false,
            loginUrl: '/api/auth/login',
            message: 'Not authenticated'
        };
    }
}

/**
 * Handle logout request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function logout(req, res) {
    try {
        // Clear session if available
        if (req.session) {
            req.session.destroy(() => {
                MonitoringService.info('User session destroyed', {
                    timestamp: new Date().toISOString()
                }, 'auth');
            });
        }
        
        // Clear user session
        const userId = req.session?.userId || req.query.userId;
        clearUserSession(userId);
        
        // Clear SQLite database storage
        try {
            MonitoringService.info('Clearing authentication token from database', {
                sessionId: req.session?.id,
                timestamp: new Date().toISOString()
            }, 'auth');
            
            // Clear session-based tokens if session exists
            if (req.session?.id) {
                const userKey = `user:${req.session.id}`;
                await storageService.setSecureSetting(`${userKey}:ms-access-token`, '', req.session.id);
                await storageService.setSetting(`${userKey}:ms-user-info`, null, req.session.id);
            }
            
            MonitoringService.info('Authentication token cleared from database', {
                sessionId: req.session?.id,
                timestamp: new Date().toISOString()
            }, 'auth');
        } catch (dbError) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.DATABASE,
                `Error clearing token from database: ${dbError.message}`,
                ErrorService.SEVERITIES.WARNING,
                { stack: dbError.stack, timestamp: new Date().toISOString() }
            );
            MonitoringService.logError(mcpError);
        }
        
        // Redirect to home page
        res.redirect('/');
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Logout error: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            { stack: error.stack, timestamp: new Date().toISOString() }
        );
        MonitoringService.logError(mcpError);
        res.status(500).send('Logout failed: ' + (error.message || error));
    }
}

/**
 * Get the most recently used access token for internal MCP adapter calls.
 * This allows the MCP adapter to leverage existing authentication without handling it directly.
 * @param {string} userId - User ID for multi-user token isolation
 * @returns {Promise<string|null>} The most recent access token, or null if none available
 */
async function getMostRecentToken(userId) {
    try {
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Attempting to get most recent token for internal MCP call', {
                userId,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        // First try to get token from user sessions
        if (userId) {
            const userSession = getUserSession(userId);
            if (userSession?.msUser?.accessToken) {
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Found valid token in user session', {
                        userId,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                return userSession.msUser.accessToken;
            }
        }
        
        // If userId not provided or no session found, try any available user session
        for (const [sessionUserId, userSession] of userSessions.entries()) {
            if (userSession.msUser?.accessToken) {
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Found valid token in user session', {
                        userId: sessionUserId,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                return userSession.msUser.accessToken;
            }
        }
        
        // If not in memory, try to get from SQLite database with user-specific key
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Trying to get token from SQLite database', {
                userId,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        try {
            const tokenKey = userId ? `user:${userId}:ms-access-token` : 'ms-access-token';
            const storedToken = await storageService.getSecureSetting(tokenKey, userId);
            if (storedToken) {
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Found valid token in SQLite database', {
                        userId,
                        tokenKey,
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                // Also load it into memory for future use
                const userInfoKey = userId ? `user:${userId}:ms-user-info` : 'ms-user-info';
                const userInfo = await storageService.getSetting(userInfoKey, userId) || {};
                if (userId) {
                    setUserSession(userId, {
                        msUser: {
                            ...userInfo,
                            accessToken: storedToken
                        }
                    });
                }
                
                return storedToken;
            }
        } catch (dbError) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.DATABASE,
                `Error getting token from database: ${dbError.message}`,
                ErrorService.SEVERITIES.WARNING,
                { userId, stack: dbError.stack, timestamp: new Date().toISOString() }
            );
            MonitoringService.logError(mcpError);
        }
        
        // If no token found, we have no authenticated user
        MonitoringService.warn('No authenticated user found for internal MCP call', {
            userId,
            timestamp: new Date().toISOString()
        }, 'auth');
        return null;
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Error getting most recent token: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            { userId, stack: error.stack, timestamp: new Date().toISOString() }
        );
        MonitoringService.logError(mcpError);
        return null;
    }
}

module.exports = { 
    isAuthenticated, 
    statusDetails, 
    login, 
    handleAuthCallback, 
    logout, 
    getAccessToken,
    getMostRecentToken
};
