/**
 * @fileoverview GraphService - Provides a unified interface to Microsoft Graph API.
 * Wraps the graph client factory and exposes methods needed by modules.
 * Follows async/await patterns and proper error handling.
 */

const graphClientFactory = require('./graph-client.cjs');
const calendarService = require('./calendar-service.cjs');
const filesService = require('./files-service.cjs');
const mailService = require('./mail-service.cjs');
const peopleService = require('./people-service.cjs');
const ErrorService = require('../core/error-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');

/**
 * GraphService provides a unified interface to Microsoft Graph API
 * by wrapping individual service implementations.
 * 
 * This service acts as a facade over the individual Graph API service modules,
 * allowing modules to be initialized with a consistent interface while maintaining
 * the request-based authentication flow.
 */
class GraphService {
  constructor(userId, sessionId) {
    const startTime = new Date().toISOString();
    
    // Pattern 1: Development Debug Logs
    if (process.env.NODE_ENV === 'development') {
      MonitoringService.debug('GraphService constructor called', {
        sessionId: sessionId,
        timestamp: startTime
      }, 'graph');
    }
    
    // Pattern 2: User Activity Logs
    if (userId) {
      MonitoringService.info('Graph Service initialized', {
        timestamp: startTime
      }, 'graph', null, userId);
    } else if (sessionId) {
      MonitoringService.info('Graph Service initialized with session', {
        sessionId: sessionId,
        timestamp: startTime
      }, 'graph');
    }
  }

  /**
   * Initialize the service with dependencies
   * @param {Object} services - Service dependencies
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {GraphService} - The initialized service
   */
  init(services, userId, sessionId) {
    const startTime = new Date().toISOString();
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('GraphService init called', {
          sessionId: sessionId,
          servicesCount: Object.keys(services || {}).length,
          timestamp: startTime
        }, 'graph');
      }
      
      // Store services for potential future use
      this.services = services;
      
      // Pattern 2: User Activity Logs
      if (userId) {
        MonitoringService.info('Graph Service initialized with dependencies', {
          servicesCount: Object.keys(services || {}).length,
          timestamp: startTime
        }, 'graph', null, userId);
      } else if (sessionId) {
        MonitoringService.info('Graph Service initialized with session', {
          sessionId: sessionId,
          servicesCount: Object.keys(services || {}).length,
          timestamp: startTime
        }, 'graph');
      }
      
