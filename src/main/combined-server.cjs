/**
 * @fileoverview Combined Express server for MCP Web App.
 * Combines both the API and frontend serving capabilities.
 * Based on the dev-server.cjs approach for production use.
 */

// Load environment variables from .env file
require('dotenv').config();

const express = require('express');
const session = require('express-session');
const path = require('path');
const http = require('http');
const https = require('https');
const fs = require('fs');
const helmet = require('helmet');
const { setupMiddleware } = require('./server.cjs');
const monitoringService = require('../core/monitoring-service.cjs');
const errorService = require('../core/error-service.cjs');
const { initializeModules } = require('../modules/init-modules.cjs');
const { databaseFactory } = require('../core/database-factory.cjs');

// Create a combined express server instance
const app = express();
let server = null;

// If this file is being run directly (not imported), start the server
if (require.main === module) {
  monitoringService?.info('Starting combined server...', { directExecution: true }, 'server');
  startCombinedServer().then(() => {
    monitoringService?.info('Server started successfully!', { directExecution: true }, 'server');
    // Server startup is already logged in startCombinedServer function
    // Just log the log file path for user convenience when running directly
    if (monitoringService?.LOG_FILE_PATH) {
      monitoringService?.info(`📊 Logs written to ${monitoringService?.LOG_FILE_PATH}`, { logFilePath: monitoringService?.LOG_FILE_PATH }, 'server');
    }
  }).catch(err => {
    monitoringService?.error('Failed to start combined server:', { error: err.message, stack: err.stack }, 'server');
    const error = errorService?.createError(
      errorService?.CATEGORIES.SYSTEM,
      `Failed to start combined server: ${err.message}`,
      errorService?.SEVERITIES.CRITICAL,
      { stack: err.stack }
    );
    monitoringService?.logError(error);
    process.exit(1);
  });
}

// Add global error handlers but allow process termination with SIGINT
process.on('uncaughtException', (err) => {
  const mcpError = errorService?.createError(
    errorService?.CATEGORIES.SYSTEM,
    `Uncaught Exception: ${err.message}`,
    errorService?.SEVERITIES.CRITICAL,
    { stack: err.stack }
  );
  
  if (monitoringService) {
    monitoringService.logError(mcpError);
  } else {
    // Fallback logging when MonitoringService is not available
    process.stderr.write(`[monitoringService missing] Failed to log error: ${JSON.stringify({
      category: 'system',
      message: `Uncaught Exception: ${err.message}`,
      severity: 'critical',
      stack: err.stack
    })}\n`);
  }
  
  // Emit event for UI subscribers if available
  const logData = {
    level: 'error',
    message: `Uncaught Exception: ${err.message}`,
    timestamp: new Date().toISOString(),
    category: 'system',
    id: mcpError?.id
  };
  
  if (monitoringService?.logEmitter) {
    monitoringService.logEmitter.emit('log', logData);
  } else {
    // Fallback if logEmitter not available
    process.stderr.write(`[LogEmitter not available] Emitting log fallback: ${JSON.stringify(logData)}\n`);
  }
  // Log the error but still allow normal termination
});

process.on('unhandledRejection', (reason, promise) => {
  // Convert reason to string safely
  const reasonStr = reason instanceof Error ? reason.message : String(reason);
  const stack = reason instanceof Error ? reason.stack : undefined;
  
  const mcpError = errorService?.createError(
    errorService?.CATEGORIES.SYSTEM,
    `Unhandled Promise Rejection: ${reasonStr}`,
    errorService?.SEVERITIES.ERROR,
    { stack, reason: reasonStr }
  );
  
  if (monitoringService) {
    monitoringService.logError(mcpError);
  } else {
    // Fallback logging when MonitoringService is not available
    process.stderr.write(`[monitoringService missing] Failed to log error: ${JSON.stringify({
      category: 'system',
      message: `Unhandled Promise Rejection: ${reasonStr}`,
      severity: 'error',
      stack,
      reason: reasonStr
    })}\n`);
  }
  
  // Emit event for UI subscribers if available
  const logData = {
    level: 'error',
    message: `Unhandled Promise Rejection: ${reasonStr}`,
    timestamp: new Date().toISOString(),
    category: 'system',
    id: mcpError?.id
  };
  
  if (monitoringService?.logEmitter) {
    monitoringService.logEmitter.emit('log', logData);
  } else {
    // Fallback if logEmitter not available
    process.stderr.write(`[LogEmitter not available] Emitting log fallback: ${JSON.stringify(logData)}\n`);
  }
  // Log the error but still allow normal termination
});

