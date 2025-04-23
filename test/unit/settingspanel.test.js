/**
 * @fileoverview Unit test for SettingsPanel component.
 */
import { SettingsPanel } from '../../src/renderer/components/SettingsPanel.js';

describe('SettingsPanel', () => {
    let root;
    let onSave;
    beforeEach(() => {
        root = document.createElement('div');
        onSave = jest.fn();
    });

    it('renders settings form with dark mode option', () => {
        const panel = new SettingsPanel(root, { darkMode: true });
        panel.show();
        expect(root.querySelector('h3').textContent).toBe('Settings');
        expect(root.querySelector('#settings-darkmode')).not.toBeNull();
        expect(root.querySelector('#settings-darkmode').checked).toBe(true);
    });

    it('calls onSave with settings and hides panel', () => {
        const panel = new SettingsPanel(root, { darkMode: false, onSave });
        panel.show();
        const checkbox = root.querySelector('#settings-darkmode');
        checkbox.checked = true;
        root.querySelector('button').click();
        expect(onSave).toHaveBeenCalledWith({ darkMode: true });
        expect(panel.container.style.display).toBe('none');
    });

    it('show() and hide() toggle panel visibility', () => {
        const panel = new SettingsPanel(root, {});
        panel.show();
        expect(panel.container.style.display).toBe('block');
        panel.hide();
        expect(panel.container.style.display).toBe('none');
    });
});
