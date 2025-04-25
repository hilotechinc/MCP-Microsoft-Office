/**
 * @fileoverview Handles Microsoft Graph authentication for MCP backend.
 * Provides status checks and simulated login for demo/dev.
 */

const msal = require('@azure/msal-node');
const url = require('url');
const crypto = require('crypto');

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

// Debug environment variables
console.log('[MSAL] Environment variables:');
console.log('[MSAL] CLIENT_ID:', CLIENT_ID ? 'Set' : 'Not set');
console.log('[MSAL] TENANT_ID:', TENANT_ID);
console.log('[MSAL] REDIRECT_URI:', REDIRECT_URI);

// Session storage for tokens and accounts
let currentSession = null;

const msalConfig = {
    auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        // NO clientSecret for public client
    },
    system: { loggerOptions: { loggerCallback(level, message) { console.log(`MSAL (${level}): ${message}`); } } }
};

// Verify MSAL config
console.log('[MSAL] Config:', JSON.stringify(msalConfig, null, 2));

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
        const authUrl = await getLoginUrl(req);
        res.redirect(authUrl);
    } catch (err) {
        console.error('[MSAL] Login error:', err);
        res.status(500).send('Failed to get login URL: ' + (err.message || err));
    }
}

/**
 * Handle the OAuth callback
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleAuthCallback(req, res) {
    // Debug: log env vars and PKCE verifier
    console.log('[MSAL] CLIENT_ID:', CLIENT_ID);
    console.log('[MSAL] TENANT_ID:', TENANT_ID);
    console.log('[MSAL] REDIRECT_URI:', REDIRECT_URI);
    
    // Get code verifier from session or memory
    let codeVerifier;
    if (req.session && req.session.pkceCodeVerifier) {
        console.log('[MSAL] Using PKCE codeVerifier from session');
        codeVerifier = req.session.pkceCodeVerifier;
    } else if (currentSession && currentSession.pkceCodeVerifier) {
        console.log('[MSAL] Using PKCE codeVerifier from memory');
        codeVerifier = currentSession.pkceCodeVerifier;
    } else {
        console.error('[MSAL] No PKCE codeVerifier found');
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
        
        // Store user info in session or memory
        const userInfo = {
            username: response.account.username,
            name: response.account.name,
            homeAccountId: response.account.homeAccountId,
            accessToken: response.accessToken,
            expiresOn: response.expiresOn,
            account: response.account
        };
        
        if (req.session) {
            req.session.msUser = userInfo;
            delete req.session.pkceCodeVerifier;
        } else {
            currentSession = {
                msUser: userInfo
            };
        }
        
        res.redirect('/');
    } catch (err) {
        console.error('[MSAL] Auth error:', err);
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
                console.log('[MSAL] Session destroyed');
            });
        }
        
        // Clear memory storage
        currentSession = null;
        
        // Redirect to home page
        res.redirect('/');
    } catch (error) {
        console.error('[MSAL] Logout error:', error);
        res.status(500).send('Logout failed: ' + (error.message || error));
    }
}

module.exports = { isAuthenticated, statusDetails, login, handleAuthCallback, logout, getAccessToken };
