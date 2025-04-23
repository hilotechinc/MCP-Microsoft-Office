/**
 * @fileoverview Initializes and provides all API dependencies (modules, services) for injection.
 * Ensures proper dependency injection for testability and modularity.
 */

const moduleRegistry = require('../modules/module-registry');
const MailModule = require('../modules/mail');
const CalendarModule = require('../modules/calendar');
const FilesModule = require('../modules/files');
const cacheService = require('../core/cache-service');
const eventService = require('../core/event-service');
const graphService = require('../graph/graph-client');

// Initialize modules with their dependencies
const mailModule = MailModule.init({ graphService, cacheService, eventService });
const calendarModule = CalendarModule.init({ graphService, cacheService, eventService });
const filesModule = FilesModule.init({ graphService, cacheService });

// Register modules
moduleRegistry.registerModule(mailModule);
moduleRegistry.registerModule(calendarModule);
moduleRegistry.registerModule(filesModule);

module.exports = {
  mailModule,
  calendarModule,
  filesModule,
  moduleRegistry,
  cacheService,
  eventService,
  graphService
};
