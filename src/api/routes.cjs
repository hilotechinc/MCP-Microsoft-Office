/**
 * @fileoverview Registers all API routes and controllers for MCP.
 * Handles versioning, middleware, and route registration.
 */

const express = require('express');
const queryControllerFactory = require('./controllers/query-controller.cjs');
const mailControllerFactory = require('./controllers/mail-controller.cjs');
const calendarControllerFactory = require('./controllers/calendar-controller.cjs');
const filesControllerFactory = require('./controllers/files-controller.cjs');
const peopleControllerFactory = require('./controllers/people-controller.cjs');
const logController = require('./controllers/log-controller.cjs');
const { requireAuth } = require('./middleware/auth-middleware.cjs');
const apiContext = require('./api-context.cjs');
const statusRouter = require('./status.cjs');

/**
 * TODO: [Rate Limiting] Implement and configure rate limiting middleware
 * const rateLimiter = require('express-rate-limit');
 * const postLimiter = rateLimiter({ windowMs: 15 * 60 * 1000, max: 100 }); // Example: 100 requests per 15 mins
 */
const placeholderRateLimit = (req, res, next) => next(); // Placeholder

/**
 * Registers all API routes on the provided router.
 * @param {express.Router} router
 */
function registerRoutes(router) {
    // MCP Tool Manifest for Claude Desktop
    router.get('/tools', (req, res) => {
        // Get tools dynamically from the tools service
        const tools = apiContext.toolsService.getAllTools();
        res.json({ tools });
    });

    // Health check endpoint (on main router before v1 to avoid potential v1 middleware)
    router.get('/health', (req, res) => {
        res.json({ status: 'ok' });
    });

    // Versioned API path
    const v1 = express.Router();
    // No authentication required for v1 endpoints - the backend will handle authentication internally

    // Create injected controller instances
    // TODO: Consider moving controller instantiation closer to where their routers are defined/used.
    const mailController = mailControllerFactory({ mailModule: apiContext.mailModule });
    const calendarController = calendarControllerFactory({ calendarModule: apiContext.calendarModule });
    const filesController = filesControllerFactory({ filesModule: apiContext.filesModule });
    const peopleController = peopleControllerFactory({ peopleModule: apiContext.peopleModule });
    const queryController = queryControllerFactory({
        nluAgent: apiContext.nluAgent,
        contextService: apiContext.contextService,
        errorService: apiContext.errorService
    });

    // --- Query Router --- 
    const queryRouter = express.Router();
    // TODO: Apply rate limiting
    queryRouter.post('/', placeholderRateLimit, queryController.handleQuery);
    v1.use('/query', queryRouter);

    // --- Mail Router --- 
    const mailRouter = express.Router();
    mailRouter.get('/', mailController.getMail); // Corresponds to /v1/mail
    // TODO: Apply rate limiting
    mailRouter.post('/send', placeholderRateLimit, mailController.sendMail); // Corresponds to /v1/mail/send
    mailRouter.get('/search', mailController.searchMail); // Corresponds to /v1/mail/search
    mailRouter.get('/attachments', mailController.getMailAttachments); // Corresponds to /v1/mail/attachments
    // IMPORTANT: Route order matters! Put specific routes before parametrized routes
    // Route order problem fixed: Specific routes now come before the :id pattern
    mailRouter.patch('/:id/read', placeholderRateLimit, mailController.markAsRead); // Corresponds to /v1/mail/:id/read
    // Flag/unflag email route
    mailRouter.post('/flag', placeholderRateLimit, mailController.flagMail); // Corresponds to /v1/mail/flag
    mailRouter.get('/:id', mailController.getEmailDetails); // Corresponds to /v1/mail/:id
    v1.use('/mail', mailRouter);

    // --- Calendar Router --- 
    const calendarRouter = express.Router();
    calendarRouter.get('/', calendarController.getEvents); // /v1/calendar
    // TODO: Apply rate limiting
    calendarRouter.post('/events', placeholderRateLimit, calendarController.createEvent); // /v1/calendar/events
    calendarRouter.put('/events/:id', calendarController.updateEvent); // /v1/calendar/events/:id 
    // TODO: Apply rate limiting
    calendarRouter.post('/availability', placeholderRateLimit, calendarController.getAvailability); // /v1/calendar/availability
    // TODO: Apply rate limiting
    calendarRouter.post('/schedule', placeholderRateLimit, calendarController.scheduleMeeting); // /v1/calendar/schedule
    // TODO: Apply rate limiting
    calendarRouter.post('/events/:id/accept', placeholderRateLimit, calendarController.acceptEvent);
    // TODO: Apply rate limiting
    calendarRouter.post('/events/:id/tentativelyAccept', placeholderRateLimit, calendarController.tentativelyAcceptEvent);
    // TODO: Apply rate limiting
    calendarRouter.post('/events/:id/decline', placeholderRateLimit, calendarController.declineEvent);
    // TODO: Apply rate limiting
    calendarRouter.post('/events/:id/cancel', placeholderRateLimit, calendarController.cancelEvent);
    // TODO: Apply rate limiting
    calendarRouter.post('/findMeetingTimes', placeholderRateLimit, calendarController.findMeetingTimes);
    calendarRouter.get('/rooms', calendarController.getRooms);
    calendarRouter.get('/calendars', calendarController.getCalendars);
    // TODO: Apply rate limiting
    calendarRouter.post('/events/:id/attachments', placeholderRateLimit, calendarController.addAttachment);
    calendarRouter.delete('/events/:id/attachments/:attachmentId', calendarController.removeAttachment);
    v1.use('/calendar', calendarRouter);

    // --- Files Router --- 
    const filesRouter = express.Router();
    filesRouter.get('/', filesController.listFiles); // /v1/files
    // TODO: Apply rate limiting
    filesRouter.post('/upload', placeholderRateLimit, filesController.uploadFile); // /v1/files/upload
    filesRouter.get('/search', filesController.searchFiles);
    filesRouter.get('/metadata', filesController.getFileMetadata);
    filesRouter.get('/content', filesController.getFileContent);
    // TODO: Apply rate limiting
    filesRouter.post('/content', placeholderRateLimit, filesController.setFileContent);
    // TODO: Apply rate limiting
    filesRouter.post('/content/update', placeholderRateLimit, filesController.updateFileContent);
    filesRouter.get('/download', filesController.downloadFile);
    // TODO: Apply rate limiting
    filesRouter.post('/share', placeholderRateLimit, filesController.createSharingLink);
    filesRouter.get('/sharing', filesController.getSharingLinks);
    // TODO: Apply rate limiting
    filesRouter.post('/sharing/remove', placeholderRateLimit, filesController.removeSharingPermission);
    v1.use('/files', filesRouter);

    // --- People Router --- 
    const peopleRouter = express.Router();
    peopleRouter.get('/', peopleController.getRelevantPeople); // /v1/people
    peopleRouter.get('/search', peopleController.searchPeople);
    peopleRouter.get('/find', peopleController.findPeople);
    peopleRouter.get('/:id', peopleController.getPersonById); // /v1/people/:id
    v1.use('/people', peopleRouter);

    // --- Log Router --- (No Auth required for logs)
    const logRouter = express.Router();
    // TODO: Apply rate limiting
    logRouter.post('/', placeholderRateLimit, logController.addLogEntry); // /v1/logs
    logRouter.get('/', logController.getLogEntries); // /v1/logs
    // TODO: Apply rate limiting
    logRouter.post('/clear', placeholderRateLimit, logController.clearLogEntries); // /v1/logs/clear
    v1.use('/logs', logRouter); // Mounted at /v1/logs

    // Mount v1 under /v1 path
    router.use('/v1', v1);
}

module.exports = { registerRoutes };
