/**
 * @fileoverview Local Express server for MCP API.
 * Sets up RESTful endpoints, middleware, error handling, and logging.
 * Follows MCP modularity, async, and testable design.
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const errorService = require('../core/error-service.cjs');
const monitoringService = require('../core/monitoring-service.cjs');

const app = express();

/**
 * Sets up middleware for the Express app.
 * @param {express.Application} expressApp - The Express app to set up middleware for
 */
function setupMiddleware(expressApp) {
    // Configure CORS for production and development
    const corsOptions = {
        origin: function (origin, callback) {
            // Allow requests with no origin (like mobile apps or curl requests)
            if (!origin) return callback(null, true);
            
            // Get allowed origins from environment or use defaults
            const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS 
                ? process.env.CORS_ALLOWED_ORIGINS.split(',').map(origin => origin.trim())
                : [
                    'http://localhost:3000',
                    'https://localhost:3000',
                    'http://127.0.0.1:3000',
                    'https://127.0.0.1:3000'
                ];
            
            // In development, allow all localhost origins
            if (process.env.NODE_ENV !== 'production') {
                const localhostPattern = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/;
                if (localhostPattern.test(origin)) {
                    return callback(null, true);
                }
            }
            
            // Check if origin is in allowed list
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                monitoringService?.warn('CORS blocked request from unauthorized origin', { 
                    origin,
                    allowedOrigins,
                    userAgent: 'N/A' // Will be available in req context
                }, 'security');
                callback(new Error('Not allowed by CORS'));
            }
        },
        credentials: true, // Allow cookies and authorization headers
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
        allowedHeaders: [
            'Origin',
            'X-Requested-With',
            'Content-Type',
            'Accept',
            'Authorization',
            'Cache-Control',
            'X-API-Key'
        ],
        exposedHeaders: ['X-Total-Count', 'X-Request-ID'],
        maxAge: 86400 // Cache preflight requests for 24 hours
    };
    
    // Middleware
    expressApp.use(cors(corsOptions));
    expressApp.use(bodyParser.json({ limit: '2mb' }));
    // Configure morgan to skip logging for all API endpoints to reduce log volume
    expressApp.use(morgan('dev', {
        skip: (req, res) => req.originalUrl.startsWith('/api/')
    }));

    // Request logging - skip API endpoints to reduce log volume
    expressApp.use((req, res, next) => {
        // Skip logging API requests to reduce log volume and prevent memory issues
        if (!req.originalUrl.startsWith('/api/')) {
            monitoringService.info(`Request: ${req.method} ${req.url}`, { ip: req.ip });
        }
        
        // IMPORTANT: Ensure API routes always return JSON
        if (req.url.startsWith('/api/v1/')) {
            // Make sure Content-Type is application/json for API responses
            const originalJson = res.json;
            res.json = function(body) {
                // Set Content-Type explicitly to ensure proper parsing by the client
                res.setHeader('Content-Type', 'application/json');
                return originalJson.call(this, body);
            };
        }
        
        next();
    });

    // Rate limiting middleware for authentication endpoints
    monitoringService?.info('Setting up rate limiting for authentication endpoints...', {
        authWindowMs: 15 * 60 * 1000,
        authMaxRequests: 100
    }, 'security');
    
    const authLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 100, // Limit each IP to 100 requests per windowMs
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        handler: (request, response, next) => {
            monitoringService?.warn('Rate limit exceeded for authentication endpoint', {
                ip: request.ip,
                userAgent: request.get('User-Agent'),
                endpoint: request.path
            }, 'security');
            
            const error = new Error('Too many authentication requests, please try again later.');
            error.statusCode = 429;
            next(error);
        }
    });

    // General API rate limiting (more lenient)
    monitoringService?.info('Setting up rate limiting for API endpoints...', {
        apiWindowMs: 15 * 60 * 1000,
        apiMaxRequests: 1000
    }, 'security');
    
    const apiLimiter = rateLimit({
        windowMs: 15 * 60 * 1000, // 15 minutes
        max: 1000, // Limit each IP to 1000 requests per windowMs for general API
        standardHeaders: true,
        legacyHeaders: false,
        handler: (request, response, next) => {
            monitoringService?.warn('Rate limit exceeded for API endpoint', {
                ip: request.ip,
                userAgent: request.get('User-Agent'),
                endpoint: request.path
            }, 'security');
            
            const error = new Error('Too many API requests, please try again later.');
            error.statusCode = 429;
            next(error);
        }
    });

    // Apply rate limiters
    expressApp.use('/api/v1/auth', authLimiter);
    expressApp.use('/api', apiLimiter);

    // Input sanitization middleware
    monitoringService?.info('Setting up input sanitization...', {
        sanitizeBody: true,
        sanitizeQuery: true
    }, 'security');
    
    expressApp.use((req, res, next) => {
        // Sanitize request body
        if (req.body && typeof req.body === 'object') {
            req.body = sanitizeObject(req.body);
        }
        
        // Sanitize query parameters
        if (req.query && typeof req.query === 'object') {
            req.query = sanitizeObject(req.query);
        }
        
        next();
    });
}

// Helper function to sanitize objects recursively
function sanitizeObject(obj) {
    if (obj === null || obj === undefined) {
        return obj;
    }
    
    if (typeof obj === 'string') {
        return sanitizeString(obj);
    }
    
    if (Array.isArray(obj)) {
        return obj.map(item => sanitizeObject(item));
    }
    
    if (typeof obj === 'object') {
        const sanitized = {};
        for (const [key, value] of Object.entries(obj)) {
            // Sanitize both key and value
            const cleanKey = sanitizeString(key);
            sanitized[cleanKey] = sanitizeObject(value);
        }
        return sanitized;
    }
    
    return obj;
}

// Helper function to sanitize strings
function sanitizeString(str) {
    if (typeof str !== 'string') {
        return str;
    }
    
    // Remove potential XSS patterns
    return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
        .replace(/javascript:/gi, '') // Remove javascript: protocol
        .replace(/on\w+\s*=/gi, '') // Remove event handlers like onclick=
        .replace(/data:text\/html/gi, '') // Remove data URLs with HTML
        .trim();
}

// Set up middleware for the main app
setupMiddleware(app);

// Health endpoints are now handled by the mainApiRouter

// API routes
const { registerRoutes } = require('../api/routes.cjs');
const statusRouter = require('../api/status.cjs');

// Create a main API router to handle all API endpoints
const mainApiRouter = express.Router();

// Mount the status router directly on the main API router
mainApiRouter.use('/status', statusRouter);

// Create a versioned API router for v1 endpoints
const apiRouter = express.Router();
registerRoutes(apiRouter);

// Mount the versioned API router on the main API router
mainApiRouter.use('/', apiRouter);

// Mount the main API router at /api
app.use('/api', mainApiRouter);

// Add a direct health endpoint for better discoverability
mainApiRouter.get('/health', (req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
    const mcpError = errorService.createError(
        'api',
        err.message || 'Internal server error',
        'error',
        { stack: err.stack, url: req.url, method: req.method }
    );
    monitoringService.logError(mcpError);
    res.status(500).json({ error: 'Internal server error' });
});

// Server lifecycle management
let server = null;
function startServer(port = 3001) {
    return new Promise((resolve) => {
        server = app.listen(port, () => {
            monitoringService.info(`API server started on port ${port}`);
            resolve(server);
        });
    });
}
function stopServer() {
    return new Promise((resolve, reject) => {
        if (server) {
            server.close((err) => {
                if (err) reject(err);
                else resolve();
            });
        } else {
            resolve();
        }
    });
}

module.exports = { app, startServer, stopServer, setupMiddleware };
