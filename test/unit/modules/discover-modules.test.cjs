const path = require('path');
const fs = require('fs');
const moduleRegistry = require('../../../src/modules/module-registry');
const { discoverModules } = require('../../../src/modules/discover-modules');

describe('discoverModules', () => {
    const TEST_DIR = path.join(__dirname, 'mock-modules');
    const modA = `module.exports = { id: 'a', name: 'A', capabilities: ['capA'], init: () => {}, handleIntent: () => {} };`;
    const modB = `module.exports = { id: 'b', name: 'B', capabilities: ['capB'], init: () => {}, handleIntent: () => {} };`;
    beforeAll(() => {
        fs.mkdirSync(TEST_DIR, { recursive: true });
        fs.writeFileSync(path.join(TEST_DIR, 'a.cjs'), modA);
        fs.writeFileSync(path.join(TEST_DIR, 'b.cjs'), modB);
        fs.writeFileSync(path.join(TEST_DIR, 'notamodule.txt'), 'not a js module');
    });
    afterAll(() => {
        fs.rmSync(TEST_DIR, { recursive: true, force: true });
    });
    beforeEach(() => {
        moduleRegistry.modules.clear();
        moduleRegistry.capabilityMap.clear();
    });
    it('discovers and registers valid modules', async () => {
        const found = await discoverModules(TEST_DIR);
        expect(found.length).toBe(2);
        expect(moduleRegistry.getModule('a')).toBeDefined();
        expect(moduleRegistry.getModule('b')).toBeDefined();
        expect(moduleRegistry.listCapabilities()).toEqual(expect.arrayContaining(['capA', 'capB']));
    });
    it('ignores non-js and invalid modules', async () => {
        // Only .js files with required exports are loaded
        const found = await discoverModules(TEST_DIR);
        expect(found.length).toBe(2);
        expect(moduleRegistry.getModule('notamodule')).toBeUndefined();
    });
});
