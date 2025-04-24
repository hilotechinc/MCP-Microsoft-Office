/**
 * @fileoverview Registers all API routes and controllers for MCP.
 * Handles versioning, middleware, and route registration.
 */

const express = require('express');
const queryControllerFactory = require('./controllers/query-controller.cjs');
const mailControllerFactory = require('./controllers/mail-controller.cjs');
const calendarControllerFactory = require('./controllers/calendar-controller.cjs');
const filesControllerFactory = require('./controllers/files-controller.cjs');
const { requireAuth } = require('./middleware/auth-middleware.cjs');
const apiContext = require('./api-context.cjs');

/**
 * Registers all API routes on the provided router.
 * @param {express.Router} router
 */
const statusRouter = require('./status.cjs');

function registerRoutes(router) {
    // MCP Tool Manifest for Claude Desktop
    router.get('/tools', (req, res) => {
        res.json({
            tools: [
                {
                    name: 'query',
                    description: 'Submit a natural language query to Microsoft 365 (mail, calendar, files)',
                    endpoint: '/api/v1/query',
                    method: 'POST',
                    parameters: {
                        query: { type: 'string', description: 'The user\'s natural language question' },
                        context: { type: 'object', description: 'Conversation context', optional: true }
                    }
                },
                {
                    name: 'getMail',
                    description: 'Fetch mail from Microsoft 365 inbox',
                    endpoint: '/api/v1/mail',
                    method: 'GET',
                    parameters: {
                        limit: { type: 'number', description: 'Number of messages to fetch', optional: true },
                        filter: { type: 'string', description: 'Filter string', optional: true }
                    }
                },
                {
                    name: 'sendMail',
                    description: 'Send an email via Microsoft 365',
                    endpoint: '/api/v1/mail/send',
                    method: 'POST',
                    parameters: {
                        to: { type: 'string|array', description: 'Recipient email(s)' },
                        subject: { type: 'string', description: 'Email subject' },
                        body: { type: 'string', description: 'Email body' }
                    }
                },
                {
                    name: 'getCalendar',
                    description: 'Fetch calendar events from Microsoft 365',
                    endpoint: '/api/v1/calendar',
                    method: 'GET',
                    parameters: {
                        limit: { type: 'number', description: 'Number of events to fetch', optional: true },
                        filter: { type: 'string', description: 'Filter string', optional: true }
                    }
                },
                {
                    name: 'createEvent',
                    description: 'Create a calendar event in Microsoft 365',
                    endpoint: '/api/v1/calendar/create',
                    method: 'POST',
                    parameters: {
                        subject: { type: 'string', description: 'Event subject' },
                        start: { type: 'object', description: 'Start time (ISO 8601, with timeZone)' },
                        end: { type: 'object', description: 'End time (ISO 8601, with timeZone)' }
                    }
                },
                {
                    name: 'listFiles',
                    description: 'List files in OneDrive/SharePoint',
                    endpoint: '/api/v1/files',
                    method: 'GET',
                    parameters: {
                        parentId: { type: 'string', description: 'Parent folder ID', optional: true }
                    }
                },
                {
                    name: 'uploadFile',
                    description: 'Upload a file to OneDrive/SharePoint',
                    endpoint: '/api/v1/files/upload',
                    method: 'POST',
                    parameters: {
                        name: { type: 'string', description: 'File name' },
                        content: { type: 'string', description: 'File content (base64 or plain text)' }
                    }
                }
            ]
        });
    });
    // Status endpoint (unauthenticated)
    router.use('/status', statusRouter);

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
