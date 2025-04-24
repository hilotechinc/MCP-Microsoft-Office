/**
 * @fileoverview LLM Service - Provider-agnostic interface for LLM completions (Claude/OpenAI).
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 */

const fetch = require('node-fetch');

class LLMService {
    constructor() {
        this.provider = process.env.LLM_PROVIDER || 'openai';
    }

    /**
     * Sets the active LLM provider ('openai' or 'claude').
     * @param {string} provider
     */
    setProvider(provider) {
        this.provider = provider;
    }

    /**
     * Sends a prompt to the active LLM provider and returns the completion.
     * @param {string} prompt
     * @returns {Promise<string>} Completion text
     */
    async completePrompt(prompt) {
        if (this.provider === 'claude') {
            return await this._completeClaude(prompt);
        } else if (this.provider === 'openai') {
            return await this._completeOpenAI(prompt);
        } else {
            throw new Error(`Unsupported LLM provider: ${this.provider}`);
        }
    }

    /**
     * Claude API integration (mock for test; real impl would call Anthropic).
     * @private
     */
    async _completeClaude(prompt) {
        // In real use, call Anthropic Claude API here
        return `Claude: ${prompt}`;
    }

    /**
     * OpenAI API integration (mock for test; real impl would call OpenAI).
     * @private
     */
    async _completeOpenAI(prompt) {
        // In real use, call OpenAI API here
        return `OpenAI: ${prompt}`;
    }
}

module.exports = new LLMService();
