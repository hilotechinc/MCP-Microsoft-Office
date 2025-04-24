/**
 * @fileoverview Handles LLM API key configuration and connection verification for MCP backend.
 * Supports OpenAI API connectivity check.
 */

const fetch = require('node-fetch');

/**
 * Checks if the LLM API is configured and reachable.
 * @returns {Promise<boolean>}
 */
async function isConfigured() {
    try {
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
            }
        });
        return res.ok;
    } catch (err) {
        return false;
    }
}

/**
 * Returns status details for the LLM API connection.
 * @returns {Promise<object>}
 */
async function statusDetails() {
    const configured = await isConfigured();
    return {
        configured,
        provider: 'openai',
        message: configured ? 'OpenAI API key is valid' : 'OpenAI API key is missing or invalid'
    };
}

module.exports = { isConfigured, statusDetails };
