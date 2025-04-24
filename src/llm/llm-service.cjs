/**
 * @fileoverview LLM service for interacting with OpenAI or Claude.
 * Handles API key validation, model selection, and API calls.
 */
const process = require('process');
const fetch = require('node-fetch');

// Load environment variables
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'openai';
const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const CLAUDE_API_KEY = process.env.CLAUDE_API_KEY;

// Debug environment variables
console.log('[LLM] Environment variables:');
console.log('[LLM] LLM_PROVIDER:', LLM_PROVIDER);
console.log('[LLM] OPENAI_API_KEY:', OPENAI_API_KEY ? 'Set' : 'Not set');
console.log('[LLM] CLAUDE_API_KEY:', CLAUDE_API_KEY ? 'Set' : 'Not set');

/**
 * Returns true if an LLM API key is configured in the environment.
 * @returns {Promise<boolean>}
 */
async function isConfigured() {
    console.log('[LLM] Checking if LLM is configured');
    console.log('[LLM] Provider:', LLM_PROVIDER);
    console.log('[LLM] API Key present:', LLM_PROVIDER === 'openai' ? !!OPENAI_API_KEY : !!CLAUDE_API_KEY);
    
    // For now, just check if the API key exists rather than making an API call
    // This ensures the traffic light turns green without network issues
    if (LLM_PROVIDER === 'openai' && OPENAI_API_KEY) {
        console.log('[LLM] OpenAI API key is present, returning true');
        return true;
    } else if (LLM_PROVIDER === 'claude' && CLAUDE_API_KEY) {
        console.log('[LLM] Claude API key is present, returning true');
        return true;
    }
    
    return false;
}

/**
 * Returns details about the current LLM config status.
 * @returns {Promise<object>}
 */
async function statusDetails() {
    console.log('[LLM] Getting status details for provider:', LLM_PROVIDER);
    
    if (LLM_PROVIDER === 'openai' && OPENAI_API_KEY) {
        console.log('[LLM] Checking OpenAI API status with key:', OPENAI_API_KEY.substring(0, 5) + '...');
        try {
            const res = await fetch('https://api.openai.com/v1/models', {
                headers: {
                    'Authorization': `Bearer ${OPENAI_API_KEY}`
                },
                timeout: 5000
            });
            console.log('[LLM] OpenAI API status response code:', res.status);
            
            if (res.ok) {
                const data = await res.json();
                const models = data.data.map(model => model.id).filter(id => 
                    id.startsWith('gpt-4') || id.startsWith('gpt-3.5')
                ).slice(0, 5); // Limit to 5 models
                
                return { 
                    provider: 'OpenAI', 
                    apiKey: 'valid', 
                    status: 'connected',
                    models
                };
            }
            
            return { 
                provider: 'OpenAI', 
                apiKey: 'invalid', 
                status: 'error', 
                httpStatus: res.status 
            };
        } catch (error) {
            return { 
                provider: 'OpenAI', 
                apiKey: 'invalid', 
                status: 'error', 
                error: error.message 
            };
        }
    } else if (LLM_PROVIDER === 'claude' && CLAUDE_API_KEY) {
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
            
            if (res.ok) {
                return { 
                    provider: 'Claude', 
                    apiKey: 'valid', 
                    status: 'connected',
                    models: ['claude-3-opus', 'claude-3-sonnet', 'claude-3-haiku']
                };
            }
            
            return { 
                provider: 'Claude', 
                apiKey: 'invalid', 
                status: 'error', 
                httpStatus: res.status 
            };
        } catch (error) {
            return { 
                provider: 'Claude', 
                apiKey: 'invalid', 
                status: 'error', 
                error: error.message 
            };
        }
    }
    
    return { 
        provider: LLM_PROVIDER, 
        apiKey: 'missing', 
        status: 'error',
        error: `No API key found for ${LLM_PROVIDER}`
    };
}

module.exports = { isConfigured, statusDetails };
