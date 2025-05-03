/**
 * @fileoverview Combined Express server for MCP Electron app.
 * Combines both the API and frontend serving capabilities.
 * Based on the dev-server.cjs approach but for use in Electron.
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const { setupMiddleware } = require('./server.cjs');
const monitoringService = require('../core/monitoring-service.cjs');
const errorService = require('../core/error-service.cjs');

// Create a combined express server instance
const app = express();
let server = null;

// If this file is being run directly (not imported), start the server
if (require.main === module) {
  startCombinedServer().then(() => {
    console.log(`
🚀 MCP Desktop combined server running at http://localhost:3000
📝 Open this URL in your browser to access the application
📊 Logs written to ${monitoringService.LOG_FILE_PATH}
    `);
  }).catch(err => {
    console.error('Failed to start combined server:', err);
    process.exit(1);
  });
}

// Add global error handlers but allow process termination with SIGINT
process.on('uncaughtException', (err) => {
  const mcpError = errorService.createError(
    errorService.CATEGORIES.SYSTEM,
    `Uncaught Exception: ${err.message}`,
    errorService.SEVERITIES.CRITICAL,
    { stack: err.stack }
  );
  monitoringService.error(`Uncaught Exception: ${err.message}`, { stack: err.stack }, 'system');
  // Log the error but still allow normal termination
});

process.on('unhandledRejection', (reason, promise) => {
  const mcpError = errorService.createError(
    errorService.CATEGORIES.SYSTEM,
    `Unhandled Promise Rejection: ${reason}`,
    errorService.SEVERITIES.ERROR,
    { reason }
  );
  monitoringService.error(`Unhandled Promise Rejection: ${reason}`, { reason }, 'system');
  // Log the error but still allow normal termination
});

// Add proper SIGINT handler to allow Ctrl+C termination
process.on('SIGINT', async () => {
  console.log('\nReceived SIGINT (Ctrl+C). Shutting down gracefully...');
  if (server) {
    console.log('Closing server...');
    await stopCombinedServer();
  }
  console.log('Exiting process...');
  process.exit(0);
});

/**
 * Start a combined server that serves both API and frontend
 * @param {number} port - Port to listen on
 * @returns {Promise<http.Server>} The HTTP server instance
 */
async function startCombinedServer(port = 3000) {
  // Set up middleware from the server module
  setupMiddleware(app);
  
  // Add CORS headers for Electron web requests
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    
    // Handle preflight requests
    if (req.method === 'OPTIONS') {
      return res.status(200).end();
    }
    next();
  });
  
  // Set up session middleware for authentication
  app.use(session({
    secret: 'mcp-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
  }));
  
  // Import required modules for API
  const statusRouter = require('../api/status.cjs');
  const { registerRoutes } = require('../api/routes.cjs');
  
  // Register API routes directly
  app.use('/api/status', statusRouter);
  
  // Register auth endpoints directly to avoid routing issues
  app.post('/api/auth/login', async (req, res) => {
    try {
      const msalService = require('../auth/msal-service.cjs');
      await msalService.login(req, res);
      console.log('Login process initiated');
    } catch (error) {
      console.error('Login failed:', error);
      res.status(500).json({ error: 'Login failed', message: error.message });
    }
  });
  
  // Also support GET for direct browser navigation
  app.get('/api/auth/login', async (req, res) => {
    try {
      const msalService = require('../auth/msal-service.cjs');
      await msalService.login(req, res);
      console.log('Login process initiated (GET)');
    } catch (error) {
      console.error('Login failed (GET):', error);
      res.status(500).json({ error: 'Login failed', message: error.message });
    }
  });
  
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const msalService = require('../auth/msal-service.cjs');
      await msalService.logout(req, res);
      console.log('User logged out successfully');
    } catch (error) {
      console.error('Logout failed:', error);
      res.status(500).json({ error: 'Logout failed', message: error.message });
    }
  });
  
  // Handle OAuth callback
  app.get('/api/auth/callback', async (req, res) => {
    try {
      const msalService = require('../auth/msal-service.cjs');
      await msalService.handleAuthCallback(req, res);
      console.log('OAuth callback processed successfully');
    } catch (error) {
      console.error('OAuth callback failed:', error);
      res.redirect('/?error=' + encodeURIComponent('Authentication failed: ' + error.message));
    }
  });
  
  // Create API router for other endpoints
  const apiRouter = express.Router();
  registerRoutes(apiRouter);
  
  // Ensure all mail-related endpoints respond with JSON content type
  apiRouter.use('/v1/mail', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
  });
  
  // Also catch any sub-paths of mail
  apiRouter.use('/v1/mail/*', (req, res, next) => {
    res.setHeader('Content-Type', 'application/json');
    next();
  });
  
  // Mount the API router at /api
  app.use('/api', apiRouter);
  
  // Add direct health endpoint
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
  });
  
  // Explicitly define MIME types
  const mimeTypes = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon'
  };

  // Serve static files for frontend with proper MIME types
  app.use(express.static(path.join(__dirname, '../renderer'), {
    setHeaders: (res, filePath) => {
      const ext = path.extname(filePath).toLowerCase();
      if (mimeTypes[ext]) {
        res.setHeader('Content-Type', mimeTypes[ext] + '; charset=UTF-8');
      }
      // Add cache control for development
      res.setHeader('Cache-Control', 'no-cache');
    }
  }));
  
  // Fallback for SPA routing - but exclude API routes
  app.get('*', (req, res, next) => {
    // Skip if it's an API route
    if (req.path.startsWith('/api/')) {
      // If it's an API route that wasn't matched, return 404 instead of the HTML
      return res.status(404).json({ error: 'API endpoint not found', path: req.path });
    }
    // For all other routes, serve the SPA
    res.sendFile(path.join(__dirname, '../renderer/index.html'));
  });
  
  // Start the server
  return new Promise((resolve) => {
    server = app.listen(port, () => {
      monitoringService.info(`Combined server running at http://localhost:${port}`, {}, 'server');
      resolve(server);
    });
  });
}

/**
 * Stop the server if it's running
 * @returns {Promise<void>}
 */
function stopCombinedServer() {
  return new Promise((resolve, reject) => {
    if (server) {
      monitoringService.info('Stopping combined server...', {}, 'server');
      server.close((err) => {
        if (err) {
          monitoringService.error(`Error stopping server: ${err.message}`, { stack: err.stack }, 'server');
          reject(err);
        } else {
          monitoringService.info('Server stopped successfully', {}, 'server');
          resolve();
        }
      });
    } else {
      monitoringService.info('No server running to stop', {}, 'server');
      resolve();
    }
  });
}

module.exports = { startCombinedServer, stopCombinedServer };