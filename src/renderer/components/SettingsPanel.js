/**
 * @fileoverview SettingsPanel component for application/user settings.
 * Modular, testable vanilla JS class.
 */

/**
 * SettingsPanel UI component.
 * @class
 */
export class SettingsPanel {
    /**
     * @param {HTMLElement} root - Container to render into
     * @param {Object} [options] - Optional settings (e.g., initial values, callbacks)
     */
    constructor(root, options = {}) {
        this.root = root;
        this.options = options;
        this.container = document.createElement('div');
        this.container.className = 'settings-panel';
        this.container.style.display = 'none'; // Hidden by default
        this.root.appendChild(this.container);
        this.render();
    }

    /**
     * Render the settings form.
     */
    render() {
        this.container.innerHTML = '';
        const title = document.createElement('h3');
        title.textContent = 'Settings';
        this.container.appendChild(title);
        // Example setting: dark mode toggle
        const darkModeLabel = document.createElement('label');
        darkModeLabel.textContent = 'Dark mode';
        const darkModeInput = document.createElement('input');
        darkModeInput.type = 'checkbox';
        darkModeInput.id = 'settings-darkmode';
        darkModeInput.checked = !!this.options.darkMode;
        darkModeLabel.appendChild(darkModeInput);
        this.container.appendChild(darkModeLabel);
        // Save button
        const saveBtn = document.createElement('button');
        saveBtn.textContent = 'Save';
        saveBtn.addEventListener('click', () => this.handleSave());
        this.container.appendChild(saveBtn);
    }

    /**
     * Show the settings panel.
     */
    show() {
        this.container.style.display = 'block';
    }

    /**
     * Hide the settings panel.
     */
    hide() {
        this.container.style.display = 'none';
    }

    /**
     * Handle save action.
     */
    handleSave() {
        const darkMode = this.container.querySelector('#settings-darkmode').checked;
        if (typeof this.options.onSave === 'function') {
            this.options.onSave({ darkMode });
        }
        this.hide();
    }
}
