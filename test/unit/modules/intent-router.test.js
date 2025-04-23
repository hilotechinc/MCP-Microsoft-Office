const moduleRegistry = require('../../../src/modules/module-registry');
const { routeIntent, getModulesForIntent } = require('../../../src/modules/intent-router');

describe('intent-router', () => {
    beforeEach(() => {
        moduleRegistry.modules.clear();
        moduleRegistry.capabilityMap.clear();
    });
    it('routes an intent to the correct module', async () => {
        const mockHandler = jest.fn().mockResolvedValue('ok');
        const mod = {
            id: 'mod1',
            name: 'TestMod',
            capabilities: ['doSomething'],
            init: () => {},
            handleIntent: mockHandler
        };
        moduleRegistry.registerModule(mod);
        const result = await routeIntent('doSomething', { foo: 1 }, { user: 'bob' });
        expect(mockHandler).toHaveBeenCalledWith('doSomething', { foo: 1 }, { user: 'bob' });
        expect(result).toBe('ok');
    });
    it('throws if no module can handle the intent', async () => {
        await expect(routeIntent('notSupported')).rejects.toThrow(/No module found/);
    });
    it('returns all capable modules for an intent', () => {
        const a = { id: 'a', name: 'A', capabilities: ['foo'], init: () => {}, handleIntent: jest.fn() };
        const b = { id: 'b', name: 'B', capabilities: ['foo','bar'], init: () => {}, handleIntent: jest.fn() };
        moduleRegistry.registerModule(a);
        moduleRegistry.registerModule(b);
        const found = getModulesForIntent('foo');
        expect(found).toEqual(expect.arrayContaining([a, b]));
    });
});
