/**
 * @fileoverview LLM service for interacting with OpenAI or Claude.
 * Handles API key validation, model selection, and API calls.
 */
const process = require('process');
const fetch = require('node-fetch');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

// Load environment variables
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

// Log service initialization
MonitoringService.info('LLM Service initialized', {
    serviceName: 'llm-service',
    provider: LLM_PROVIDER,
    hasOpenAIKey: !!OPENAI_API_KEY,
    hasClaudeKey: !!CLAUDE_API_KEY,
    timestamp: new Date().toISOString()
}, 'llm');

/**
 * Returns true if an LLM API key is configured in the environment.
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<boolean>}
 */
async function isConfigured(userId, sessionId) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('LLM configuration check started', {
            method: 'isConfigured',
            provider: LLM_PROVIDER,
            userId: userId ? userId.substring(0, 20) + '...' : 'anonymous',
            sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
            timestamp: new Date().toISOString()
        }, 'llm');
    }
    
    try {
        let isConfigured = false;
        
        // Check if the API key exists for the configured provider
        if (LLM_PROVIDER === 'openai' && OPENAI_API_KEY) {
            isConfigured = true;
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('OpenAI API key found', {
                    provider: 'openai',
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
        } else if (LLM_PROVIDER === 'claude' && CLAUDE_API_KEY) {
            isConfigured = true;
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Claude API key found', {
                    provider: 'claude',
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
        }
        
        const executionTime = Date.now() - startTime;
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('LLM configuration check completed successfully', {
                provider: LLM_PROVIDER,
                configured: isConfigured,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'llm', null, userId);
        } else if (sessionId) {
            MonitoringService.info('LLM configuration check completed with session', {
                sessionId: sessionId.substring(0, 8) + '...',
                provider: LLM_PROVIDER,
                configured: isConfigured,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'llm');
        }
        
        MonitoringService.trackMetric('llm_is_configured_check', executionTime, {
            service: 'llm-service',
            method: 'isConfigured',
            provider: LLM_PROVIDER,
            configured: isConfigured,
            timestamp: new Date().toISOString()
        });
        
        return isConfigured;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'llm',
            `LLM configuration check failed: ${error.message}`,
            'error',
            {
                service: 'llm-service',
                method: 'isConfigured',
                provider: LLM_PROVIDER,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('LLM configuration check failed', {
                error: error.message,
                provider: LLM_PROVIDER,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'llm', null, userId);
        } else if (sessionId) {
            MonitoringService.error('LLM configuration check failed', {
                sessionId: sessionId.substring(0, 8) + '...',
                error: error.message,
                provider: LLM_PROVIDER,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'llm');
        }
        
        MonitoringService.trackMetric('llm_is_configured_failure', executionTime, {
            service: 'llm-service',
            method: 'isConfigured',
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

/**
 * Returns details about the current LLM config status.
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 * @returns {Promise<object>}
 */
async function statusDetails(userId, sessionId) {
    const startTime = Date.now();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('LLM status details check started', {
            method: 'statusDetails',
            provider: LLM_PROVIDER,
            userId: userId ? userId.substring(0, 20) + '...' : 'anonymous',
            sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'none',
            timestamp: new Date().toISOString()
        }, 'llm');
    }
    
    try {
        let result;
        
        if (LLM_PROVIDER === 'openai' && OPENAI_API_KEY) {
            result = await _checkOpenAIStatus(startTime, userId, sessionId);
        } else if (LLM_PROVIDER === 'claude' && CLAUDE_API_KEY) {
            result = await _checkClaudeStatus(startTime, userId, sessionId);
        } else {
            const executionTime = Date.now() - startTime;
            
            result = {
                provider: LLM_PROVIDER,
                status: 'not_configured',
                error: `No API key configured for ${LLM_PROVIDER}`
            };
            
            MonitoringService.trackMetric('llm_status_details_no_config', executionTime, {
                service: 'llm-service',
                method: 'statusDetails',
                provider: LLM_PROVIDER,
                timestamp: new Date().toISOString()
            });
        }
        
        const executionTime = Date.now() - startTime;
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('LLM status details check completed successfully', {
                provider: LLM_PROVIDER,
                status: result.status,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'llm', null, userId);
        } else if (sessionId) {
            MonitoringService.info('LLM status details check completed with session', {
                sessionId: sessionId.substring(0, 8) + '...',
                provider: LLM_PROVIDER,
                status: result.status,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'llm');
        }
        
        return result;
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'llm',
            `LLM status check failed: ${error.message}`,
            'error',
            {
                service: 'llm-service',
                method: 'statusDetails',
                provider: LLM_PROVIDER,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('LLM status details check failed', {
                error: error.message,
                provider: LLM_PROVIDER,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'llm', null, userId);
        } else if (sessionId) {
            MonitoringService.error('LLM status details check failed', {
                sessionId: sessionId.substring(0, 8) + '...',
                error: error.message,
                provider: LLM_PROVIDER,
                executionTimeMs: executionTime,
                timestamp: new Date().toISOString()
            }, 'llm');
        }
        
        MonitoringService.trackMetric('llm_status_details_failure', executionTime, {
            service: 'llm-service',
            method: 'statusDetails',
            errorType: error.code || 'unknown',
            timestamp: new Date().toISOString()
        });
        
        throw mcpError;
    }
}

/**
 * Checks OpenAI API status and available models.
 * @private
 * @param {number} overallStartTime - Start time for overall operation
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 */
async function _checkOpenAIStatus(overallStartTime, userId, sessionId) {
    const requestStartTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Checking OpenAI API status', {
            keyPrefix: OPENAI_API_KEY.substring(0, 5) + '...',
            timestamp: new Date().toISOString()
        }, 'llm');
    }
    
    try {
        const res = await fetch('https://api.openai.com/v1/models', {
            headers: {
                'Authorization': `Bearer ${OPENAI_API_KEY}`
            },
            timeout: 5000
        });
        
        const requestTime = Date.now() - requestStartTime;
        const overallTime = Date.now() - overallStartTime;
        
        MonitoringService.trackMetric('llm_openai_api_request', requestTime, {
            endpoint: '/v1/models',
            statusCode: res.status,
            success: res.ok,
            timestamp: new Date().toISOString()
        });
        
        if (res.ok) {
            const data = await res.json();
            const models = data.data.map(model => model.id).filter(id => 
                id.startsWith('gpt-4') || id.startsWith('gpt-3.5')
            ).slice(0, 5); // Limit to 5 models
            
            MonitoringService.trackMetric('llm_status_details_success', overallTime, {
                service: 'llm-service',
                method: 'statusDetails',
                provider: 'openai',
                modelCount: models.length,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('OpenAI API check successful', {
                    modelCount: models.length,
                    requestTimeMs: requestTime,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            return { 
                provider: 'OpenAI', 
                apiKey: 'valid', 
                status: 'connected',
                models
            };
        }
        
        MonitoringService.trackMetric('llm_status_details_api_error', overallTime, {
            service: 'llm-service',
            method: 'statusDetails',
            provider: 'openai',
            httpStatus: res.status,
            timestamp: new Date().toISOString()
        });
        
        return { 
            provider: 'OpenAI', 
            apiKey: 'invalid', 
            status: 'error', 
            httpStatus: res.status 
        };
    } catch (error) {
        const requestTime = Date.now() - requestStartTime;
        const overallTime = Date.now() - overallStartTime;
        
        MonitoringService.trackMetric('llm_openai_api_error', requestTime, {
            endpoint: '/v1/models',
            errorType: 'network',
            timestamp: new Date().toISOString()
        });
        
        MonitoringService.trackMetric('llm_status_details_network_error', overallTime, {
            service: 'llm-service',
            method: 'statusDetails',
            provider: 'openai',
            timestamp: new Date().toISOString()
        });
        
        return { 
            provider: 'OpenAI', 
            apiKey: 'invalid', 
            status: 'error', 
            error: error.message 
        };
    }
}

/**
 * Checks Claude API status with a minimal test message.
 * @private
 * @param {number} overallStartTime - Start time for overall operation
 * @param {string} [userId] - User ID for logging context
 * @param {string} [sessionId] - Session ID for logging context
 */
async function _checkClaudeStatus(overallStartTime, userId, sessionId) {
    const requestStartTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Checking Claude API status', {
            timestamp: new Date().toISOString()
        }, 'llm');
    }
    
    try {
        // Claude doesn't have a models endpoint, so we'll just check if the API key works
        const res = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'x-api-key': CLAUDE_API_KEY,
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-haiku-20240307',
                max_tokens: 10,
                messages: [{
                    role: 'user',
                    content: 'Hello'
                }]
            }),
            timeout: 5000
        });
        
        const requestTime = Date.now() - requestStartTime;
        const overallTime = Date.now() - overallStartTime;
        
        MonitoringService.trackMetric('llm_claude_api_request', requestTime, {
            endpoint: '/v1/messages',
            statusCode: res.status,
            success: res.ok,
            timestamp: new Date().toISOString()
        });
        
        if (res.ok) {
            MonitoringService.trackMetric('llm_status_details_success', overallTime, {
                service: 'llm-service',
                method: 'statusDetails',
                provider: 'claude',
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Claude API check successful', {
                    requestTimeMs: requestTime,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            return { 
                provider: 'Claude', 
                apiKey: 'valid', 
                status: 'connected',
                models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
            };
        }
        
        MonitoringService.trackMetric('llm_status_details_api_error', overallTime, {
            service: 'llm-service',
            method: 'statusDetails',
            provider: 'claude',
            httpStatus: res.status,
            timestamp: new Date().toISOString()
        });
        
        return { 
            provider: 'Claude', 
            apiKey: 'invalid', 
            status: 'error', 
            httpStatus: res.status 
        };
    } catch (error) {
        const requestTime = Date.now() - requestStartTime;
        const overallTime = Date.now() - overallStartTime;
        
        MonitoringService.trackMetric('llm_claude_api_error', requestTime, {
            endpoint: '/v1/messages',
            errorType: 'network',
            timestamp: new Date().toISOString()
        });
        
        MonitoringService.trackMetric('llm_status_details_network_error', overallTime, {
            service: 'llm-service',
            method: 'statusDetails',
            provider: 'claude',
            timestamp: new Date().toISOString()
        });
        
        return { 
            provider: 'Claude', 
            apiKey: 'invalid', 
            status: 'error', 
            error: error.message 
        };
    }
}

module.exports = { isConfigured, statusDetails };
