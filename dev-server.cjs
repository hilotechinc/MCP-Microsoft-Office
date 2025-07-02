/**
 * @fileoverview Enhanced dev server for MCP Desktop development.
 * - Combined frontend and API server
 * - Serves static files with proper MIME types
 * - Handles authentication
 * - Improved logging
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const http = require('http');

// Import services
const monitoringService = require('./src/core/monitoring-service.cjs');
const errorService = require('./src/core/error-service.cjs');
const storageService = require('./src/core/storage-service.cjs');

// Import the server module but don't start it automatically
const serverModule = require('./src/main/server.cjs');

// Import initialization function for modules
const { initializeModules } = require('./src/modules/init-modules.cjs');

// Set up dependency injection between services to avoid circular references
// This is critical to prevent infinite error loops
errorService.setLoggingService(monitoringService);

// Add global error handlers to prevent crashes
process.on('uncaughtException', (err) => {
  // Generate a trace ID for this error
  const traceId = `uncaught-exception-${Date.now()}`;
  
  try {
    const mcpError = errorService.createError(
      errorService.CATEGORIES.SYSTEM,
      `Uncaught Exception: ${err.message}`,
      errorService.SEVERITIES.CRITICAL,
      { stack: err.stack, timestamp: new Date().toISOString() },
      traceId
    );
    
    // Log the error with the monitoring service
    monitoringService.logError(mcpError);
    
    // Also log to console for immediate visibility
    console.error(`[CRITICAL ERROR] Uncaught Exception: ${err.message} (Trace ID: ${traceId})`);
  } catch (loggingError) {
    // Last resort error handling if our error handling itself fails
    console.error(`[SYSTEM] Failed to log uncaught exception: ${loggingError.message}`);
    console.error(`[SYSTEM] Original error: ${err.message}`);
  }
  // Don't exit the process, just log the error
});

process.on('unhandledRejection', (reason, promise) => {
  // Generate a trace ID for this error
  const traceId = `unhandled-rejection-${Date.now()}`;
  
  try {
    const mcpError = errorService.createError(
      errorService.CATEGORIES.SYSTEM,
      `Unhandled Promise Rejection: ${reason}`,
      errorService.SEVERITIES.ERROR,
      { reason, timestamp: new Date().toISOString() },
      traceId
    );
    
    // Log the error with the monitoring service
    monitoringService.logError(mcpError);
    
    // Also log to console for immediate visibility
    console.error(`[ERROR] Unhandled Promise Rejection (Trace ID: ${traceId})`);
  } catch (loggingError) {
    // Last resort error handling if our error handling itself fails
    console.error(`[SYSTEM] Failed to log unhandled rejection: ${loggingError.message}`);
    console.error(`[SYSTEM] Original rejection: ${reason}`);
  }
  // Don't exit the process, just log the error
});

async function startDevServer() {
  // Starting development server
  
  // Initialize database factory and storage service first
  try {
    await initializeModules();
  } catch (error) {
    monitoringService.error('Failed to initialize database factory and storage service:', { 
      error: error.message, 
      stack: error.stack 
    }, 'dev-server');
    throw error;
  }
  
  // Create a single Express app for both frontend and API
  const app = express();
  const HOST = process.env.HOST || 'localhost';
  const PORT = process.env.PORT || 3000;
  
  // Skip verbose request logging for cleaner output
  
  // Directly register API routes on the main app
  // This avoids proxy issues by using the same server for both frontend and API
  
  // Import required modules for API
  const statusRouter = require('./src/api/status.cjs');
  const { registerRoutes } = require('./src/api/routes.cjs');
  
  // Set up middleware from the server module
  serverModule.setupMiddleware(app);
  
  // Set up session middleware for authentication
  app.use(session({
    secret: 'mcp-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false } // Set to true if using HTTPS
  }));
  
  // Register API routes directly
  app.use('/api/status', statusRouter);
  
  // Register auth endpoints directly to avoid routing issues
  // Support both GET and POST for login
  app.get('/api/auth/login', async (req, res) => {
    try {
      const msalService = require('./src/auth/msal-service.cjs');
      await msalService.login(req, res);
      // Login initiated
    } catch (error) {
      console.error('Login failed:', error);
      res.status(500).json({ error: 'Login failed', message: error.message });
    }
  });
  
  app.post('/api/auth/login', async (req, res) => {
    try {
      const msalService = require('./src/auth/msal-service.cjs');
      await msalService.login(req, res);
      // Login initiated
    } catch (error) {
      console.error('Login failed:', error);
      res.status(500).json({ error: 'Login failed', message: error.message });
    }
  });
  
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const msalService = require('./src/auth/msal-service.cjs');
      await msalService.logout(req, res);
      // User logged out
    } catch (error) {
      console.error('Logout failed:', error);
      res.status(500).json({ error: 'Logout failed', message: error.message });
    }
  });
  
  // Handle OAuth callback
  app.get('/api/auth/callback', async (req, res) => {
    try {
      const msalService = require('./src/auth/msal-service.cjs');
      await msalService.handleAuthCallback(req, res);
      // OAuth callback processed
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
  
  // Also catch any sub-paths of mail (eg. /v1/mail/search, /v1/mail/attachments, etc.)
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
  
  // Add CORS headers for development
  app.use((req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
    next();
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
  app.use(express.static(path.join(__dirname, 'src/renderer'), {
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
    res.sendFile(path.join(__dirname, 'src/renderer/index.html'));
  });
  
  // Start the server
  const server = app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running at http://${HOST}:${PORT}`);
  });
  
  // Handle server shutdown gracefully
  process.on('SIGINT', () => {
    console.log('Shutting down server...');
    server.close(() => {
      process.exit(0);
    });
  });
  
  return server;
}

startDevServer().catch(err => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
