/**
 * @fileoverview NLU Agent - Coordinates natural language understanding for MCP.
 * Pipeline: LLM intent extraction, entity recognition, fallback, context-aware understanding.
 * Follows async, modular, and testable design. Aligned with phase1_architecture.md and MCP rules.
 */

class NLUAgent {
    /**
     * @param {object} options
     * @param {function} [options.entityRecognizer]
     * @param {object} [options.contextService]
     * @param {object} [options.llmService] - Optional, for test injection
     */
    constructor({ entityRecognizer, contextService, llmService } = {}) {
        this.entityRecognizer = entityRecognizer || defaultEntityRecognizer;
        this.contextService = contextService || null;
        this.llmService = llmService || require('./llm-service');
    }

    /**
     * Main query processing pipeline: extract intent, entities, context.
     * @param {string} query - User input
     * @param {object} context - Optional dialog/session context
     * @returns {Promise<object>} { intent, entities, confidence, context }
     */
    async processQuery(query, context = {}) {
        let intent, entities, confidence = 0.0;
        try {
            // 1. Intent extraction via LLM
            const intentPrompt = `Extract the intent and confidence (0-1) from this query as JSON: ${JSON.stringify({ query })}`;
            const intentResponse = await this.llmService.completePrompt(intentPrompt);
            let parsed;
            try {
                parsed = JSON.parse(intentResponse.replace(/^.*?({|\[)/s, '$1'));
                intent = parsed.intent;
                confidence = parsed.confidence || 0.0;
            } catch (e) {
                // Fallback: treat as plain intent string
                intent = intentResponse.trim();
                confidence = 0.5;
            }
            // 2. Entity recognition
            entities = await this.entityRecognizer(query);
            // 3. Context-aware understanding
            if (this.contextService && typeof this.contextService.enrich === 'function') {
                context = await this.contextService.enrich(context, { intent, entities });
            }
            return { intent, entities, confidence, context };
        } catch (err) {
            // Fallback mechanism
            return { intent: null, entities: {}, confidence: 0.0, context, error: err.message };
        }
    }
}

/**
 * Default entity recognizer (simple regex-based, replace with LLM or NER for prod)
 * @param {string} query
 * @returns {Promise<object>} entities
 */
async function defaultEntityRecognizer(query) {
    // Example: extract email, date, number, etc.
    const entities = {};
    const emailMatch = query.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/);
    if (emailMatch) entities.email = emailMatch[0];
    const dateMatch = query.match(/\b(\d{4}-\d{2}-\d{2})\b/);
    if (dateMatch) entities.date = dateMatch[1];
    const numberMatch = query.match(/\b\d+\b/);
    if (numberMatch) entities.number = numberMatch[0];
    return entities;
}

module.exports = NLUAgent;
