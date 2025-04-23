const NLUAgent = require('../../../src/nlu/nlu-agent');

const mockLLMService = {
    completePrompt: jest.fn(async (prompt) => {
        if (prompt.includes('Extract the intent')) {
            return JSON.stringify({ intent: 'readMail', confidence: 0.95 });
        }
        return 'readMail';
    })
};

const mockEntityRecognizer = jest.fn(async (query) => {
    if (query.includes('John')) return { person: 'John' };
    return {};
});

const mockContextService = {
    enrich: jest.fn(async (context, { intent, entities }) => ({ ...context, enriched: true, intent, entities }))
};

describe('NLU Agent', () => {
    it('processes query and extracts intent/entities/context', async () => {
        // Patch llmService in NLUAgent
        const NLUAgentWithMock = require('../../../src/nlu/nlu-agent');
        const agent = new NLUAgentWithMock({ entityRecognizer: mockEntityRecognizer, contextService: mockContextService, llmService: mockLLMService });
        const result = await agent.processQuery('Show me emails from John', { session: 1 });
        expect(result.intent).toBe('readMail');
        expect(result.entities).toHaveProperty('person', 'John');
        expect(result.context).toHaveProperty('enriched', true);
        expect(result.confidence).toBeGreaterThan(0.5);
    });
    it('handles fallback on LLM parse error', async () => {
        const brokenLLM = { completePrompt: jest.fn(async () => 'readMail') };
        const agent = new NLUAgent({ entityRecognizer: async () => ({}), llmService: brokenLLM });
        const result = await agent.processQuery('Quick test');
        expect(result.intent).toBe('readMail');
        expect(result.confidence).toBe(0.5);
    });
    it('returns error on failure', async () => {
        const errorLLM = { completePrompt: jest.fn(async () => { throw new Error('LLM fail'); }) };
        const agent = new NLUAgent({ entityRecognizer: async () => ({}), llmService: errorLLM });
        const result = await agent.processQuery('fail test');
        expect(result.intent).toBeNull();
        expect(result.error).toMatch(/LLM fail/);
    });
});
