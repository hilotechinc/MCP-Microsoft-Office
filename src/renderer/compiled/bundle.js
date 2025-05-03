// Bundle.js - Compiled main entry point for the MCP Desktop application
// This file loads all ES modules and initializes the application

// Use a self-executing function to avoid global namespace pollution
(function() {
    // Create a module cache to prevent duplicate imports
    const moduleCache = {};

    // Import modules with error handling and caching
    async function safeImport(modulePath) {
        try {
            if (moduleCache[modulePath]) {
                return moduleCache[modulePath];
            }
            
            const module = await import(modulePath);
            moduleCache[modulePath] = module;
            return module;
        } catch (error) {
            console.error(`Failed to import module ${modulePath}:`, error);
            throw error;
        }
    }

    // Main initialization function
    async function initializeApp() {
        try {
            // Log the initialization process
            console.log('MCP Desktop: Initializing application...');
            
            // Load core modules
            const appModule = await safeImport('../app.js');
            
            // Find or create app container element
            const appElement = document.getElementById('app');
            if (!appElement) {
                console.warn('MCP Desktop: App container not found, creating it...');
                const div = document.createElement('div');
                div.id = 'app';
                document.body.appendChild(div);
            }
            
            // Create and initialize the application
            const app = new appModule.App({
                element: document.getElementById('app')
            });
            
            // Render the UI
            console.log('MCP Desktop: Rendering UI...');
            await app.render();
            console.log('MCP Desktop: Application initialized successfully');
            
            // Return the app instance
            return app;
        } catch (error) {
            console.error('MCP Desktop: Failed to initialize application:', error);
            
            // Display a user-friendly error message
            const appElement = document.getElementById('app');
            if (appElement) {
                appElement.innerHTML = `
                    <div style="color: #d13438; padding: 20px; background-color: #fde7e9; border-radius: 4px; margin: 20px;">
                        <h2>Application Error</h2>
                        <p>${error.message}</p>
                        <p>Check the console for more details (F12)</p>
                        <button id="retry-btn" style="padding: 8px 16px; background-color: #0078d4; color: white; border: none; border-radius: 4px; cursor: pointer; margin-top: 10px;">Retry</button>
                    </div>
                `;
                
                // Add retry button functionality
                const retryBtn = document.getElementById('retry-btn');
                if (retryBtn) {
                    retryBtn.addEventListener('click', () => {
                        initializeApp();
                    });
                }
            }
            
            throw error;
        }
    }

    // Initialize on DOMContentLoaded
    document.addEventListener('DOMContentLoaded', () => {
        initializeApp().catch(error => {
            // Error already handled in initializeApp
        });
    });
})();