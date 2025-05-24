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
     */
    setProvider(provider) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('NLU LLM provider change started', {
                method: 'setProvider',
                oldProvider: this.provider,
                newProvider: provider,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            if (!provider || !['openai', 'claude'].includes(provider)) {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    `Invalid LLM provider: ${provider}. Must be 'openai' or 'claude'`,
                    ErrorService.SEVERITIES.WARNING,
                    {
                        service: 'nlu-llm-service',
                        method: 'setProvider',
                        invalidProvider: provider,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            this.provider = provider;
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('nlu_llm_set_provider_success', executionTime, {
                service: 'nlu-llm-service',
                method: 'setProvider',
                provider: provider,
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
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `Failed to set LLM provider: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'nlu-llm-service',
                    method: 'setProvider',
                    provider: provider,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('nlu_llm_set_provider_failure', executionTime, {
                service: 'nlu-llm-service',
                method: 'setProvider',
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Sends a prompt to the active LLM provider and returns the completion.
     * @param {string} prompt
     * @returns {Promise<string>} Completion text
     */
    async completePrompt(prompt) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('NLU LLM completion started', {
                method: 'completePrompt',
                provider: this.provider,
                promptLength: prompt ? prompt.length : 0,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            if (!prompt || typeof prompt !== 'string') {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    'Prompt must be a non-empty string',
                    ErrorService.SEVERITIES.WARNING,
                    {
                        service: 'nlu-llm-service',
                        method: 'completePrompt',
                        promptType: typeof prompt,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            let result;
            if (this.provider === 'claude') {
                result = await this._completeClaude(prompt);
            } else if (this.provider === 'openai') {
                result = await this._completeOpenAI(prompt);
            } else {
                const mcpError = ErrorService.createError(
                    ErrorService.CATEGORIES.VALIDATION,
                    `Unsupported LLM provider: ${this.provider}`,
                    ErrorService.SEVERITIES.ERROR,
                    {
                        service: 'nlu-llm-service',
                        method: 'completePrompt',
                        provider: this.provider,
                        timestamp: new Date().toISOString()
                    }
                );
                MonitoringService.logError(mcpError);
                throw mcpError;
            }
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('nlu_llm_complete_prompt_success', executionTime, {
                service: 'nlu-llm-service',
                method: 'completePrompt',
                provider: this.provider,
                promptLength: prompt.length,
                resultLength: result ? result.length : 0,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('NLU LLM completion completed', {
                    provider: this.provider,
                    promptLength: prompt.length,
                    resultLength: result ? result.length : 0,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu');
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
                    timestamp: new Date().toISOString()
                });
                throw error;
            }
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.SYSTEM,
                `LLM completion failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'nlu-llm-service',
                    method: 'completePrompt',
                    provider: this.provider,
                    promptLength: prompt ? prompt.length : 0,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('nlu_llm_complete_prompt_failure', executionTime, {
                service: 'nlu-llm-service',
                method: 'completePrompt',
                provider: this.provider,
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * Claude API integration (mock for test; real impl would call Anthropic).
     * @private
     */
    async _completeClaude(prompt) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Claude completion started', {
                method: '_completeClaude',
                promptLength: prompt.length,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            // In real use, call Anthropic Claude API here
            const result = `Claude: ${prompt}`;
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('nlu_llm_claude_completion_success', executionTime, {
                service: 'nlu-llm-service',
                method: '_completeClaude',
                promptLength: prompt.length,
                resultLength: result.length,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('Claude completion completed', {
                    promptLength: prompt.length,
                    resultLength: result.length,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API,
                `Claude API completion failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'nlu-llm-service',
                    method: '_completeClaude',
                    promptLength: prompt.length,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('nlu_llm_claude_completion_failure', executionTime, {
                service: 'nlu-llm-service',
                method: '_completeClaude',
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }

    /**
     * OpenAI API integration (mock for test; real impl would call OpenAI).
     * @private
     */
    async _completeOpenAI(prompt) {
        const startTime = Date.now();
        
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('OpenAI completion started', {
                method: '_completeOpenAI',
                promptLength: prompt.length,
                timestamp: new Date().toISOString()
            }, 'nlu');
        }
        
        try {
            // In real use, call OpenAI API here
            const result = `OpenAI: ${prompt}`;
            
            const executionTime = Date.now() - startTime;
            MonitoringService.trackMetric('nlu_llm_openai_completion_success', executionTime, {
                service: 'nlu-llm-service',
                method: '_completeOpenAI',
                promptLength: prompt.length,
                resultLength: result.length,
                timestamp: new Date().toISOString()
            });
            
            if (process.env.NODE_ENV === 'development') {
                MonitoringService.debug('OpenAI completion completed', {
                    promptLength: prompt.length,
                    resultLength: result.length,
                    executionTimeMs: executionTime,
                    timestamp: new Date().toISOString()
                }, 'nlu');
            }
            
            return result;
        } catch (error) {
            const executionTime = Date.now() - startTime;
            
            const mcpError = ErrorService.createError(
                ErrorService.CATEGORIES.API,
                `OpenAI API completion failed: ${error.message}`,
                ErrorService.SEVERITIES.ERROR,
                {
                    service: 'nlu-llm-service',
                    method: '_completeOpenAI',
                    promptLength: prompt.length,
                    stack: error.stack,
                    timestamp: new Date().toISOString()
                }
            );
            
            MonitoringService.logError(mcpError);
            MonitoringService.trackMetric('nlu_llm_openai_completion_failure', executionTime, {
                service: 'nlu-llm-service',
                method: '_completeOpenAI',
                errorType: error.code || 'unknown',
                timestamp: new Date().toISOString()
            });
            
            throw mcpError;
        }
    }
}

module.exports = new LLMService();
