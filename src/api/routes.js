/**
 * @fileoverview Registers all API routes and controllers for MCP.
 * Handles versioning, middleware, and route registration.
 */

const express = require('express');
const queryControllerFactory = require('./controllers/query-controller');
const mailControllerFactory = require('./controllers/mail-controller');
const calendarControllerFactory = require('./controllers/calendar-controller');
const filesControllerFactory = require('./controllers/files-controller');
const { requireAuth } = require('./middleware/auth-middleware');
const apiContext = require('./api-context');

/**
 * Registers all API routes on the provided router.
 * @param {express.Router} router
 */
function registerRoutes(router) {
    // Health check endpoint
    router.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });
    // Versioned API path
    const v1 = express.Router();
    v1.use(requireAuth); // Require authentication for all v1 endpoints

    // Create injected controller instances
    const mailController = mailControllerFactory({ mailModule: apiContext.mailModule });
    const calendarController = calendarControllerFactory({ calendarModule: apiContext.calendarModule });
    const filesController = filesControllerFactory({ filesModule: apiContext.filesModule });
    const queryController = queryControllerFactory({
        nluAgent: apiContext.nluAgent,
        contextService: apiContext.contextService,
        errorService: apiContext.errorService
    });

    // Query endpoint
    v1.post('/query', queryController.handleQuery);

    // Mail endpoints
    v1.get('/mail', mailController.getMail);
    v1.post('/mail/send', mailController.sendMail);

    // Calendar endpoints
    v1.get('/calendar', calendarController.getEvents);
    v1.post('/calendar/create', calendarController.createEvent);

    // Files endpoints
    v1.get('/files', filesController.listFiles);
    v1.post('/files/upload', filesController.uploadFile);

    // Mount v1
    router.use('/v1', v1);
}

module.exports = { registerRoutes };
