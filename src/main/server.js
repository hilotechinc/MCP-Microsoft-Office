/**
 * @fileoverview Local Express server for MCP API.
 * Sets up RESTful endpoints, middleware, error handling, and logging.
 * Follows MCP modularity, async, and testable design.
 */

const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const errorService = require('../core/error-service');
const monitoringService = require('../core/monitoring-service');

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Request logging
app.use((req, res, next) => {
    monitoringService.info(`Request: ${req.method} ${req.url}`, { ip: req.ip });
    next();
});

// Health endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', ts: new Date().toISOString() });
});

// API routes
const { registerRoutes } = require('../api/routes');
const apiRouter = express.Router();
registerRoutes(apiRouter);
app.use('/api', apiRouter);

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

module.exports = { app, startServer, stopServer };
