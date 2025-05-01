/**
 * @fileoverview GraphClientFactory creates authenticated Microsoft Graph API clients.
 * Uses user-provided access tokens from AuthService. No secrets, fully async, testable.
 */

const graphNormalizer = require('./normalizers.cjs');
const msalService = require('../auth/msal-service.cjs');
const cacheService = require('../core/cache-service.cjs');
const fetch = require('node-fetch');

/**
 * Creates an authenticated Graph client.
 * @param {Object} req - Express request object (optional)
 * @returns {Promise<GraphClient>}
 */
async function createClient(req) {
    try {
        // Determine the type of request
        const isApiCall = req && (req.isApiCall || req.path?.startsWith('/v1/') || req.headers?.['x-mcp-internal-call'] === 'true');
        console.log(`[Graph Client] Creating client for ${isApiCall ? 'API call' : 'regular request'}`);
        
        let token;
        
        // For API calls (including internal MCP calls), use the stored token
        if (isApiCall) {
            console.log('[Graph Client] Getting stored token for API call');
            token = await msalService.getMostRecentToken();
            console.log(`[Graph Client] Token for API call: ${token ? 'Found' : 'Not found'}`);
        } else {
            // Normal flow - get token from session
            console.log('[Graph Client] Getting token from session');
            token = await msalService.getAccessToken(req);
            console.log(`[Graph Client] Token from session: ${token ? 'Found' : 'Not found'}`);
        }
        
        if (!token) {
            console.error('[Graph Client] No access token available');
            throw new Error('No access token available');
        }
        
        console.log('[Graph Client] Successfully created Graph client with token');
        return new GraphClient(token);
    } catch (error) {
        console.error('[Graph Client] Failed to create Graph client:', error);
        throw error;
    }
}

class GraphClient {
    constructor(token) {
        this.token = token;
    }

    /**
     * Returns a request builder for a Graph API endpoint.
     * @param {string} path - The Graph API path (e.g., '/me')
     */
    api(path) {
        const self = this;
        return {
            async get(options = {}) {
                return await _fetchWithRetry(path, self.token, 'GET', null, options);
            },
            async post(body, options = {}) {
                return await _fetchWithRetry(path, self.token, 'POST', body, options);
            },
            async patch(body, options = {}) {
                return await _fetchWithRetry(path, self.token, 'PATCH', body, options);
            },
            async delete(options = {}) {
                return await _fetchWithRetry(path, self.token, 'DELETE', null, options);
            }
        };
    }

    /**
     * Batch multiple Graph API requests.
     * @param {Array<{method: string, url: string, body?: any}>} requests
     * @returns {Promise<Array<any>>}
     */
    async batch(requests) {
        const response = await _fetchWithRetry('/$batch', this.token, 'POST', { requests }, {});
        return (response.responses || []).map(r => r.body);
    }
}

/**
 * Helper to fetch with retry logic.
 */
/**
 * Helper to fetch with retry logic and respect for Microsoft Graph rate limiting.
 * Retries on 429 (Too Many Requests) using the retry-after header if present.
 * @param {string} path
 * @param {string} token
 * @param {string} method
 * @param {object|null} body
 * @param {object} options
 * @param {number} retries
 */
async function _fetchWithRetry(path, token, method, body, options, retries = 2) {
    const url = (path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`);
    const headers = Object.assign({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    }, options.headers || {});
    for (let attempt = 0; attempt <= retries; attempt++) {
        const res = await fetch(url, {
            method,
            headers,
            body: body ? JSON.stringify(body) : undefined
        });
        if (res.ok) return await res.json();
        if (res.status === 429) {
            const retryAfter = Number(res.headers.get('retry-after')) || 1;
            if (attempt === retries) throw new Error(`Graph API throttled (429) after ${retries+1} attempts`);
            await new Promise(r => setTimeout(r, retryAfter * 1000));
            continue;
        }
        
        // For the last attempt, get detailed error information
        if (attempt === retries) {
            try {
                const errorData = await res.json();
                console.error('Graph API error details:', JSON.stringify(errorData, null, 2));
                const errorMessage = errorData.error ? 
                    `Graph API request failed: ${res.status} - ${errorData.error.code}: ${errorData.error.message}` :
                    `Graph API request failed: ${res.status}`;
                throw new Error(errorMessage);
            } catch (parseError) {
                // If we can't parse the error response as JSON
                const errorText = await res.text().catch(() => 'Unable to read error response');
                console.error('Graph API error text:', errorText);
                throw new Error(`Graph API request failed: ${res.status} - ${errorText.substring(0, 200)}`);
            }
        }
    }
}

/**
 * Enhanced batch method: retries only failed requests (429) after retry-after delay.
 */
GraphClient.prototype.batch = async function(requests, retries = 2) {
    let pending = requests.map((req, i) => ({ ...req, _idx: i }));
    let results = new Array(requests.length);
    let attempts = 0;
    while (pending.length && attempts <= retries) {
        const response = await _fetchWithRetry('/$batch', this.token, 'POST', { requests: pending }, {});
        const retryRequests = [];
        let maxRetryAfter = 0;
        (response.responses || []).forEach((r, idx) => {
            const origIdx = pending[idx]._idx;
            if (r.status === 429) {
                const retryAfter = Number((r.headers && r.headers['retry-after']) || 1);
                maxRetryAfter = Math.max(maxRetryAfter, retryAfter);
                retryRequests.push(pending[idx]);
            } else {
                results[origIdx] = r.body;
            }
        });
        if (!retryRequests.length) break;
        if (attempts === retries) throw new Error('Graph API batch throttled (429) after max retries');
        await new Promise(r => setTimeout(r, maxRetryAfter * 1000));
        pending = retryRequests;
        attempts++;
    }
    return results;
};

module.exports = { createClient, GraphClient };
