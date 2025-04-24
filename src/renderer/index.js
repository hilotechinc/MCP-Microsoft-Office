/**
 * @fileoverview Renderer process entry point. Initializes UI and wires up secure API.
 */

// Use dynamic import for ESM compatibility with CommonJS backend
async function initApp() {
    try {
        const { App } = await import('./app.js');
        const root = document.getElementById('app');
        if (!root) {
            // Create root if missing
            const div = document.createElement('div');
            div.id = 'app';
            document.body.appendChild(div);
        }
        const app = new App({
            element: document.getElementById('app')
        });
        await app.render();
    } catch (error) {
        console.error('Failed to initialize app:', error);
        const errorDiv = document.createElement('div');
        errorDiv.textContent = `Error initializing app: ${error.message}`;
        errorDiv.style.color = 'red';
        document.getElementById('app').appendChild(errorDiv);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    initApp();
});
