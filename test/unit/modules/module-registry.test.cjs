const moduleRegistry = require('../../../src/modules/module-registry');

describe('ModuleRegistry', () => {
    beforeEach(() => {
        // Clear registry for isolation
        moduleRegistry.modules.clear();
    });

    it('registers and retrieves a module by id', () => {
        const testModule = {
            id: 'test',
            name: 'Test Module',
            capabilities: ['foo', 'bar'],
            init: () => testModule,
            handleIntent: jest.fn()
        };
        moduleRegistry.registerModule(testModule);
        const got = moduleRegistry.getModule('test');
        expect(got).toBe(testModule);
        // Capabilities registered
        expect(moduleRegistry.listCapabilities()).toEqual(expect.arrayContaining(['foo', 'bar']));
        // findModulesForIntent
        const found = moduleRegistry.findModulesForIntent('foo');
        expect(found).toContain(testModule);
    });

    it('throws if registering a module with duplicate id', () => {
        const testModule = { id: 'dup', name: 'Dup', capabilities: [], init: () => {}, handleIntent: jest.fn() };
        moduleRegistry.registerModule(testModule);
        expect(() => moduleRegistry.registerModule(testModule)).toThrow(/already registered/);
    });

    it('lists all registered modules (getAllModules)', () => {
        const a = { id: 'a', name: 'A', capabilities: ['alpha'], init: () => {}, handleIntent: jest.fn() };
        const b = { id: 'b', name: 'B', capabilities: ['beta'], init: () => {}, handleIntent: jest.fn() };
        moduleRegistry.registerModule(a);
        moduleRegistry.registerModule(b);
        const all = moduleRegistry.getAllModules();
        expect(all).toContain(a);
        expect(all).toContain(b);
        // Capabilities
        expect(moduleRegistry.listCapabilities()).toEqual(expect.arrayContaining(['alpha', 'beta']));
    });

    it('throws if registering invalid module', () => {
        expect(() => moduleRegistry.registerModule(null)).toThrow(/Invalid module/);
        expect(() => moduleRegistry.registerModule({})).toThrow(/Invalid module/);
    });

    it('finds modules for a given capability', () => {
        const x = { id: 'x', name: 'X', capabilities: ['intentA'], init: () => {}, handleIntent: jest.fn() };
        const y = { id: 'y', name: 'Y', capabilities: ['intentA', 'intentB'], init: () => {}, handleIntent: jest.fn() };
        moduleRegistry.registerModule(x);
        moduleRegistry.registerModule(y);
        const found = moduleRegistry.findModulesForIntent('intentA');
        expect(found).toEqual(expect.arrayContaining([x, y]));
        const foundB = moduleRegistry.findModulesForIntent('intentB');
        expect(foundB).toEqual(expect.arrayContaining([y]));
        const foundNone = moduleRegistry.findModulesForIntent('intentC');
        expect(foundNone).toEqual([]);
    });

    it('lists all capabilities', () => {
        const m = { id: 'mod', name: 'Mod', capabilities: ['capA', 'capB'], init: () => {}, handleIntent: jest.fn() };
        moduleRegistry.registerModule(m);
        const caps = moduleRegistry.listCapabilities();
        expect(caps).toEqual(expect.arrayContaining(['capA', 'capB']));
    });
});
