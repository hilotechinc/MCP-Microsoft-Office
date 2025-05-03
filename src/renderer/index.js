/**
 * @fileoverview Renderer process entry point. Initializes UI and wires up secure API.
 * Now includes improved error handling and better initialization.
 */

// Use dynamic import for ESM compatibility with CommonJS backend
async function initApp() {
    try {
        console.log('MCP Desktop: Initializing application...');
        
        // Import the App class
        const { App } = await import('./app.js');
        
        // Ensure the app container exists
        const root = document.getElementById('app');
        if (!root) {
            console.log('MCP Desktop: App container not found, creating it...');
            const div = document.createElement('div');
            div.id = 'app';
            document.body.appendChild(div);
        }
        
        // Create and render the application
        const app = new App({
            element: document.getElementById('app')
        });
        
        // Render the UI
        console.log('MCP Desktop: Rendering UI...');
        await app.render();
        console.log('MCP Desktop: Application initialized successfully');
    } catch (error) {
        console.error('MCP Desktop: Failed to initialize app:', error);
        
        // Create a more user-friendly error message
        const appElement = document.getElementById('app');
        if (appElement) {
            appElement.innerHTML = `
                <div style="color: #d13438; padding: 20px; background-color: #fde7e9; border-radius: 4px; margin: 20px;">
                    <h2>Application Error</h2>
                    <p>${error.message}</p>
                    <p>Check the console for more details (F12)</p>
                </div>
            `;
        }
    }
}

// Initialize the app when the DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    initApp();
});