// Add proper SIGINT handler to allow Ctrl+C termination
process.on('SIGINT', async () => {
  monitoringService?.info('Received SIGINT (Ctrl+C). Shutting down gracefully...', {}, 'system');
  if (server) {
    monitoringService?.info('Closing server...', {}, 'system');
    await stopCombinedServer();
  }
  monitoringService?.info('Exiting process...', {}, 'system');
  process.exit(0);
});

/**
 * Start a combined server that serves both API and frontend
 * @param {number} port - Port to listen on
 * @returns {Promise<http.Server>} The HTTP server instance
 */
async function startCombinedServer(port = 3000) {
  monitoringService?.info('Setting up combined server...', { port }, 'server');
  
  // Initialize database factory and storage service first
  try {
    monitoringService?.info('Initializing database factory and storage service...', {}, 'server');
    await initializeModules();
    monitoringService?.info('Database factory and storage service initialized successfully', {}, 'server');
  } catch (error) {
    const mcpError = errorService?.createError(
      errorService?.CATEGORIES.DATABASE,
      `Failed to initialize database factory and storage service: ${error.message}`,
      errorService?.SEVERITIES.ERROR,
      { stack: error.stack }
    );
    monitoringService?.logError(mcpError);
    throw error;
  }
  
  // Set up middleware from the server module
  try {
    setupMiddleware(app);
    monitoringService?.info('Common middleware set up successfully.', {}, 'server');
  } catch (err) {
    monitoringService?.error('Error setting up middleware:', { error: err.message, stack: err.stack }, 'server');
    throw err;
  }
  
  // Add request logging middleware
  app.use((req, res, next) => {
    // Skip logging for static assets to reduce noise
    if (!req.path.startsWith('/api/') && (req.path.includes('.') || req.path === '/')) {
      return next();
    }
    
    // Skip logging OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      return next();
    }
    
    const requestStart = Date.now();
    const requestId = require('crypto').randomUUID();
    
    // Log the incoming request
    monitoringService?.info(`Incoming ${req.method} request to ${req.path}`, 
      { requestId, method: req.method, path: req.path, query: req.query, ip: req.ip }, 'api');
    
    // Track response time and status on completion
    res.on('finish', () => {
      const duration = Date.now() - requestStart;
      const statusCode = res.statusCode;
      
      // Log the response
      const logLevel = statusCode >= 400 ? 'warn' : 'info';
      if (monitoringService && typeof monitoringService[logLevel] === 'function') {
        monitoringService[logLevel](`${req.method} ${req.path} completed with status ${statusCode}`, 
          { requestId, method: req.method, path: req.path, statusCode, duration }, 'api');
      }
      
      // Track metrics
      monitoringService?.trackMetric('api.request.duration', duration, 
        { method: req.method, path: req.path, statusCode });
    });
    
    next();
  });
  
  // Add request logging middleware to log all API requests at debug level
  app.use((req, res, next) => {
    monitoringService?.debug(`${req.method} ${req.path}`, { 
      query: req.query, 
      body: req.method !== 'GET' ? req.body : undefined,
      params: req.params,
      ip: req.ip,
      timestamp: new Date().toISOString()
    }, 'api-request');
    next();
  });
  
  // Add CORS headers for web requests
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
  
  // Add helmet middleware for security headers
  monitoringService?.info('Configuring security headers with Helmet...', {}, 'security');
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
    ieNoOpen: true,
    // Don't infer MIME type
    noSniff: true
  }));
  
  // Set up session middleware for authentication
  monitoringService?.info('Setting up session middleware...', {}, 'server');
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(session({
    secret: process.env.SESSION_SECRET || 'mcp-desktop-secret',
    resave: false,
    saveUninitialized: true,
    cookie: { 
      secure: isProduction, // Use secure cookies in production (requires HTTPS)
      sameSite: isProduction ? 'strict' : 'lax' // Stricter same-site policy in production
    }
  }));
  monitoringService?.info('Session middleware set up successfully.', {}, 'server');
  
  // Log session configuration but redact sensitive data
  monitoringService?.debug('Session middleware configured', {
    secureCookie: isProduction,
    sameSite: isProduction ? 'strict' : 'lax',
    usingEnvSecret: !!process.env.SESSION_SECRET,
    environment: process.env.NODE_ENV || 'development'
  }, 'server');
  
  // NOTE: In production, ensure your server is using HTTPS for secure cookies to work properly
  
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
      monitoringService?.info('Login process initiated', { method: 'POST', ip: req.ip }, 'auth');
    } catch (error) {
      const mcpError = errorService?.createError(
        errorService?.CATEGORIES.AUTH,
        `Login failed: ${error.message}`,
        errorService?.SEVERITIES.ERROR,
        { method: 'POST', ip: req.ip, stack: error.stack }
      );
      monitoringService?.logError(mcpError);
      res.status(500).json({ error: 'Login failed', message: error.message, id: mcpError?.id || 'unknown' });
    }
  });
  
  // Also support GET for direct browser navigation
  app.get('/api/auth/login', async (req, res) => {
    try {
      const msalService = require('../auth/msal-service.cjs');
      await msalService.login(req, res);
      monitoringService?.info('Login process initiated', { method: 'GET', ip: req.ip }, 'auth');
    } catch (error) {
      const mcpError = errorService?.createError(
        errorService?.CATEGORIES.AUTH,
        `Login failed: ${error.message}`,
        errorService?.SEVERITIES.ERROR,
        { method: 'GET', ip: req.ip, stack: error.stack }
      );
      monitoringService?.logError(mcpError);
      res.status(500).json({ error: 'Login failed', message: error.message, id: mcpError?.id || 'unknown' });
    }
  });
  
  app.post('/api/auth/logout', async (req, res) => {
    try {
      const msalService = require('../auth/msal-service.cjs');
      await msalService.logout(req, res);
      monitoringService?.info('User logged out successfully', { ip: req.ip }, 'auth');
    } catch (error) {
      const mcpError = errorService?.createError(
        errorService?.CATEGORIES.AUTH,
        `Logout failed: ${error.message}`,
        errorService?.SEVERITIES.ERROR,
        { ip: req.ip, stack: error.stack }
      );
      monitoringService?.logError(mcpError);
      res.status(500).json({ error: 'Logout failed', message: error.message, id: mcpError?.id || 'unknown' });
    }
  });
  
  // Handle OAuth callback
  app.get('/api/auth/callback', async (req, res) => {
    try {
      const msalService = require('../auth/msal-service.cjs');
      await msalService.handleAuthCallback(req, res);
      monitoringService?.info('OAuth callback processed successfully', { ip: req.ip }, 'auth');
    } catch (error) {
      const mcpError = errorService?.createError(
        errorService?.CATEGORIES.AUTH,
        `OAuth callback failed: ${error.message}`,
        errorService?.SEVERITIES.ERROR,
        { ip: req.ip, stack: error.stack }
      );
      monitoringService?.logError(mcpError);
      // Include error ID in the redirect if available
      const errorId = mcpError?.id ? `&errorId=${mcpError.id}` : '';
      res.redirect('/?error=' + encodeURIComponent('Authentication failed: ' + error.message) + errorId);
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
    const timestamp = new Date().toISOString();
    monitoringService?.debug('Health check requested', { timestamp, ip: req.ip }, 'api');
    res.json({ status: 'ok', ts: timestamp });
    // Track health check as a metric for monitoring
    monitoringService?.trackMetric('api.health.check', 1, { ip: req.ip });
  });
  
  // Explicitly define MIME types
  const mimeTypes = {
    // HTML and document types
    '.html': 'text/html',
    '.htm': 'text/html',
    '.xml': 'text/xml',
    '.pdf': 'application/pdf',
    
    // JavaScript and module types
    '.js': 'application/javascript',
    '.mjs': 'application/javascript', // ES modules
    '.cjs': 'application/javascript', // CommonJS modules
    
    // Stylesheet types
    '.css': 'text/css',
    '.scss': 'text/css',
    '.less': 'text/css',
    
    // Data interchange formats
    '.json': 'application/json',
    '.map': 'application/json', // Source maps
    
    // Image types
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.bmp': 'image/bmp',
    
    // Font types
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.otf': 'font/otf',
    '.eot': 'application/vnd.ms-fontobject',
    
    // Audio/Video types
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    
    // Other types
    '.txt': 'text/plain',
    '.csv': 'text/csv',
    '.md': 'text/markdown'
  };
  
  // Extend this map as needed for new asset types

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
      const mcpError = errorService?.createError(
        errorService?.CATEGORIES.API,
        `API endpoint not found: ${req.path}`,
        errorService?.SEVERITIES.WARNING,
        { path: req.path, method: req.method, ip: req.ip }
      );
      monitoringService?.logError(mcpError);
      return res.status(404).json({ 
        error: 'API endpoint not found', 
        path: req.path,
        id: mcpError?.id || 'unknown'
      });
    }
    // For all other routes, serve the SPA
    monitoringService?.debug(`Serving SPA for route: ${req.path}`, { path: req.path }, 'server');
    res.sendFile(path.join(__dirname, '../renderer/index.html'));
  });
  
  monitoringService?.info('About to start the server...', { port }, 'server');
  // Start the server
  const startTime = Date.now();
  return new Promise((resolve) => {
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
          monitoringService?.info('HTTPS enabled with SSL certificates', { 
            keyPath: sslKeyPath, 
            certPath: sslCertPath 
          }, 'server');
        } else {
          monitoringService?.warn('SSL certificate files not found, falling back to HTTP', { 
            keyPath: sslKeyPath, 
            certPath: sslCertPath 
          }, 'server');
          serverInstance = http.createServer(app);
        }
      } catch (error) {
        monitoringService?.error('Failed to load SSL certificates, falling back to HTTP', { 
          error: error.message,
          keyPath: sslKeyPath, 
          certPath: sslCertPath 
        }, 'server');
        serverInstance = http.createServer(app);
      }
    } else {
      serverInstance = http.createServer(app);
      if (useHttps) {
        monitoringService?.warn('HTTPS requested but SSL paths not configured, using HTTP', {
          enableHttps: useHttps,
          sslKeyPath,
          sslCertPath
        }, 'server');
      }
    }
    
    server = serverInstance.listen(port, () => {
      const startupTime = Date.now() - startTime;
      const serverUrl = `${protocol}://localhost:${port}`;
      
      if (monitoringService) {
        monitoringService.info(`Combined server running at ${serverUrl}`, { 
          startupTime, 
          port, 
          protocol,
          startup: true 
        }, 'server');
        monitoringService.trackMetric('server.startup.time', startupTime, { port, protocol });
      } else {
        // Fallback logging when MonitoringService is not available
        process.stdout.write(`[monitoringService missing] Server running at ${serverUrl} ${JSON.stringify({
          startupTime,
          port,
          protocol,
          startup: true
        })}\n`);
      }
      
      // Emit event for UI subscribers if available
      const logData = {
        level: 'info',
        message: `Combined server running at ${serverUrl}`,
        timestamp: new Date().toISOString(),
        category: 'server',
        context: { startupTime, port, protocol, startup: true }
      };
      
      if (monitoringService?.logEmitter) {
        monitoringService.logEmitter.emit('log', logData);
      } else {
        // Fallback if logEmitter not available
        process.stdout.write(`[LogEmitter not available] Emitting log fallback: ${JSON.stringify(logData)}\n`);
      }
      
      resolve(server);
    });
  });
}

