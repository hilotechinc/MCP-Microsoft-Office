/**
 * @fileoverview Renderer process entry point. Initializes UI and wires up secure API.
 */
import { App } from './app.js';

document.addEventListener('DOMContentLoaded', () => {
    const root = document.getElementById('app');
    if (!root) {
        // Create root if missing
        const div = document.createElement('div');
        div.id = 'app';
        document.body.appendChild(div);
    }
    const app = new App({
        element: document.getElementById('app'),
        api: window.api
    });
    app.render();
});
