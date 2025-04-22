/**
 * @fileoverview AuthService manages user-provided Microsoft Graph access tokens.
 * No client secret is used; only user-supplied tokens are accepted and securely stored.
 * Tokens are encrypted at rest using StorageService.
 * All methods are async and testable.
 */

const storageService = require('./storage-service');

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

module.exports = {
    setToken,
    getToken,
    isAuthenticated,
    clearToken
};
