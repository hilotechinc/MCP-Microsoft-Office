/**
 * @fileoverview GraphClientFactory creates authenticated Microsoft Graph API clients.
 * Uses user-provided access tokens from AuthService. No secrets, fully async, testable.
 */

const graphNormalizer = require('./normalizers.cjs');
const msalService = require('../auth/msal-service.cjs');
const cacheService = require('../core/cache-service.cjs');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');
const fetch = require('node-fetch');

// Log service initialization - use optional chaining to prevent errors if service not fully initialized
MonitoringService?.info?.('Graph Client initialized', {
    serviceName: 'graph-client',
    timestamp: new Date().toISOString()
}, 'graph');

/**
 * Creates an authenticated Graph client.
 * @param {Object} req - Express request object (optional)
 * @returns {Promise<GraphClient>}
 */
async function createClient(req) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService?.debug('Graph client creation started', {
            method: 'createClient',
            hasRequest: !!req,
            timestamp: new Date().toISOString()
        }, 'graph');
    }
    
    try {
        // Determine the type of request
        const isApiCall = req && (req.isApiCall || req.path?.startsWith('/v1/') || req.headers?.['x-mcp-internal-call'] === 'true');
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService?.debug('Graph client creation type determined', {
                isApiCall,
                requestType: isApiCall ? 'API call' : 'regular request',
                timestamp: new Date().toISOString()
            }, 'graph');
        }
        
        let token;
        
        // For API calls (including internal MCP calls), use the stored token
        if (isApiCall) {
            if (process.env.NODE_ENV === 'development') {
                MonitoringService?.debug('Getting stored token for API call', {
                    timestamp: new Date().toISOString()
                }, 'graph');
            }
            token = await msalService.getMostRecentToken();
        } else {
            // Normal flow - get token from session
            if (process.env.NODE_ENV === 'development') {
                MonitoringService?.debug('Getting token from session', {
                    timestamp: new Date().toISOString()
                }, 'graph');
            }
            token = await msalService.getAccessToken(req);
        }
        
        if (!token) {
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.AUTH,
                'No access token available for Graph client',
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'graph-client',
                    method: 'createClient',
                    isApiCall,
                    timestamp: new Date().toISOString()
                }
            );
            MonitoringService?.logError(mcpError);
            throw mcpError;
        }
        
        const client = new GraphClient(token);
        const executionTime = Date.now() - startTime;
        
        MonitoringService?.trackMetric('graph_client_creation_success', executionTime, {
            service: 'graph-client',
            method: 'createClient',
            isApiCall,
            timestamp: new Date().toISOString()
        });
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService?.debug('Graph client created successfully', {
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'graph');
        }
        
        return client;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // If it's already an MCP error, just track metrics and rethrow
        if (error.category) {
            MonitoringService?.trackMetric('graph_client_creation_failure', executionTime, {
                service: 'graph-client',
                method: 'createClient',
                errorType: error.code || 'auth_error',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
        
        // Otherwise, wrap in MCP error
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `Graph client creation failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                service: 'graph-client',
                method: 'createClient',
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService?.logError(mcpError);
        MonitoringService?.trackMetric('graph_client_creation_failure', executionTime, {
            service: 'graph-client',
            method: 'createClient',
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
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
            async put(body, options = {}) {
                return await _fetchWithRetry(path, self.token, 'PUT', body, options);
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
    const startTime = Date.now();
    const url = (path.startsWith('http') ? path : `https://graph.microsoft.com/v1.0${path}`);
    const headers = Object.assign({
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
    }, options.headers || {});
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService?.debug('Graph API request started', {
            method,
            path,
            url,
            hasBody: !!body,
            timestamp: new Date().toISOString()
        }, 'graph');
    }
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        const requestStartTime = Date.now();
        
        try {
            const res = await fetch(url, {
                method,
                headers,
                body: body ? JSON.stringify(body) : undefined
            });
            
            const responseTime = Date.now() - requestStartTime;
            const totalTime = Date.now() - startTime;
            
            // Track all Graph API requests
            MonitoringService?.trackMetric('graph_api_request', responseTime, {
                method: method,
                endpoint: path,
                statusCode: res.status,
                success: res.ok,
                attempt: attempt + 1,
                timestamp: new Date().toISOString()
            });
            
            if (res.status === 202) { 
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService?.debug('Graph API request accepted', {
                        method,
                        path,
                        status: 202,
                        responseTimeMs: responseTime,
                        totalTimeMs: totalTime,
                        timestamp: new Date().toISOString()
                    }, 'graph');
                }
                return { success: true, status: res.status }; 
            }
            
            if (res.ok) {
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService?.debug('Graph API request successful', {
                        method,
                        path,
                        status: res.status,
                        responseTimeMs: responseTime,
                        totalTimeMs: totalTime,
                        timestamp: new Date().toISOString()
                    }, 'graph');
                }
                return await res.json();
            }
            
            if (res.status === 429) {
                const retryAfter = Number(res.headers.get('retry-after')) || 1;
                
                MonitoringService?.trackMetric('graph_api_throttled', responseTime, {
                    method,
                    endpoint: path,
                    attempt: attempt + 1,
                    retryAfter,
                    timestamp: new Date().toISOString()
                });
                
                if (attempt === retries) {
                    const mcpError = ErrorService.createError(
                        ErrorService.CATEGORIES.API,
                        `Graph API throttled (429) after ${retries+1} attempts`,
                        ErrorService.SEVERITIES.ERROR,
                        {
                            service: 'graph-client',
                            method: '_fetchWithRetry',
                            path,
                            httpMethod: method,
                            attempts: retries + 1,
                            retryAfter,
                            timestamp: new Date().toISOString()
                        }
                    );
                    MonitoringService?.logError(mcpError);
                    throw mcpError;
                }
                
                if (process.env.NODE_ENV === 'development') {
                    MonitoringService?.debug('Graph API throttled, retrying', {
                        method,
                        path,
                        attempt: attempt + 1,
                        retryAfter,
                        timestamp: new Date().toISOString()
                    }, 'graph');
                }
                
                await new Promise(r => setTimeout(r, retryAfter * 1000));
                continue;
            }
            
            // For the last attempt, get detailed error information
            if (attempt === retries) {
                try {
                    const errorData = await res.json();
                    
                    const mcpError = ErrorService.createError(
                        ErrorService.CATEGORIES.API,
                        errorData.error ? 
                            `Graph API request failed: ${res.status} - ${errorData.error.code}: ${errorData.error.message}` :
                            `Graph API request failed: ${res.status}`,
                        ErrorService.SEVERITIES.ERROR,
                        {
                            service: 'graph-client',
                            method: '_fetchWithRetry',
                            path,
                            httpMethod: method,
                            statusCode: res.status,
                            graphError: errorData.error,
                            attempts: retries + 1,
                            timestamp: new Date().toISOString()
                        }
                    );
                    
                    MonitoringService?.logError(mcpError);
                    MonitoringService?.trackMetric('graph_api_error', totalTime, {
                        method,
                        endpoint: path,
                        statusCode: res.status,
                        errorCode: errorData.error?.code || 'unknown',
                        timestamp: new Date().toISOString()
                    });
                    
                    throw mcpError;
                } catch (parseError) {
                    // If we can't parse the error response as JSON
                    const errorText = await res.text().catch(() => 'Unable to read error response');
                    
                    const mcpError = ErrorService.createError(
                        ErrorService.CATEGORIES.API,
                        `Graph API request failed: ${res.status} - ${errorText.substring(0, 200)}`,
                        ErrorService.SEVERITIES.ERROR,
                        {
                            service: 'graph-client',
                            method: '_fetchWithRetry',
                            path,
                            httpMethod: method,
                            statusCode: res.status,
                            errorText: errorText.substring(0, 200),
                            parseError: parseError.message,
                            attempts: retries + 1,
                            timestamp: new Date().toISOString()
                        }
                    );
                    
                    MonitoringService?.logError(mcpError);
                    MonitoringService?.trackMetric('graph_api_error', totalTime, {
                        method,
                        endpoint: path,
                        statusCode: res.status,
                        errorType: 'parse_error',
                        timestamp: new Date().toISOString()
                    });
                    
                    throw mcpError;
                }
            }
        } catch (error) {
            const responseTime = Date.now() - requestStartTime;
            
            // If it's already an MCP error, just rethrow
            if (error.category) {
                throw error;
            }
            
            // Network or other fetch errors
            if (attempt === retries) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.SYSTEM,
                    `Graph API network error: ${error.message}`,
                    ErrorService.SEVERITIES.ERROR,
                    {
                        service: 'graph-client',
                        method: '_fetchWithRetry',
                        path,
                        httpMethod: method,
                        networkError: error.message,
                        attempts: retries + 1,
                        timestamp: new Date().toISOString()
                    }
                );
                
                MonitoringService?.logError(mcpError);
                MonitoringService?.trackMetric('graph_api_network_error', responseTime, {
                    method,
                    endpoint: path,
                    errorType: 'network',
                    timestamp: new Date().toISOString()
                });
                
                throw mcpError;
            }
        }
    }
}

