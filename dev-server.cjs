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
const https = require('https');
const fs = require('fs');
const helmet = require('helmet');

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
  
  // Define environment variables early so they're available throughout the function
  const isProduction = process.env.NODE_ENV === 'production';
  const isHttps = process.env.ENABLE_HTTPS === 'true';
  const isSilentMode = process.env.MCP_SILENT_MODE === 'true';
  
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
  
  // Configure HTTP request logging (Morgan) based on environment
  // Using the environment variables defined at the start of the function
  
  // Only log HTTP requests in development mode, NEVER in production with silent mode
  if (!isProduction) {
    const morgan = require('morgan');
    app.use(morgan('dev', {
      // Skip logging for static assets in any mode to reduce noise
      skip: (req) => req.url.includes('.') && !req.url.endsWith('.html')
    }));
    monitoringService.info('HTTP request logging enabled in development mode', {}, 'server');
  } else {
    // In production, we don't use morgan at all when silent mode is enabled
    monitoringService.info('HTTP request logging disabled in production mode', {}, 'server');
  }
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
  
  // Add helmet middleware for security headers
  monitoringService.info('Configuring security headers with Helmet...', {}, 'security');
  app.use(helmet({
    // Content Security Policy
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        fontSrc: ["'self'", "https://fonts.gstatic.com"],
        scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // unsafe-eval needed for some frameworks
        imgSrc: ["'self'", "data:", "https:"],
        connectSrc: ["'self'", "https://graph.microsoft.com", "https://login.microsoftonline.com"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        baseUri: ["'self'"]
      }
    },
    // HTTP Strict Transport Security (HSTS)
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true
    },
    // X-Frame-Options
    frameguard: { action: 'deny' },
    // X-Content-Type-Options
    noSniff: true,
    // X-XSS-Protection
    xssFilter: true,
    // Referrer Policy
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    // Hide X-Powered-By header
    hidePoweredBy: true,
    // DNS Prefetch Control
    dnsPrefetchControl: { allow: false },
    // IE No Open
    ieNoOpen: true
  }));
  
  // Set up session middleware for authentication
  monitoringService.info('Setting up session middleware...', {}, 'server');
  
  // Create session store with proper garbage collection
  const MemoryStore = require('memorystore')(session);
  
  // Configure session middleware
  app.use(session({
    secret: process.env.SESSION_SECRET || 'mcp-session-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      // Only use secure cookies when HTTPS is enabled
      // This is critical for authentication to work on HTTP in development
      secure: isProduction && isHttps,
      
      // Use 'lax' for both environments to ensure cookies are sent with navigation
      // This is important for the PKCE flow to work properly
      sameSite: 'lax',
      
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
      httpOnly: true // Prevent client-side JavaScript from accessing cookies
    },
    // Use a more reliable memory store with proper garbage collection
    store: new MemoryStore({
      checkPeriod: 86400000 // Prune expired entries every 24h
    })
  }));
  
  // Log session configuration but redact sensitive data
  monitoringService.debug('Session middleware configured', {
    secureCookie: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    usingEnvSecret: !!process.env.SESSION_SECRET,
    environment: process.env.NODE_ENV || 'development'
  }, 'server');
  
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
  const startTime = Date.now();
  
  // Check if HTTPS should be enabled
  const useHttps = process.env.ENABLE_HTTPS === 'true';
  const sslKeyPath = process.env.SSL_KEY_PATH;
  const sslCertPath = process.env.SSL_CERT_PATH;
  
  let serverInstance;
  let protocol = 'http';
  
  if (useHttps && sslKeyPath && sslCertPath) {
    try {
      // Check if SSL certificate files exist
      if (fs.existsSync(sslKeyPath) && fs.existsSync(sslCertPath)) {
        const sslOptions = {
          key: fs.readFileSync(sslKeyPath),
          cert: fs.readFileSync(sslCertPath)
        };
        serverInstance = https.createServer(sslOptions, app);
        protocol = 'https';
        monitoringService.info('HTTPS enabled with SSL certificates', { 
          keyPath: sslKeyPath, 
          certPath: sslCertPath 
        }, 'server');
      } else {
        monitoringService.warn('SSL certificate files not found, falling back to HTTP', { 
          keyPath: sslKeyPath, 
          certPath: sslCertPath 
        }, 'server');
        serverInstance = http.createServer(app);
      }
    } catch (error) {
      monitoringService.error('Failed to load SSL certificates, falling back to HTTP', { 
        error: error.message,
        keyPath: sslKeyPath, 
        certPath: sslCertPath 
      }, 'server');
      serverInstance = http.createServer(app);
    }
  } else {
    serverInstance = http.createServer(app);
    if (useHttps) {
      monitoringService.warn('HTTPS requested but SSL paths not configured, using HTTP', {
        enableHttps: useHttps,
        sslKeyPath,
        sslCertPath
      }, 'server');
    }
  }
  
  const server = serverInstance.listen(PORT, HOST, () => {
    const startupTime = Date.now() - startTime;
    const serverUrl = `${protocol}://${HOST}:${PORT}`;
    
    console.log(`🚀 Server running at ${serverUrl}`);
    monitoringService.info(`Enhanced dev server running at ${serverUrl}`, { 
      startupTime, 
      port: PORT, 
      protocol,
      production: process.env.NODE_ENV === 'production',
      silentMode: process.env.MCP_SILENT_MODE === 'true'
    }, 'server');
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
