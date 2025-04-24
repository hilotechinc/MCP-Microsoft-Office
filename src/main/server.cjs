/**
 * @fileoverview Local Express server for MCP API.
 * Sets up RESTful endpoints, middleware, error handling, and logging.
 * Follows MCP modularity, async, and testable design.
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const errorService = require('../core/error-service.cjs');
const monitoringService = require('../core/monitoring-service.cjs');

const app = express();

/**
 * Sets up middleware for the Express app.
 * @param {express.Application} expressApp - The Express app to set up middleware for
 */
function setupMiddleware(expressApp) {
    // Middleware
    expressApp.use(cors());
    expressApp.use(bodyParser.json({ limit: '2mb' }));
    expressApp.use(morgan('dev'));

    // Request logging
    expressApp.use((req, res, next) => {
        monitoringService.info(`Request: ${req.method} ${req.url}`, { ip: req.ip });
        next();
    });
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
