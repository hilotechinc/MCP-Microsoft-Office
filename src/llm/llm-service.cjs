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
 * @returns {Promise<boolean>}
 */
async function isConfigured() {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('LLM configuration check started', {
            method: 'isConfigured',
            provider: LLM_PROVIDER,
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
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `LLM configuration check failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                service: 'llm-service',
                method: 'isConfigured',
                provider: LLM_PROVIDER,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
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
 * @returns {Promise<object>}
 */
async function statusDetails() {
    const startTime = Date.now();
    
    if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('LLM status details check started', {
            method: 'statusDetails',
            provider: LLM_PROVIDER,
            timestamp: new Date().toISOString()
        }, 'llm');
    }
    
    try {
        if (LLM_PROVIDER === 'openai' && OPENAI_API_KEY) {
            return await _checkOpenAIStatus(startTime);
        } else if (LLM_PROVIDER === 'claude' && CLAUDE_API_KEY) {
            return await _checkClaudeStatus(startTime);
        }
        
        // No API key configured
        const executionTime = Date.now() - startTime;
        MonitoringService.trackMetric('llm_status_details_no_key', executionTime, {
            service: 'llm-service',
            method: 'statusDetails',
            provider: LLM_PROVIDER,
            timestamp: new Date().toISOString()
        });
        
        return { 
            provider: LLM_PROVIDER, 
            apiKey: 'missing', 
            status: 'error',
            error: `No API key found for ${LLM_PROVIDER}`
        };
    } catch (error) {
        const executionTime = Date.now() - startTime;
        
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.SYSTEM,
            `LLM status details check failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                service: 'llm-service',
                method: 'statusDetails',
                provider: LLM_PROVIDER,
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        
        MonitoringService.logError(mcpError);
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
 */
async function _checkOpenAIStatus(overallStartTime) {
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
 */
async function _checkClaudeStatus(overallStartTime) {
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
