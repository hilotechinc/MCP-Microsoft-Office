// dev-server.cjs
// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const { createProxyMiddleware } = require('http-proxy-middleware');
const path = require('path');
const http = require('http');

// Import the server module but don't start it automatically
const serverModule = require('./src/main/server.cjs');

async function startDevServer() {
  // Create a single Express app for both frontend and API
  const app = express();
  const PORT = 3000;
  
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
  app.post('/api/auth/login', async (req, res) => {
    try {
      const msalService = require('./src/auth/msal-service.cjs');
      await msalService.login(req, res);
      console.log('Login process initiated');
    } catch (error) {
      console.error('Login failed:', error);
      res.status(500).json({ error: 'Login failed', message: error.message });
    }
  });
  
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const msalService = require('./src/auth/msal-service.cjs');
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
      const msalService = require('./src/auth/msal-service.cjs');
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
  app.listen(PORT, () => {
    console.log(`Combined server running at http://localhost:${PORT}`);
    console.log(`Visit http://localhost:${PORT} in your browser`);
  });
}

startDevServer().catch(err => {
  console.error('Failed to start development server:', err);
  process.exit(1);
});
