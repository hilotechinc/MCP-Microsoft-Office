/**
 * @fileoverview Handles Microsoft Graph authentication for MCP backend.
 * Provides status checks and simulated login for demo/dev.
 */

const msal = require('@azure/msal-node');
const url = require('url');

const CLIENT_ID = process.env.MICROSOFT_CLIENT_ID;
const TENANT_ID = process.env.MICROSOFT_TENANT_ID;
const REDIRECT_URI = process.env.MICROSOFT_REDIRECT_URI || 'http://localhost:3000/api/auth/callback';
const SCOPES = ["User.Read"];

const crypto = require('crypto');

const msalConfig = {
    auth: {
        clientId: CLIENT_ID,
        authority: `https://login.microsoftonline.com/${TENANT_ID}`,
        // NO clientSecret for public client
    },
    system: { loggerOptions: { loggerCallback() {} } }
};
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

function getAuthUrl(req) {
    const { codeVerifier, codeChallenge } = generatePkceCodes();
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

async function handleAuthCallback(req, res) {
    // Debug: log env vars and PKCE verifier
    console.log('[MSAL] CLIENT_ID:', CLIENT_ID);
    console.log('[MSAL] TENANT_ID:', TENANT_ID);
    console.log('[MSAL] REDIRECT_URI:', REDIRECT_URI);
    console.log('[MSAL] PKCE codeVerifier in session:', req.session.pkceCodeVerifier);
    const tokenRequest = {
        code: req.query.code,
        scopes: SCOPES,
        redirectUri: REDIRECT_URI,
        codeVerifier: req.session.pkceCodeVerifier
    };
    try {
        const response = await pca.acquireTokenByCode(tokenRequest);
        req.session.msUser = {
            username: response.account.username,
            name: response.account.name,
            homeAccountId: response.account.homeAccountId,
            accessToken: response.accessToken,
            expiresOn: response.expiresOn
        };
        delete req.session.pkceCodeVerifier;
        res.redirect('/');
    } catch (err) {
        console.error('[MSAL] Auth error:', err);
        res.status(500).send('Authentication failed: ' + (err.message || err));
    }
}

async function isAuthenticated(req) {
    return !!(req.session && req.session.msUser && req.session.msUser.accessToken);
}

async function statusDetails(req) {
    if (await isAuthenticated(req)) {
        return {
            authenticated: true,
            user: req.session.msUser.username,
            message: 'Authenticated',
            logoutUrl: '/api/logout'
        };
    } else {
        return {
            authenticated: false,
            loginUrl: '/api/login',
            message: 'Not authenticated'
        };
    }
}

function login(req, res) {
    getAuthUrl(req)
        .then(authUrl => res.redirect(authUrl))
        .catch(err => res.status(500).send('Failed to get login URL: ' + err.message));
}

function logout(req, res) {
    req.session.destroy(() => {
        res.redirect('/');
    });
}

module.exports = { isAuthenticated, statusDetails, login, handleAuthCallback, logout };
