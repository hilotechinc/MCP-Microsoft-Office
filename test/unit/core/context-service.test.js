const ContextService = require('../../../src/core/context-service');

describe('ContextService', () => {
    const mockStorageService = {
        setSetting: jest.fn(async () => {}),
        getSetting: jest.fn(async () => null),
        addHistory: jest.fn(async () => {}),
        getHistory: jest.fn(async (limit) => [
            { role: 'user', text: 'Show me emails from John', ts: '2025-04-23T20:00:00Z' },
            { role: 'assistant', text: 'Here are your emails from John Smith', ts: '2025-04-23T20:00:01Z' }
        ]),
        clearConversationHistory: jest.fn(async () => {})
    };
    let service;
    beforeEach(() => {
        service = new ContextService(mockStorageService);
        jest.clearAllMocks();
    });

    it('updates and retrieves context with topic and recentEntities', async () => {
        await service.updateContext({
            currentTopic: 'emails',
            currentEntities: { people: [{ name: 'John Smith', email: 'john@example.com' }] }
        });
        const ctx = await service.getCurrentContext();
        expect(ctx.currentTopic).toBe('emails');
        expect(ctx.recentEntities.people[0].name).toBe('John Smith');
        expect(mockStorageService.setSetting).toHaveBeenCalledWith('context', expect.any(Object));
    });

    it('adds and retrieves conversation history', async () => {
        await service.addToConversation('user', 'Show me emails from John');
        await service.addToConversation('assistant', 'Here are your emails from John Smith');
        const history = await service.getConversationHistory(2);
        expect(history).toHaveLength(2);
        expect(history[0].role).toBe('user');
        expect(history[1].role).toBe('assistant');
        expect(mockStorageService.addHistory).toHaveBeenCalled();
    });

    it('tracks entities across turns', async () => {
        await service.updateContext({ currentEntities: { people: [{ name: 'A' }] } });
        await service.updateContext({ currentEntities: { people: [{ name: 'B' }] } });
        const ctx = await service.getCurrentContext();
        expect(ctx.recentEntities.people.length).toBe(2);
        expect(ctx.recentEntities.people.map(p => p.name)).toContain('A');
        expect(ctx.recentEntities.people.map(p => p.name)).toContain('B');
    });

    it('auto-detects topic from intent if not provided', async () => {
        await service.updateContext({ currentIntent: 'getMail' });
        const ctx = await service.getCurrentContext();
        expect(ctx.currentTopic).toBe('emails');
    });

    it('resets context', async () => {
        await service.resetContext();
        const ctx = await service.getCurrentContext();
        expect(ctx.currentIntent).toBeNull();
        expect(ctx.currentTopic).toBeNull();
        expect(ctx.recentEntities).toEqual({});
        expect(ctx.conversationHistory).toHaveLength(0);
        expect(mockStorageService.clearConversationHistory).toHaveBeenCalled();
    });

    it('works without storageService', async () => {
        const serviceNoStorage = new ContextService();
        await serviceNoStorage.updateContext({ currentTopic: 'files', currentEntities: { files: [{ id: 1 }] } });
        const ctx = await serviceNoStorage.getCurrentContext();
        expect(ctx.currentTopic).toBe('files');
        expect(ctx.recentEntities.files[0].id).toBe(1);
        await serviceNoStorage.addToConversation('user', 'test');
        const history = await serviceNoStorage.getConversationHistory(1);
        expect(history[0].role).toBe('user');
        await expect(serviceNoStorage.resetContext()).resolves.toBeUndefined();
    });
});