/**
 * Stop the server if it's running
 * @returns {Promise<void>}
 */
function stopCombinedServer() {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();
    monitoringService?.info('Stopping combined server...', {}, 'server');
    
    try {
      // Close database factory
      if (databaseFactory && databaseFactory.initialized) {
        monitoringService?.info('Closing database factory...', {}, 'server');
        await databaseFactory.close();
        monitoringService?.info('Database factory closed successfully', {}, 'server');
      }
    } catch (error) {
      const mcpError = errorService?.createError(
        errorService?.CATEGORIES.DATABASE,
        `Error closing database factory: ${error.message}`,
        errorService?.SEVERITIES.ERROR,
        { stack: error.stack }
      );
      monitoringService?.logError(mcpError);
      // Continue with server shutdown even if database cleanup fails
    }
    
    if (server) {
      server.close((err) => {
        const shutdownTime = Date.now() - startTime;
        if (err) {
          const mcpError = errorService?.createError(
            errorService?.CATEGORIES.SYSTEM,
            `Error stopping server: ${err.message}`,
            errorService?.SEVERITIES.ERROR,
            { stack: err.stack, shutdownTime }
          );
          monitoringService?.logError(mcpError);
          reject(err);
        } else {
          if (monitoringService) {
            monitoringService.info('Server stopped successfully', { shutdownTime, shutdown: true }, 'server');
            monitoringService.trackMetric('server.shutdown.time', shutdownTime, {});
          } else {
            // Fallback logging when MonitoringService is not available
            process.stdout.write(`[monitoringService missing] Server stopped successfully ${JSON.stringify({
              shutdownTime,
              shutdown: true
            })}\n`);
          }
          
          // Emit event for UI subscribers if available
          const logData = {
            level: 'info',
            message: 'Server stopped successfully',
            timestamp: new Date().toISOString(),
            category: 'server',
            context: { shutdownTime, shutdown: true }
          };
          
          if (monitoringService?.logEmitter) {
            monitoringService.logEmitter.emit('log', logData);
          } else {
            // Fallback if logEmitter not available
            process.stdout.write(`[LogEmitter not available] Emitting log fallback: ${JSON.stringify(logData)}\n`);
          }
          
          resolve();
        }
      });
    } else {
      monitoringService?.info('No server running to stop', {}, 'server');
      resolve();
    }
  });
}

module.exports = { startCombinedServer, stopCombinedServer };