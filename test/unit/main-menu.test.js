/**
 * @fileoverview Unit test for Electron application menu setup
 * Verifies menu structure and custom About item
 */
const assert = require('assert');
const { getMenuTemplate } = require('../../src/main/menu');

describe('Electron Application Menu', () => {
    it('should have correct menu structure', () => {
        const template = getMenuTemplate();
        const labels = template.map(item => item.label);
        assert.deepStrictEqual(labels, ['File', 'Edit', 'View', 'Window', 'Help']);
    });

    it('should have custom About item in Help menu and trigger dialog', async () => {
        let aboutClicked = false;
        const dialogStub = {
            showMessageBox: () => { aboutClicked = true; }
        };
        const template = getMenuTemplate(dialogStub);
        const helpMenu = template.find(item => item.label === 'Help');
        assert.ok(helpMenu);
        const aboutItem = helpMenu.submenu.find(item => item.label === 'About MCP Desktop');
        assert.ok(aboutItem);
        // Simulate click
        await aboutItem.click();
        assert.strictEqual(aboutClicked, true);
    });
});
