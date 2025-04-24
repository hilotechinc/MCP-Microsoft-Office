const moduleRegistry = require('../../../src/modules/module-registry');
const { initializeModules } = require('../../../src/modules/init-modules');

describe('init-modules', () => {
    beforeEach(() => {
        moduleRegistry.modules.clear();
        moduleRegistry.capabilityMap.clear();
    });
    it('initializes all registered modules with dependencies', async () => {
        const mockInit = jest.fn(async (services) => ({
            id: 'mod1',
            name: 'TestMod',
            capabilities: ['foo'],
            handleIntent: jest.fn(),
            inited: true,
            injected: services && services.foo
        }));
        const mod = {
            id: 'mod1',
            name: 'TestMod',
            capabilities: ['foo'],
            init: mockInit,
            handleIntent: jest.fn()
        };
        moduleRegistry.registerModule(mod);
        const services = { foo: 'bar' };
        const initialized = await initializeModules(services);
        expect(mockInit).toHaveBeenCalledWith(services);
        expect(initialized[0].inited).toBe(true);
        expect(initialized[0].injected).toBe('bar');
        // Registry is updated
        const reg = moduleRegistry.getModule('mod1');
        expect(reg.inited).toBe(true);
    });
    it('skips modules with missing init', async () => {
        const mod = {
            id: 'noinit',
            name: 'NoInit',
            capabilities: ['x'],
            handleIntent: jest.fn()
        };
        moduleRegistry.registerModule(mod);
        const initialized = await initializeModules();
        expect(initialized).toEqual([]);
    });
});