/**
 * Enhanced batch method: retries only failed requests (429) after retry-after delay.
 */
GraphClient.prototype.batch = async function(requests, retries = 2) {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService?.debug('Graph API batch request started', {
            method: 'batch',
            requestCount: requests.length,
            timestamp: new Date().toISOString()
        }, 'graph');
    }
    
    try {
        let pending = requests.map((req, i) => ({ ...req, _idx: i }));
        let results = new Array(requests.length);
        let attempts = 0;
        
        while (pending.length && attempts <= retries) {
            const batchStartTime = Date.now();
            const response = await _fetchWithRetry('/$batch', this.token, 'POST', { requests: pending }, {});
            const batchTime = Date.now() - batchStartTime;
            
            MonitoringService?.trackMetric('graph_api_batch_request', batchTime, {
                requestCount: pending.length,
                attempt: attempts + 1,
                timestamp: new Date().toISOString()
            });
            
            const retryRequests = [];
            let maxRetryAfter = 0;
            let successCount = 0;
            let throttledCount = 0;
            
            (response.responses || []).forEach((r, idx) => {
                const origIdx = pending[idx]._idx;
                if (r.status === 429) {
                    const retryAfter = Number((r.headers && r.headers['retry-after']) || 1);
                    maxRetryAfter = Math.max(maxRetryAfter, retryAfter);
                    retryRequests.push(pending[idx]);
                    throttledCount++;
                } else {
                    results[origIdx] = r.body;
                    successCount++;
                }
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService?.debug('Graph API batch attempt completed', {
                    attempt: attempts + 1,
                    successCount,
                    throttledCount,
                    pendingCount: retryRequests.length,
                    maxRetryAfter,
                    timestamp: new Date().toISOString()
                }, 'graph');
            }
            
            if (!retryRequests.length) break;
            
            if (attempts === retries) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.API,
                    'Graph API batch throttled (429) after max retries',
                    ErrorService.SEVERITIES.ERROR,
                    {
                        service: 'graph-client',
                        method: 'batch',
                        totalRequests: requests.length,
                        throttledRequests: retryRequests.length,
                        attempts: retries + 1,
                        maxRetryAfter,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService?.logError(mcpError);
                throw mcpError;
            }
            
            await new Promise(r => setTimeout(r, maxRetryAfter * 1000));
            pending = retryRequests;
            attempts++;
        }
        
        const executionTime = Date.now() - startTime;
        MonitoringService?.trackMetric('graph_api_batch_success', executionTime, {
            service: 'graph-client',
            method: 'batch',
            totalRequests: requests.length,
            totalAttempts: attempts + 1,
            timestamp: new Date().toISOString()
        });
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService?.debug('Graph API batch completed successfully', {
                totalRequests: requests.length,
                totalAttempts: attempts + 1,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'graph');
        }
        
        return results;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // If it's already an MCP error, just track metrics and rethrow
        if (error.category) {
            MonitoringService?.trackMetric('graph_api_batch_failure', executionTime, {
                service: 'graph-client',
                method: 'batch',
                totalRequests: requests.length,
                errorType: error.code || 'api_error',
                timestamp: new Date().toISOString()
            });
            throw error;
        }
        
        // Otherwise, wrap in MCP error
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.API,
            `Graph API batch operation failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                service: 'graph-client',
                method: 'batch',
                totalRequests: requests.length,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService?.logError(mcpError);
        MonitoringService?.trackMetric('graph_api_batch_failure', executionTime, {
            service: 'graph-client',
            method: 'batch',
            totalRequests: requests.length,
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
};

module.exports = { createClient, GraphClient };
