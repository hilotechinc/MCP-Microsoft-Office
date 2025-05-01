/**
 * @fileoverview Initializes and provides all API dependencies (modules, services) for injection.
 * Ensures proper dependency injection for testability and modularity.
 */

const moduleRegistry = require('../modules/module-registry.cjs');
const MailModule = require('../modules/mail/index.cjs');
const CalendarModule = require('../modules/calendar/index.cjs');
const FilesModule = require('../modules/files/index.cjs');
const PeopleModule = require('../modules/people/index.cjs');
const cacheService = require('../core/cache-service.cjs');
const eventService = require('../core/event-service.cjs');
const graphClientFactory = require('../graph/graph-client.cjs');
const calendarService = require('../graph/calendar-service.cjs');
const mailService = require('../graph/mail-service.cjs');
const filesService = require('../graph/files-service.cjs');
const peopleService = require('../graph/people-service.cjs');

// Import error and monitoring services
const errorService = require('../core/error-service.cjs');
const monitoringService = require('../core/monitoring-service.cjs');

// Initialize modules with their dependencies
const mailModule = MailModule.init({ graphService: mailService, cacheService, eventService, errorService, monitoringService });
const calendarModule = CalendarModule.init({ graphService: calendarService, cacheService, eventService, errorService, monitoringService });
const filesModule = FilesModule.init({ graphService: filesService, cacheService });
const peopleModule = PeopleModule.init({ graphService: peopleService, cacheService });

// Register modules
moduleRegistry.registerModule(mailModule);
moduleRegistry.registerModule(calendarModule);
moduleRegistry.registerModule(filesModule);
moduleRegistry.registerModule(peopleModule);

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
    } else if (query.toLowerCase().includes('people') || 
             query.toLowerCase().includes('person') || 
             query.toLowerCase().includes('contact') || 
             query.toLowerCase().includes('find') || 
             query.toLowerCase().includes('who')) {
      // Extract name if present (simple extraction)
      const nameMatch = query.match(/\b(find|who is|about|contact)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\b/i);
      const name = nameMatch ? nameMatch[2] : '';
      
      intent = 'findPeople';
      entities = { 
        criteria: { 
          name: name,
          query: name || query,
          limit: 5
        } 
      };
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

// Tools service initialization
const createToolsService = require('../core/tools-service.cjs');

// Initialize tools service with module registry
const toolsService = createToolsService({ moduleRegistry });

module.exports = {
  mailModule,
  calendarModule,
  filesModule,
  peopleModule,
  moduleRegistry,
  cacheService,
  eventService,
  graphClientFactory,
  calendarService,
  mailService,
  filesService,
  peopleService,
  toolsService,
  nluAgent,
  contextService,
  errorService
};
