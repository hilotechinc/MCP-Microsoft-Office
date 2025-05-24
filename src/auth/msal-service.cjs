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

// Session storage for tokens and accounts
let currentSession = null;

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
 * @returns {Promise<string>} The login URL
 */
async function getLoginUrl(req) {
    const { codeVerifier, codeChallenge } = generatePkceCodes();
    if (req && req.session) {
        req.session.pkceCodeVerifier = codeVerifier;
    } else {
        // Store in memory if no session available
        currentSession = { pkceCodeVerifier: codeVerifier };
    }
    
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
                timestamp: new Date().toISOString()
            }, 'auth');
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
    
    // Get code verifier from session or memory
    let codeVerifier;
    if (req.session && req.session.pkceCodeVerifier) {
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Using PKCE codeVerifier from session', {
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        codeVerifier = req.session.pkceCodeVerifier;
    } else if (currentSession && currentSession.pkceCodeVerifier) {
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Using PKCE codeVerifier from memory', {
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        codeVerifier = currentSession.pkceCodeVerifier;
    } else {
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
            delete req.session.pkceCodeVerifier;
        }
        
        // Always store in memory
        currentSession = {
            msUser: userInfo
        };
        
        // Also store in SQLite database for persistence across restarts
        try {
            MonitoringService.info('Storing authentication token in database', {
                username: userInfo.username,
                timestamp: new Date().toISOString()
            }, 'auth');
            await storageService.setSecure('ms-access-token', userInfo.accessToken);
            await storageService.setSetting('ms-user-info', {
                username: userInfo.username,
                name: userInfo.name,
                homeAccountId: userInfo.homeAccountId,
                expiresOn: userInfo.expiresOn
            });
            MonitoringService.info('Authentication token stored successfully', {
                username: userInfo.username,
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
    if (req && req.session && req.session.msUser && req.session.msUser.accessToken) {
        return true;
    }
    
    if (currentSession && currentSession.msUser && currentSession.msUser.accessToken) {
        return true;
    }
    
    return false;
}

/**
 * Get an access token for Microsoft Graph API
 * @param {Object} req - Express request object (optional)
 * @returns {Promise<string>} The access token
 */
async function getAccessToken(req) {
    try {
        // Check Express session if available
        if (req && req.session && req.session.msUser && req.session.msUser.accessToken) {
            // TODO: Check token expiration and refresh if needed
            console.log('[MSAL] Using access token from Express session');
            return req.session.msUser.accessToken;
        }
        
        // Check in-memory session storage as fallback
        if (currentSession && currentSession.msUser && currentSession.msUser.accessToken) {
            // TODO: Check token expiration and refresh if needed
            console.log('[MSAL] Using access token from in-memory session');
            return currentSession.msUser.accessToken;
        }
        
        // If not in memory, try to get from SQLite database
        try {
            const storedToken = await storageService.getSecure('ms-access-token');
            if (storedToken) {
                console.log('[MSAL] Using access token from SQLite database');
                
                // Also load it into memory for future use
                const userInfo = await storageService.getSetting('ms-user-info') || {};
                currentSession = {
                    msUser: {
                        ...userInfo,
                        accessToken: storedToken
                    }
                };
                
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
        
        // If we have an account, try to get a token silently
        if (currentSession && currentSession.msUser && currentSession.msUser.account) {
            const silentRequest = {
                account: currentSession.msUser.account,
                scopes: SCOPES
            };
            
            try {
                const response = await pca.acquireTokenSilent(silentRequest);
                if (response && response.accessToken) {
                    // Update the token in session
                    currentSession.msUser.accessToken = response.accessToken;
                    currentSession.msUser.expiresOn = response.expiresOn;
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
        const userInfo = req.session?.msUser || currentSession?.msUser;
        return {
            authenticated: true,
            user: userInfo.username,
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
        
        // Clear memory storage
        currentSession = null;
        
        // Clear SQLite database storage
        try {
            MonitoringService.info('Clearing authentication token from database', {
                timestamp: new Date().toISOString()
            }, 'auth');
            await storageService.setSecure('ms-access-token', '');
            await storageService.setSetting('ms-user-info', null);
            MonitoringService.info('Authentication token cleared from database', {
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
 * @returns {Promise<string|null>} The most recent access token, or null if none available
 */
async function getMostRecentToken() {
    try {
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Attempting to get most recent token for internal MCP call', {
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        // First try to get token from in-memory session
        if (currentSession && currentSession.msUser && currentSession.msUser.accessToken) {
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Found valid token in in-memory session', {
                    timestamp: new Date().toISOString()
                }, 'auth');
            }
            return currentSession.msUser.accessToken;
        }
        
        // If not in memory, try to get from SQLite database
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Trying to get token from SQLite database', {
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        try {
            const storedToken = await storageService.getSecure('ms-access-token');
            if (storedToken) {
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService.debug('Found valid token in SQLite database', {
                        timestamp: new Date().toISOString()
                    }, 'auth');
                }
                
                // Also load it into memory for future use
                const userInfo = await storageService.getSetting('ms-user-info') || {};
                currentSession = {
                    msUser: {
                        ...userInfo,
                        accessToken: storedToken
                    }
                };
                
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
        
        // If no token found, we have no authenticated user
        MonitoringService.warn('No authenticated user found for internal MCP call', {
            timestamp: new Date().toISOString()
        }, 'auth');
        return null;
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Error getting most recent token: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            { stack: error.stack, timestamp: new Date().toISOString() }
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
