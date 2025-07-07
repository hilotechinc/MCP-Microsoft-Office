/**
 * @fileoverview LLM Service - Provider-agnostic interface for LLM completions (Claude/OpenAI).
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 */

const fetch = require('node-fetch');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

// Log service initialization
MonitoringService.info('NLU LLM Service initialized', {
    serviceName: 'nlu-llm-service',
    timestamp: new Date().toISOString()
}, 'nlu');

class LLMService {
    constructor() {
        this.provider = process.env.LLM_PROVIDER || 'openai';
    }

    /**
     * Sets the active LLM provider ('openai' or 'claude').
     * @param {string} provider
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     */
    setProvider(provider, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('NLU LLM provider change started', {
                method: 'setProvider',
                oldProvider: this.provider,
                newProvider: provider,
                userId: userId ? userId.substring(0, 20) + '...' : 'anonymous',
                sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'no-session',
                timestamp: new Date().toISOString()
            }, 'llm');
        }
        
        try {
            if (!provider || !['openai', 'claude'].includes(provider)) {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'llm',
                    `Invalid LLM provider: ${provider}. Must be 'openai' or 'claude'`,
                    'error',
                    {
                        service: 'nlu-llm-service',
                        method: 'setProvider',
                        invalidProvider: provider,
                        userId: userId,
                        sessionId: sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('LLM provider change failed - invalid provider', {
                        provider: provider,
                        timestamp: new Date().toISOString()
                    }, 'llm', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('LLM provider change failed - invalid provider', {
                        sessionId: sessionId,
                        provider: provider,
                        timestamp: new Date().toISOString()
                    }, 'llm');
                }
                
                throw mcpError;
            }
            
            this.provider = provider;
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('LLM provider changed successfully', {
                    provider: provider,
                    executionTime: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm', null, userId);
            } else if (sessionId) {
                MonitoringService.info('LLM provider changed successfully', {
                    sessionId: sessionId,
                    provider: provider,
                    executionTime: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            MonitoringService.trackMetric('nlu_llm_set_provider_success', executionTime, {
                service: 'nlu-llm-service',
                method: 'setProvider',
                provider: provider,
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('nlu_llm_set_provider_failure', executionTime, {
                    service: 'nlu-llm-service',
                    method: 'setProvider',
                    errorType: error.code || 'validation_error',
                    userId: userId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'llm',
                `Failed to set LLM provider: ${error.message}`,
                'error',
                {
                    service: 'nlu-llm-service',
                    method: 'setProvider',
                    provider: provider,
                    userId: userId,
                    sessionId: sessionId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('LLM provider change failed', {
                    error: error.message,
                    provider: provider,
                    timestamp: new Date().toISOString()
                }, 'llm', null, userId);
            } else if (sessionId) {
                MonitoringService.error('LLM provider change failed', {
                    sessionId: sessionId,
                    error: error.message,
                    provider: provider,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            MonitoringService.trackMetric('nlu_llm_set_provider_failure', executionTime, {
                service: 'nlu-llm-service',
                method: 'setProvider',
                errorType: error.code || 'unknown',
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Sends a prompt to the active LLM provider and returns the completion.
     * @param {string} prompt
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     * @returns {Promise<string>} Completion text
     */
    async completePrompt(prompt, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('NLU LLM completion started', {
                method: 'completePrompt',
                provider: this.provider,
                promptLength: prompt ? prompt.length : 0,
                userId: userId ? userId.substring(0, 20) + '...' : 'anonymous',
                sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'no-session',
                timestamp: new Date().toISOString()
            }, 'llm');
        }
        
        try {
            if (!prompt || typeof prompt !== 'string') {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'llm',
                    'Prompt must be a non-empty string',
                    'error',
                    {
                        service: 'nlu-llm-service',
                        method: 'completePrompt',
                        promptType: typeof prompt,
                        userId: userId,
                        sessionId: sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('LLM completion failed - invalid prompt', {
                        promptType: typeof prompt,
                        timestamp: new Date().toISOString()
                    }, 'llm', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('LLM completion failed - invalid prompt', {
                        sessionId: sessionId,
                        promptType: typeof prompt,
                        timestamp: new Date().toISOString()
                    }, 'llm');
                }
                
                throw mcpError;
            }
            
            let result;
            if (this.provider === 'claude') {
                result = await this._completeClaude(prompt, userId, sessionId);
            } else if (this.provider === 'openai') {
                result = await this._completeOpenAI(prompt, userId, sessionId);
            } else {
                // Pattern 3: Infrastructure Error Logging
                const mcpError = ErrorService.createError(
                    'llm',
                    `Unsupported LLM provider: ${this.provider}`,
                    'error',
                    {
                        service: 'nlu-llm-service',
                        method: 'completePrompt',
                        provider: this.provider,
                        userId: userId,
                        sessionId: sessionId,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                
                // Pattern 4: User Error Tracking
                if (userId) {
                    MonitoringService.error('LLM completion failed - unsupported provider', {
                        provider: this.provider,
                        timestamp: new Date().toISOString()
                    }, 'llm', null, userId);
                } else if (sessionId) {
                    MonitoringService.error('LLM completion failed - unsupported provider', {
                        sessionId: sessionId,
                        provider: this.provider,
                        timestamp: new Date().toISOString()
                    }, 'llm');
                }
                
                throw mcpError;
            }
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('LLM completion completed successfully', {
                    provider: this.provider,
                    promptLength: prompt.length,
                    resultLength: result ? result.length : 0,
                    executionTime: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm', null, userId);
            } else if (sessionId) {
                MonitoringService.info('LLM completion completed successfully', {
                    sessionId: sessionId,
                    provider: this.provider,
                    promptLength: prompt.length,
                    resultLength: result ? result.length : 0,
                    executionTime: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            MonitoringService.trackMetric('nlu_llm_complete_prompt_success', executionTime, {
                service: 'nlu-llm-service',
                method: 'completePrompt',
                provider: this.provider,
                promptLength: prompt.length,
                resultLength: result ? result.length : 0,
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('NLU LLM completion completed', {
                    provider: this.provider,
                    promptLength: prompt.length,
                    resultLength: result ? result.length : 0,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            // If it's already an MCP error, just track metrics and rethrow
            if (error.category) {
                MonitoringService.trackMetric('nlu_llm_complete_prompt_failure', executionTime, {
                    service: 'nlu-llm-service',
                    method: 'completePrompt',
                    provider: this.provider,
                    errorType: error.code || 'validation_error',
                    userId: userId,
                    sessionId: sessionId,
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            // Pattern 3: Infrastructure Error Logging
            const mcpError = ErrorService.createError(
                'llm',
                `LLM completion failed: ${error.message}`,
                'error',
                {
                    service: 'nlu-llm-service',
                    method: 'completePrompt',
                    provider: this.provider,
                    promptLength: prompt ? prompt.length : 0,
                    userId: userId,
                    sessionId: sessionId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('LLM completion failed', {
                    error: error.message,
                    provider: this.provider,
                    timestamp: new Date().toISOString()
                }, 'llm', null, userId);
            } else if (sessionId) {
                MonitoringService.error('LLM completion failed', {
                    sessionId: sessionId,
                    error: error.message,
                    provider: this.provider,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            MonitoringService.trackMetric('nlu_llm_complete_prompt_failure', executionTime, {
                service: 'nlu-llm-service',
                method: 'completePrompt',
                provider: this.provider,
                errorType: error.code || 'unknown',
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Claude API integration (mock for test; real impl would call Anthropic).
     * @private
     * @param {string} prompt
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     */
    async _completeClaude(prompt, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Claude completion started', {
                method: '_completeClaude',
                promptLength: prompt.length,
                userId: userId ? userId.substring(0, 20) + '...' : 'anonymous',
                sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'no-session',
                timestamp: new Date().toISOString()
            }, 'llm');
        }
        
        try {
            // In real use, call Anthropic Claude API here
            const result = `Claude: ${prompt}`;
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('Claude completion completed successfully', {
                    promptLength: prompt.length,
                    resultLength: result.length,
                    executionTime: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm', null, userId);
            } else if (sessionId) {
                MonitoringService.info('Claude completion completed successfully', {
                    sessionId: sessionId,
                    promptLength: prompt.length,
                    resultLength: result.length,
                    executionTime: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            MonitoringService.trackMetric('nlu_llm_claude_completion_success', executionTime, {
                service: 'nlu-llm-service',
                method: '_completeClaude',
                promptLength: prompt.length,
                resultLength: result.length,
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Claude completion completed', {
                    promptLength: prompt.length,
                    resultLength: result.length,
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
                `Claude API completion failed: ${error.message}`,
                'error',
                {
                    service: 'nlu-llm-service',
                    method: '_completeClaude',
                    promptLength: prompt.length,
                    userId: userId,
                    sessionId: sessionId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('Claude completion failed', {
                    error: error.message,
                    promptLength: prompt.length,
                    timestamp: new Date().toISOString()
                }, 'llm', null, userId);
            } else if (sessionId) {
                MonitoringService.error('Claude completion failed', {
                    sessionId: sessionId,
                    error: error.message,
                    promptLength: prompt.length,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            MonitoringService.trackMetric('nlu_llm_claude_completion_failure', executionTime, {
                service: 'nlu-llm-service',
                method: '_completeClaude',
                errorType: error.code || 'unknown',
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * OpenAI API integration (mock for test; real impl would call OpenAI).
     * @private
     * @param {string} prompt
     * @param {string} userId - User ID for context
     * @param {string} sessionId - Session ID for context
     */
    async _completeOpenAI(prompt, userId, sessionId) {
        const startTime = Date.now();
        
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('OpenAI completion started', {
                method: '_completeOpenAI',
                promptLength: prompt.length,
                userId: userId ? userId.substring(0, 20) + '...' : 'anonymous',
                sessionId: sessionId ? sessionId.substring(0, 8) + '...' : 'no-session',
                timestamp: new Date().toISOString()
            }, 'llm');
        }
        
        try {
            // In real use, call OpenAI API here
            const result = `OpenAI: ${prompt}`;
            
            const executionTime = Date.now() - startTime;
            
            // Pattern 2: User Activity Logs
            if (userId) {
                MonitoringService.info('OpenAI completion completed successfully', {
                    promptLength: prompt.length,
                    resultLength: result.length,
                    executionTime: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm', null, userId);
            } else if (sessionId) {
                MonitoringService.info('OpenAI completion completed successfully', {
                    sessionId: sessionId,
                    promptLength: prompt.length,
                    resultLength: result.length,
                    executionTime: executionTime,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            MonitoringService.trackMetric('nlu_llm_openai_completion_success', executionTime, {
                service: 'nlu-llm-service',
                method: '_completeOpenAI',
                promptLength: prompt.length,
                resultLength: result.length,
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('OpenAI completion completed', {
                    promptLength: prompt.length,
                    resultLength: result.length,
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
                `OpenAI API completion failed: ${error.message}`,
                'error',
                {
                    service: 'nlu-llm-service',
                    method: '_completeOpenAI',
                    promptLength: prompt.length,
                    userId: userId,
                    sessionId: sessionId,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            
            // Pattern 4: User Error Tracking
            if (userId) {
                MonitoringService.error('OpenAI completion failed', {
                    error: error.message,
                    promptLength: prompt.length,
                    timestamp: new Date().toISOString()
                }, 'llm', null, userId);
            } else if (sessionId) {
                MonitoringService.error('OpenAI completion failed', {
                    sessionId: sessionId,
                    error: error.message,
                    promptLength: prompt.length,
                    timestamp: new Date().toISOString()
                }, 'llm');
            }
            
            MonitoringService.trackMetric('nlu_llm_openai_completion_failure', executionTime, {
                service: 'nlu-llm-service',
                method: '_completeOpenAI',
                errorType: error.code || 'unknown',
                userId: userId,
                sessionId: sessionId,
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }
}

module.exports = new LLMService();
