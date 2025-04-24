/**
 * @fileoverview Stub for Microsoft Graph authentication status.
 * Replace with real MSAL logic for production.
 */

/**
 * Returns true if the user is authenticated with Microsoft Graph.
 * @param {Request} req
 * @returns {Promise<boolean>}
 */
let fakeSession = false;

async function isAuthenticated(req) {
    // TODO: Integrate with MSAL session/token logic
    return fakeSession;
}

/**
 * Simulate login (in real code, redirect to Microsoft login)
 */
function getLoginUrl() {
    // In production, generate the real MSAL login URL
    return '/api/auth/login';
}

// Simulate login endpoint (for demo)
async function login(req, res) {
    fakeSession = true;
    res.json({ success: true });
}


/**
 * Returns details about the current authentication status.
 * @param {Request} req
 * @returns {Promise<object>}
 */
async function statusDetails(req) {
    if (fakeSession) {
        return {
            user: 'demo@user',
            message: 'Signed in (stub, replace with real MSAL logic)'
        };
    }
    return {
        user: null,
        message: 'Not signed in (stub, replace with MSAL logic)'
    };
}

module.exports = { isAuthenticated, statusDetails };
