const intentRouter = require('../../../src/nlu/intent-router');

// Mock moduleRegistry for isolation
global.require = require;
jest.mock('../../../src/modules/module-registry', () => ({
    findModulesForIntent: jest.fn((intent) => {
        if (intent === 'readMail') return [{ id: 'mail', name: 'Mail' }];
        if (intent === 'getEvents') return [{ id: 'calendar', name: 'Calendar' }];
        if (intent === 'listFiles') return [{ id: 'files', name: 'Files' }];
        return [];
    })
}));

describe('Intent Router', () => {
    it('finds modules for intent', () => {
        const modules = intentRouter.findModulesForIntent('readMail');
        expect(modules).toHaveLength(1);
        expect(modules[0].id).toBe('mail');
    });
    it('matches fallback patterns', () => {
        const result = intentRouter.matchPatterns('What emails do I have?');
        expect(result.intent).toBe('readMail');
        expect(result.confidence).toBeGreaterThan(0.8);
    });
    it('returns null for unmatched patterns', () => {
        const result = intentRouter.matchPatterns('Completely unrelated query');
        expect(result.intent).toBeNull();
    });
    it('disambiguates between intents', () => {
        const intent = intentRouter.disambiguate(['readMail', 'getEvents']);
        expect(intent).toBe('readMail');
    });
});
