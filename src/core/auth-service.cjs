/**
 * @fileoverview AuthService manages user-provided Microsoft Graph access tokens.
 * No client secret is used; only user-supplied tokens are accepted and securely stored.
 * Tokens are encrypted at rest using StorageService.
 * All methods are async and testable.
 */

const storageService = require('./storage-service.cjs');

const TOKEN_KEY = 'auth-token';

/**
 * Stores the user's Microsoft Graph access token securely (encrypted).
 * @param {string} token - The access token to store
 * @returns {Promise<void>}
 * @throws {Error} If token is missing or invalid
 */
async function setToken(token) {
    if (!token || typeof token !== 'string' || !token.trim()) {
        throw new Error('Invalid token: must be a non-empty string');
    }
    await storageService.setSecure(TOKEN_KEY, token);
}

/**
 * Retrieves the stored access token (decrypted).
 * @returns {Promise<string|null>} The access token, or null if not set
 */
async function getToken() {
    return await storageService.getSecure(TOKEN_KEY);
}

/**
 * Returns true if a valid access token is stored, false otherwise.
 * @returns {Promise<boolean>}
 */
async function isAuthenticated() {
    const token = await getToken();
    return !!(token && typeof token === 'string' && token.trim());
}

/**
 * Clears the stored access token (logout).
 * @returns {Promise<void>}
 */
async function clearToken() {
    await storageService.setSecure(TOKEN_KEY, '');
}

/**
 * Gets the most recently authenticated user for internal MCP adapter calls.
 * This allows the MCP adapter to use the authenticated session without handling auth itself.
 * @returns {Promise<object|null>} User object with token, or null if no authenticated user
 */
async function getMostRecentAuthenticatedUser() {
    try {
        // Check if we have a valid token
        const token = await getToken();
        if (token && typeof token === 'string' && token.trim()) {
            // Return a user object with the token
            // In a real implementation, you might want to include user details from a database
            return {
                id: 'authenticated-user',
                name: 'Authenticated User',
                token: token
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting most recent authenticated user:', error);
        return null;
    }
}

/**
 * Gets a user by ID from storage.
 * @param {string} userId - The user ID to look up
 * @returns {Promise<object|null>} User object, or null if not found
 */
async function getUserById(userId) {
    try {
        // In a real implementation, you would look up the user in a database
        // For now, we'll just check if we have a valid token and return a user object
        if (userId && await isAuthenticated()) {
            const token = await getToken();
            return {
                id: userId,
                name: 'Authenticated User',
                token: token
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting user by ID:', error);
        return null;
    }
}

/**
 * Gets a user from a token.
 * @param {string} token - The token to use
 * @returns {Promise<object|null>} User object, or null if invalid
 */
async function getUserFromToken(token) {
    try {
        // In a real implementation, you would validate the token and look up the user
        // For now, we'll just return a user object if the token is valid
        if (token && typeof token === 'string' && token.trim()) {
            return {
                id: 'token-user',
                name: 'Token User',
                token: token
            };
        }
        return null;
    } catch (error) {
        console.error('Error getting user from token:', error);
        return null;
    }
}

module.exports = {
    setToken,
    getToken,
    isAuthenticated,
    clearToken,
    getMostRecentAuthenticatedUser,
    getUserById,
    getUserFromToken
};
