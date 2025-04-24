/**
 * @fileoverview Local Express server for MCP API.
 * Sets up RESTful endpoints, middleware, error handling, and logging.
 * Follows MCP modularity, async, and testable design.
 */

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const bodyParser = require('body-parser');
const session = require('express-session');
const errorService = require('../core/error-service.cjs');
const monitoringService = require('../core/monitoring-service.cjs');

const app = express();

// Session middleware (must come before routes)
app.use(session({
    secret: process.env.SESSION_SECRET || 'dev_secret',
    resave: false,
    saveUninitialized: false,
    cookie: { secure: false, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Middleware
app.use(cors());
app.use(bodyParser.json({ limit: '2mb' }));
app.use(morgan('dev'));

// Request logging
app.use((req, res, next) => {
    monitoringService.info(`[${req.method}] ${req.url}`);
    next();
});

// Serve static files
const path = require('path');
app.use(express.static(path.join(__dirname, '../renderer')));

// API routes
const { registerRoutes } = require('../api/routes.cjs');
const apiRouter = express.Router();
registerRoutes(apiRouter);
app.use('/api', apiRouter);

// SPA fallback (for direct navigation or client-side routing)
app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(__dirname, '../renderer/index.html'));
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

function startServer(port = 3000) {
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

if (require.main === module) {
    startServer();
}

module.exports = { app, startServer, stopServer };