      return this;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'graph',
        'Failed to initialize Graph service',
        'error',
        {
          method: 'init',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (userId) {
        MonitoringService.error('Graph Service initialization failed', {
          error: error.message,
          timestamp: startTime
        }, 'graph', null, userId);
      } else if (sessionId) {
        MonitoringService.error('Graph Service initialization failed', {
          sessionId: sessionId,
          error: error.message,
          timestamp: startTime
        }, 'graph');
      }
      
      throw mcpError;
    }
  }

  /**
   * Helper method to create a graph client
   * @param {Object} req - Express request object containing authentication context
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<GraphClient>} - Authenticated Graph client
   */
  async createClient(req, userId, sessionId) {
    const startTime = new Date().toISOString();
    
    // Extract user context from request if not provided
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Creating Graph client', {
          sessionId: resolvedSessionId,
          userAgent: req?.get('User-Agent'),
          timestamp: startTime
        }, 'graph');
      }
      
      const client = await graphClientFactory.createClient(req, resolvedUserId, resolvedSessionId);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Graph client created successfully', {
          timestamp: startTime
        }, 'graph', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Graph client created with session', {
          sessionId: resolvedSessionId,
          timestamp: startTime
        }, 'graph');
      }
      
      return client;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'graph',
        'Failed to create Graph client',
        'error',
        {
          method: 'createClient',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Graph client creation failed', {
          error: error.message,
          timestamp: startTime
        }, 'graph', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Graph client creation failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'graph');
      }
      
      throw mcpError;
    }
  }

  // ===== Calendar Methods =====

  /**
   * Get calendar events
   * @param {Object} options - Query options
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Array>} - Normalized calendar events
   */
  async getEvents(options, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting calendar events', {
          sessionId: resolvedSessionId,
          optionsKeys: Object.keys(options || {}),
          timestamp: startTime
        }, 'calendar');
      }
      
      const events = await calendarService.getEvents(options, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Calendar events retrieved successfully', {
          eventCount: events?.length || 0,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Calendar events retrieved with session', {
          sessionId: resolvedSessionId,
          eventCount: events?.length || 0,
          timestamp: startTime
        }, 'calendar');
      }
      
      return events;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to retrieve calendar events',
        'error',
        {
          method: 'getEvents',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Calendar events retrieval failed', {
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Calendar events retrieval failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Create a calendar event
   * @param {Object} eventData - Event data
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Created event
   */
  async createEvent(eventData, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Creating calendar event', {
          sessionId: resolvedSessionId,
          eventSubject: eventData?.subject?.substring(0, 50) + '...',
          timestamp: startTime
        }, 'calendar');
      }
      
      const event = await calendarService.createEvent(eventData, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Calendar event created successfully', {
          eventId: event?.id,
          eventSubject: eventData?.subject,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Calendar event created with session', {
          sessionId: resolvedSessionId,
          eventId: event?.id,
          timestamp: startTime
        }, 'calendar');
      }
      
      return event;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to create calendar event',
        'error',
        {
          method: 'createEvent',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Calendar event creation failed', {
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Calendar event creation failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Update a calendar event
   * @param {String} eventId - Event ID
   * @param {Object} updates - Event updates
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Updated event
   */
  async updateEvent(eventId, updates, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Updating calendar event', {
          sessionId: resolvedSessionId,
          eventId: eventId?.substring(0, 20) + '...',
          updateKeys: Object.keys(updates || {}),
          timestamp: startTime
        }, 'calendar');
      }
      
      const event = await calendarService.updateEvent(eventId, updates, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Calendar event updated successfully', {
          eventId: eventId,
          updateCount: Object.keys(updates || {}).length,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Calendar event updated with session', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          timestamp: startTime
        }, 'calendar');
      }
      
      return event;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to update calendar event',
        'error',
        {
          method: 'updateEvent',
          eventId: eventId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Calendar event update failed', {
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Calendar event update failed', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Get user availability
   * @param {Object} options - Availability options
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Availability data
   */
  async getAvailability(options, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting user availability', {
          sessionId: resolvedSessionId,
          optionsKeys: Object.keys(options || {}),
          timestamp: startTime
        }, 'calendar');
      }
      
      const availability = await calendarService.getAvailability(options, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('User availability retrieved successfully', {
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('User availability retrieved with session', {
          sessionId: resolvedSessionId,
          timestamp: startTime
        }, 'calendar');
      }
      
      return availability;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to retrieve user availability',
        'error',
        {
          method: 'getAvailability',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('User availability retrieval failed', {
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('User availability retrieval failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Accept a calendar event
   * @param {String} eventId - Event ID
   * @param {String} comment - Optional comment
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Response status
   */
  async acceptEvent(eventId, comment, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Accepting calendar event', {
          sessionId: resolvedSessionId,
          eventId: eventId?.substring(0, 20) + '...',
          hasComment: !!comment,
          timestamp: startTime
        }, 'calendar');
      }
      
      const result = await calendarService.acceptEvent(eventId, comment, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Calendar event accepted successfully', {
          eventId: eventId,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Calendar event accepted with session', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          timestamp: startTime
        }, 'calendar');
      }
      
      return result;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to accept calendar event',
        'error',
        {
          method: 'acceptEvent',
          eventId: eventId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Calendar event acceptance failed', {
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Calendar event acceptance failed', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Tentatively accept a calendar event
   * @param {String} eventId - Event ID
   * @param {String} comment - Optional comment
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Response status
   */
  async tentativelyAcceptEvent(eventId, comment, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Tentatively accepting calendar event', {
          sessionId: resolvedSessionId,
          eventId: eventId?.substring(0, 20) + '...',
          hasComment: !!comment,
          timestamp: startTime
        }, 'calendar');
      }
      
      const result = await calendarService.tentativelyAcceptEvent(eventId, comment, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Calendar event tentatively accepted successfully', {
          eventId: eventId,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Calendar event tentatively accepted with session', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          timestamp: startTime
        }, 'calendar');
      }
      
      return result;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to tentatively accept calendar event',
        'error',
        {
          method: 'tentativelyAcceptEvent',
          eventId: eventId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Calendar event tentative acceptance failed', {
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Calendar event tentative acceptance failed', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Decline a calendar event
   * @param {String} eventId - Event ID
   * @param {String} comment - Optional comment
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Response status
   */
  async declineEvent(eventId, comment, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Declining calendar event', {
          sessionId: resolvedSessionId,
          eventId: eventId?.substring(0, 20) + '...',
          hasComment: !!comment,
          timestamp: startTime
        }, 'calendar');
      }
      
      const result = await calendarService.declineEvent(eventId, comment, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Calendar event declined successfully', {
          eventId: eventId,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Calendar event declined with session', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          timestamp: startTime
        }, 'calendar');
      }
      
      return result;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to decline calendar event',
        'error',
        {
          method: 'declineEvent',
          eventId: eventId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Calendar event decline failed', {
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Calendar event decline failed', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Cancel a calendar event
   * @param {String} eventId - Event ID
   * @param {String} comment - Optional comment
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Response status
   */
  async cancelEvent(eventId, comment, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Cancelling calendar event', {
          sessionId: resolvedSessionId,
          eventId: eventId?.substring(0, 20) + '...',
          hasComment: !!comment,
          timestamp: startTime
        }, 'calendar');
      }
      
      const result = await calendarService.cancelEvent(eventId, comment, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Calendar event cancelled successfully', {
          eventId: eventId,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Calendar event cancelled with session', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          timestamp: startTime
        }, 'calendar');
      }
      
      return result;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to cancel calendar event',
        'error',
        {
          method: 'cancelEvent',
          eventId: eventId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Calendar event cancellation failed', {
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Calendar event cancellation failed', {
          sessionId: resolvedSessionId,
          eventId: eventId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Find meeting times
   * @param {Object} options - Meeting options
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Meeting time suggestions
   */
  async findMeetingTimes(options, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Finding meeting times', {
          sessionId: resolvedSessionId,
          optionsKeys: Object.keys(options || {}),
          timestamp: startTime
        }, 'calendar');
      }
      
      const meetingTimes = await calendarService.findMeetingTimes(options, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Meeting times found successfully', {
          suggestionsCount: meetingTimes?.suggestions?.length || 0,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Meeting times found with session', {
          sessionId: resolvedSessionId,
          suggestionsCount: meetingTimes?.suggestions?.length || 0,
          timestamp: startTime
        }, 'calendar');
      }
      
      return meetingTimes;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to find meeting times',
        'error',
        {
          method: 'findMeetingTimes',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Meeting times search failed', {
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Meeting times search failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Get available rooms
   * @param {Object} options - Room options
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Array>} - Available rooms
   */
  async getRooms(options, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting available rooms', {
          sessionId: resolvedSessionId,
          optionsKeys: Object.keys(options || {}),
          timestamp: startTime
        }, 'calendar');
      }
      
      const rooms = await calendarService.getRooms(options, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Available rooms retrieved successfully', {
          roomCount: rooms?.length || 0,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Available rooms retrieved with session', {
          sessionId: resolvedSessionId,
          roomCount: rooms?.length || 0,
          timestamp: startTime
        }, 'calendar');
      }
      
      return rooms;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to retrieve available rooms',
        'error',
        {
          method: 'getRooms',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Available rooms retrieval failed', {
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Available rooms retrieval failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  /**
   * Get user calendars
   * @param {Object} options - Calendar options
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Array>} - User calendars
   */
  async getCalendars(options, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting user calendars', {
          sessionId: resolvedSessionId,
          optionsKeys: Object.keys(options || {}),
          timestamp: startTime
        }, 'calendar');
      }
      
      const calendars = await calendarService.getCalendars(options, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('User calendars retrieved successfully', {
          calendarCount: calendars?.length || 0,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('User calendars retrieved with session', {
          sessionId: resolvedSessionId,
          calendarCount: calendars?.length || 0,
          timestamp: startTime
        }, 'calendar');
      }
      
      return calendars;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'calendar',
        'Failed to retrieve user calendars',
        'error',
        {
          method: 'getCalendars',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('User calendars retrieval failed', {
          error: error.message,
          timestamp: startTime
        }, 'calendar', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('User calendars retrieval failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'calendar');
      }
      
      throw mcpError;
    }
  }

  // ===== Files Methods =====

  /**
   * List files in a folder
   * @param {String} parentId - Parent folder ID
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Array>} - Files in folder
   */
  async listFiles(parentId, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Listing files in folder', {
          sessionId: resolvedSessionId,
          parentId: parentId?.substring(0, 20) + '...',
          timestamp: startTime
        }, 'files');
      }
      
      const files = await filesService.listFiles(parentId, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Files listed successfully', {
          fileCount: files?.length || 0,
          parentId: parentId,
          timestamp: startTime
        }, 'files', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Files listed with session', {
          sessionId: resolvedSessionId,
          fileCount: files?.length || 0,
          timestamp: startTime
        }, 'files');
      }
      
      return files;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'files',
        'Failed to list files in folder',
        'error',
        {
          method: 'listFiles',
          parentId: parentId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Files listing failed', {
          parentId: parentId,
          error: error.message,
          timestamp: startTime
        }, 'files', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Files listing failed', {
          sessionId: resolvedSessionId,
          parentId: parentId,
          error: error.message,
          timestamp: startTime
        }, 'files');
      }
      
      throw mcpError;
    }
  }

  /**
   * Search for files
   * @param {String} query - Search query
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Array>} - Search results
   */
  async searchFiles(query, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Searching for files', {
          sessionId: resolvedSessionId,
          query: query?.substring(0, 50) + '...',
          timestamp: startTime
        }, 'files');
      }
      
      const files = await filesService.searchFiles(query, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Files search completed successfully', {
          resultCount: files?.length || 0,
          query: query,
          timestamp: startTime
        }, 'files', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Files search completed with session', {
          sessionId: resolvedSessionId,
          resultCount: files?.length || 0,
          timestamp: startTime
        }, 'files');
      }
      
      return files;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'files',
        'Failed to search for files',
        'error',
        {
          method: 'searchFiles',
          query: query,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Files search failed', {
          query: query,
          error: error.message,
          timestamp: startTime
        }, 'files', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Files search failed', {
          sessionId: resolvedSessionId,
          query: query,
          error: error.message,
          timestamp: startTime
        }, 'files');
      }
      
      throw mcpError;
    }
  }

  /**
   * Get file details
   * @param {String} fileId - File ID
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - File details
   */
  async getFileDetails(fileId, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting file details', {
          sessionId: resolvedSessionId,
          fileId: fileId?.substring(0, 20) + '...',
          timestamp: startTime
        }, 'files');
      }
      
      const fileDetails = await filesService.getFileDetails(fileId, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('File details retrieved successfully', {
          fileId: fileId,
          fileName: fileDetails?.name,
          timestamp: startTime
        }, 'files', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('File details retrieved with session', {
          sessionId: resolvedSessionId,
          fileId: fileId,
          timestamp: startTime
        }, 'files');
      }
      
      return fileDetails;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'files',
        'Failed to retrieve file details',
        'error',
        {
          method: 'getFileDetails',
          fileId: fileId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('File details retrieval failed', {
          fileId: fileId,
          error: error.message,
          timestamp: startTime
        }, 'files', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('File details retrieval failed', {
          sessionId: resolvedSessionId,
          fileId: fileId,
          error: error.message,
          timestamp: startTime
        }, 'files');
      }
      
      throw mcpError;
    }
  }

  /**
   * Download file content
   * @param {String} fileId - File ID
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Buffer>} - File content
   */
  async downloadFile(fileId, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Downloading file content', {
          sessionId: resolvedSessionId,
          fileId: fileId?.substring(0, 20) + '...',
          timestamp: startTime
        }, 'files');
      }
      
      const fileContent = await filesService.downloadFile(fileId, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('File downloaded successfully', {
          fileId: fileId,
          contentSize: fileContent?.length || 0,
          timestamp: startTime
        }, 'files', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('File downloaded with session', {
          sessionId: resolvedSessionId,
          fileId: fileId,
          contentSize: fileContent?.length || 0,
          timestamp: startTime
        }, 'files');
      }
      
      return fileContent;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'files',
        'Failed to download file content',
        'error',
        {
          method: 'downloadFile',
          fileId: fileId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('File download failed', {
          fileId: fileId,
          error: error.message,
          timestamp: startTime
        }, 'files', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('File download failed', {
          sessionId: resolvedSessionId,
          fileId: fileId,
          error: error.message,
          timestamp: startTime
        }, 'files');
      }
      
      throw mcpError;
    }
  }

  // ===== People Methods =====

  /**
   * Get relevant people
   * @param {Object} options - Query options
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Array>} - Relevant people
   */
  async getRelevantPeople(options, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting relevant people', {
          sessionId: resolvedSessionId,
          optionsKeys: Object.keys(options || {}),
          timestamp: startTime
        }, 'people');
      }
      
      const people = await peopleService.getRelevantPeople(options, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Relevant people retrieved successfully', {
          peopleCount: people?.length || 0,
          timestamp: startTime
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Relevant people retrieved with session', {
          sessionId: resolvedSessionId,
          peopleCount: people?.length || 0,
          timestamp: startTime
        }, 'people');
      }
      
      return people;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'people',
        'Failed to retrieve relevant people',
        'error',
        {
          method: 'getRelevantPeople',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Relevant people retrieval failed', {
          error: error.message,
          timestamp: startTime
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Relevant people retrieval failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'people');
      }
      
      throw mcpError;
    }
  }

  /**
   * Get person by ID
   * @param {String} personId - Person ID
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Person details
   */
  async getPersonById(personId, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting person by ID', {
          sessionId: resolvedSessionId,
          personId: personId?.substring(0, 20) + '...',
          timestamp: startTime
        }, 'people');
      }
      
      const person = await peopleService.getPersonById(personId, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Person retrieved successfully', {
          personId: personId,
          personName: person?.displayName,
          timestamp: startTime
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Person retrieved with session', {
          sessionId: resolvedSessionId,
          personId: personId,
          timestamp: startTime
        }, 'people');
      }
      
      return person;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'people',
        'Failed to retrieve person by ID',
        'error',
        {
          method: 'getPersonById',
          personId: personId,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Person retrieval failed', {
          personId: personId,
          error: error.message,
          timestamp: startTime
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Person retrieval failed', {
          sessionId: resolvedSessionId,
          personId: personId,
          error: error.message,
          timestamp: startTime
        }, 'people');
      }
      
      throw mcpError;
    }
  }

  /**
   * Search for people
   * @param {String} query - Search query
   * @param {Object} options - Search options
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Array>} - Search results
   */
  async searchPeople(query, options, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Searching for people', {
          sessionId: resolvedSessionId,
          query: query?.substring(0, 50) + '...',
          optionsKeys: Object.keys(options || {}),
          timestamp: startTime
        }, 'people');
      }
      
      const people = await peopleService.searchPeople(query, options, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('People search completed successfully', {
          resultCount: people?.length || 0,
          query: query,
          timestamp: startTime
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('People search completed with session', {
          sessionId: resolvedSessionId,
          resultCount: people?.length || 0,
          timestamp: startTime
        }, 'people');
      }
      
      return people;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'people',
        'Failed to search for people',
        'error',
        {
          method: 'searchPeople',
          query: query,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('People search failed', {
          query: query,
          error: error.message,
          timestamp: startTime
        }, 'people', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('People search failed', {
          sessionId: resolvedSessionId,
          query: query,
          error: error.message,
          timestamp: startTime
        }, 'people');
      }
      
      throw mcpError;
    }
  }

  // ===== Mail Methods =====

  /**
   * Get recent mail
   * @param {Object} options - Query options
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Array>} - Recent mail
   */
  async getRecentMail(options, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Getting recent mail', {
          sessionId: resolvedSessionId,
          optionsKeys: Object.keys(options || {}),
          timestamp: startTime
        }, 'mail');
      }
      
      const mail = await mailService.getRecentMail(options, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Recent mail retrieved successfully', {
          mailCount: mail?.length || 0,
          timestamp: startTime
        }, 'mail', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Recent mail retrieved with session', {
          sessionId: resolvedSessionId,
          mailCount: mail?.length || 0,
          timestamp: startTime
        }, 'mail');
      }
      
      return mail;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'mail',
        'Failed to retrieve recent mail',
        'error',
        {
          method: 'getRecentMail',
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Recent mail retrieval failed', {
          error: error.message,
          timestamp: startTime
        }, 'mail', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Recent mail retrieval failed', {
          sessionId: resolvedSessionId,
          error: error.message,
          timestamp: startTime
        }, 'mail');
      }
      
      throw mcpError;
    }
  }

  /**
   * Send mail
   * @param {Object} mailData - Mail data
   * @param {Object} req - Express request object
   * @param {String} userId - User ID for logging context
   * @param {String} sessionId - Session ID for logging context
   * @returns {Promise<Object>} - Send status
   */
  async sendMail(mailData, req, userId, sessionId) {
    const startTime = new Date().toISOString();
    const resolvedUserId = userId || req?.user?.userId;
    const resolvedSessionId = sessionId || req?.session?.id;
    
    try {
      // Pattern 1: Development Debug Logs
      if (process.env.NODE_ENV === 'development') {
        MonitoringService.debug('Sending mail', {
          sessionId: resolvedSessionId,
          subject: mailData?.subject?.substring(0, 50) + '...',
          recipientCount: mailData?.toRecipients?.length || 0,
          timestamp: startTime
        }, 'mail');
      }
      
      const result = await mailService.sendMail(mailData, req);
      
      // Pattern 2: User Activity Logs
      if (resolvedUserId) {
        MonitoringService.info('Mail sent successfully', {
          subject: mailData?.subject,
          recipientCount: mailData?.toRecipients?.length || 0,
          timestamp: startTime
        }, 'mail', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.info('Mail sent with session', {
          sessionId: resolvedSessionId,
          subject: mailData?.subject,
          timestamp: startTime
        }, 'mail');
      }
      
      return result;
      
    } catch (error) {
      // Pattern 3: Infrastructure Error Logging
      const mcpError = ErrorService.createError(
        'mail',
        'Failed to send mail',
        'error',
        {
          method: 'sendMail',
          subject: mailData?.subject,
          originalError: error.message,
          timestamp: startTime
        }
      );
      MonitoringService.logError(mcpError);
      
      // Pattern 4: User Error Tracking
      if (resolvedUserId) {
        MonitoringService.error('Mail sending failed', {
          subject: mailData?.subject,
          error: error.message,
          timestamp: startTime
        }, 'mail', null, resolvedUserId);
      } else if (resolvedSessionId) {
        MonitoringService.error('Mail sending failed', {
          sessionId: resolvedSessionId,
          subject: mailData?.subject,
          error: error.message,
          timestamp: startTime
        }, 'mail');
      }
      
      throw mcpError;
    }
  }
}

// Export a singleton instance
module.exports = new GraphService();
