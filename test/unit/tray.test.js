/**
 * @fileoverview Unit test for Electron system tray integration.
 * Verifies tray menu structure and Show/Hide/Quit actions.
 */
const assert = require('assert');
const { setupTray } = require('../../src/main/tray');

describe('Electron System Tray', () => {
    it('should set up tray with correct context menu', () => {
        let shown = false;
        let hidden = false;
        const appStub = { quit: async () => { appStub.quitCalled = true; }, quitCalled: false };
        const mainWindowStub = {
            isVisible: () => shown,
            show: () => { shown = true; },
            hide: () => { hidden = true; }
        };
        let menuTemplate;
        const TrayStub = function() {
            this.setToolTip = () => {};
            this.setContextMenu = (menu) => { menuTemplate = menu.template; };
        };
        const MenuStub = {
            buildFromTemplate: (tpl) => ({ template: tpl })
        };
        const tray = setupTray(appStub, mainWindowStub, TrayStub, MenuStub);
        assert.ok(tray);
        // Check menu structure
        const labels = menuTemplate.map(item => item.label).filter(Boolean);
        assert.deepStrictEqual(labels, ['Show/Hide', 'Quit']);
        // Simulate Show/Hide
        shown = false;
        menuTemplate[0].click();
        assert.strictEqual(shown, true);
        // Simulate Hide
        shown = true;
        menuTemplate[0].click();
        assert.strictEqual(hidden, true);
        // Simulate Quit
        menuTemplate[2].click();
        assert.strictEqual(appStub.quitCalled, true);
    });
});
