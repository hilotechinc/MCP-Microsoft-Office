/**
 * @fileoverview Initializes and provides all API dependencies (modules, services) for injection.
 * Ensures proper dependency injection for testability and modularity.
 */

const moduleRegistry = require('../modules/module-registry.cjs');
const MailModule = require('../modules/mail/index.cjs');
const CalendarModule = require('../modules/calendar/index.cjs');
const FilesModule = require('../modules/files/index.cjs');
const cacheService = require('../core/cache-service.cjs');
const eventService = require('../core/event-service.cjs');
const graphClientFactory = require('../graph/graph-client.cjs');
const calendarService = require('../graph/calendar-service.cjs');
const mailService = require('../graph/mail-service.cjs');
const filesService = require('../graph/files-service.cjs');

// Initialize modules with their dependencies
const mailModule = MailModule.init({ graphService: mailService, cacheService, eventService });
const calendarModule = CalendarModule.init({ graphService: calendarService, cacheService, eventService });
const filesModule = FilesModule.init({ graphService: filesService, cacheService });

// Register modules
moduleRegistry.registerModule(mailModule);
moduleRegistry.registerModule(calendarModule);
moduleRegistry.registerModule(filesModule);

// Simple mock NLU agent for development/testing
const nluAgent = {
  processQuery: async ({ query }) => {
    // Simple intent detection based on keywords
    let intent = 'unknown';
    let entities = {};
    
    if (query.toLowerCase().includes('email') || 
        query.toLowerCase().includes('mail')) {
      intent = 'readMail';
      entities = { count: 5 };
    } else if (query.toLowerCase().includes('calendar') || 
             query.toLowerCase().includes('event') || 
             query.toLowerCase().includes('meeting')) {
      intent = 'readCalendar';
      entities = { count: 3 };
    } else if (query.toLowerCase().includes('file') || 
             query.toLowerCase().includes('document')) {
      intent = 'listFiles';
      entities = {};
    }
    
    return {
      intent,
      entities,
      confidence: 0.85,
      query
    };
  }
};

// Simple mock context service for development/testing
const contextService = {
  context: {
    sessionId: 'mock-session',
    timestamp: new Date().toISOString()
  },
  updateContext: async (updates) => {
    Object.assign(contextService.context, updates);
    return contextService.context;
  },
  getCurrentContext: async () => {
    return contextService.context;
  }
};

// Simple mock error service if needed
const errorService = require('../core/error-service.cjs');

module.exports = {
  mailModule,
  calendarModule,
  filesModule,
  moduleRegistry,
  cacheService,
  eventService,
  graphClientFactory,
  calendarService,
  mailService,
  filesService,
  nluAgent,
  contextService,
  errorService
};
