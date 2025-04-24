/**
 * @fileoverview Stub for LLM API key/config status.
 * Replace with real LLM provider logic for production.
 */
const process = require('process');

/**
 * Returns true if an LLM API key is configured in the environment.
 * @returns {Promise<boolean>}
 */
const fetch = require('node-fetch');

async function isConfigured() {
    if (process.env.OPENAI_API_KEY) {
        try {
            const res = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                timeout: 5000
            });
            if (res.ok) return true;
        } catch (e) { /* ignore */ }
        return false;
    }
    // TODO: Add Claude ping logic if needed
    return false;
}

/**
 * Returns details about the current LLM config status.
 * @returns {Promise<object>}
 */
async function statusDetails() {
    if (process.env.OPENAI_API_KEY) {
        try {
            const res = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
                },
                timeout: 5000
            });
            if (res.ok) {
                return { provider: 'OpenAI', apiKey: 'valid', status: 'connected' };
            }
            return { provider: 'OpenAI', apiKey: 'invalid', status: 'error', httpStatus: res.status };
        } catch (e) {
            return { provider: 'OpenAI', apiKey: 'invalid', status: 'error', error: e.message };
        }
    }
    // TODO: Add Claude ping logic if needed
    return { provider: null, apiKey: 'missing' };
}

module.exports = { isConfigured, statusDetails };
