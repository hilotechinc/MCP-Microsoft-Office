const llmService = require('../../../src/nlu/llm-service');

describe('LLM Service', () => {
    const prompt = "Extract the intent from this query: 'Show me my recent emails'";
    afterEach(() => {
        llmService.setProvider('openai');
    });
    it('completes prompt with OpenAI provider', async () => {
        llmService.setProvider('openai');
        const res = await llmService.completePrompt(prompt);
        expect(res).toMatch(/^OpenAI:/);
        expect(typeof res).toBe('string');
    });
    it('completes prompt with Claude provider', async () => {
        llmService.setProvider('claude');
        const res = await llmService.completePrompt(prompt);
        expect(res).toMatch(/^Claude:/);
        expect(typeof res).toBe('string');
    });
    it('throws on unsupported provider', async () => {
        llmService.setProvider('unknown');
        await expect(llmService.completePrompt(prompt)).rejects.toThrow(/Unsupported LLM provider/);
    });
});
