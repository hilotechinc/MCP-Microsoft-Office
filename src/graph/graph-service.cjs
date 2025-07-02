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
  constructor() {
    MonitoringService?.info('Graph Service initialized', {
      timestamp: new Date().toISOString()
    }, 'graph');
  }

  /**
   * Initialize the service with dependencies
   * @param {Object} services - Service dependencies
   * @returns {GraphService} - The initialized service
   */
  init(services) {
    // Store services for potential future use
    this.services = services;
    return this;
  }

  /**
   * Helper method to create a graph client
   * @param {Object} req - Express request object containing authentication context
   * @returns {Promise<GraphClient>} - Authenticated Graph client
   */
  async createClient(req) {
    try {
      return await graphClientFactory.createClient(req);
    } catch (error) {
      const mcpError = ErrorService.createError(
        'graph',
        'Failed to create Graph client',
        'error',
        {
          method: 'createClient',
          originalError: error.message,
          timestamp: new Date().toISOString()
        }
      );
      MonitoringService?.logError(mcpError);
      throw mcpError;
    }
  }

  // ===== Calendar Methods =====

  /**
   * Get calendar events
   * @param {Object} options - Query options
   * @param {Object} req - Express request object
   * @returns {Promise<Array>} - Normalized calendar events
   */
  async getEvents(options, req) {
    return calendarService.getEvents(options, req);
  }

  /**
   * Create a calendar event
   * @param {Object} eventData - Event data
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Created event
   */
  async createEvent(eventData, req) {
    return calendarService.createEvent(eventData, req);
  }

  /**
   * Update a calendar event
   * @param {String} eventId - Event ID
   * @param {Object} updates - Event updates
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Updated event
   */
  async updateEvent(eventId, updates, req) {
    return calendarService.updateEvent(eventId, updates, req);
  }

  /**
   * Get user availability
   * @param {Object} options - Availability options
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Availability data
   */
  async getAvailability(options, req) {
    return calendarService.getAvailability(options, req);
  }

  /**
   * Accept a calendar event
   * @param {String} eventId - Event ID
   * @param {String} comment - Optional comment
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Response status
   */
  async acceptEvent(eventId, comment, req) {
    return calendarService.acceptEvent(eventId, comment, req);
  }

  /**
   * Tentatively accept a calendar event
   * @param {String} eventId - Event ID
   * @param {String} comment - Optional comment
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Response status
   */
  async tentativelyAcceptEvent(eventId, comment, req) {
    return calendarService.tentativelyAcceptEvent(eventId, comment, req);
  }

  /**
   * Decline a calendar event
   * @param {String} eventId - Event ID
   * @param {String} comment - Optional comment
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Response status
   */
  async declineEvent(eventId, comment, req) {
    return calendarService.declineEvent(eventId, comment, req);
  }

  /**
   * Cancel a calendar event
   * @param {String} eventId - Event ID
   * @param {String} comment - Optional comment
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Response status
   */
  async cancelEvent(eventId, comment, req) {
    return calendarService.cancelEvent(eventId, comment, req);
  }

  /**
   * Find meeting times
   * @param {Object} options - Meeting options
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Meeting time suggestions
   */
  async findMeetingTimes(options, req) {
    return calendarService.findMeetingTimes(options, req);
  }

  /**
   * Get available rooms
   * @param {Object} options - Room options
   * @param {Object} req - Express request object
   * @returns {Promise<Array>} - Available rooms
   */
  async getRooms(options, req) {
    return calendarService.getRooms(options, req);
  }

  /**
   * Get user calendars
   * @param {Object} options - Calendar options
   * @param {Object} req - Express request object
   * @returns {Promise<Array>} - User calendars
   */
  async getCalendars(options, req) {
    return calendarService.getCalendars(options, req);
  }

  // ===== Files Methods =====

  /**
   * List files in a folder
   * @param {String} parentId - Parent folder ID
   * @param {Object} req - Express request object
   * @returns {Promise<Array>} - Files in folder
   */
  async listFiles(parentId, req) {
    return filesService.listFiles(parentId, req);
  }

  /**
   * Search for files
   * @param {String} query - Search query
   * @param {Object} req - Express request object
   * @returns {Promise<Array>} - Search results
   */
  async searchFiles(query, req) {
    return filesService.searchFiles(query, req);
  }

  /**
   * Get file details
   * @param {String} fileId - File ID
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - File details
   */
  async getFileDetails(fileId, req) {
    return filesService.getFileDetails(fileId, req);
  }

  /**
   * Download file content
   * @param {String} fileId - File ID
   * @param {Object} req - Express request object
   * @returns {Promise<Buffer>} - File content
   */
  async downloadFile(fileId, req) {
    return filesService.downloadFile(fileId, req);
  }

  // ===== People Methods =====

  /**
   * Get relevant people
   * @param {Object} options - Query options
   * @param {Object} req - Express request object
   * @returns {Promise<Array>} - Relevant people
   */
  async getRelevantPeople(options, req) {
    return peopleService.getRelevantPeople(options, req);
  }

  /**
   * Get person by ID
   * @param {String} personId - Person ID
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Person details
   */
  async getPersonById(personId, req) {
    return peopleService.getPersonById(personId, req);
  }

  /**
   * Search for people
   * @param {String} query - Search query
   * @param {Object} options - Search options
   * @param {Object} req - Express request object
   * @returns {Promise<Array>} - Search results
   */
  async searchPeople(query, options, req) {
    return peopleService.searchPeople(query, options, req);
  }

  // ===== Mail Methods =====

  /**
   * Get recent mail
   * @param {Object} options - Query options
   * @param {Object} req - Express request object
   * @returns {Promise<Array>} - Recent mail
   */
  async getRecentMail(options, req) {
    return mailService.getRecentMail(options, req);
  }

  /**
   * Send mail
   * @param {Object} mailData - Mail data
   * @param {Object} req - Express request object
   * @returns {Promise<Object>} - Send status
   */
  async sendMail(mailData, req) {
    return mailService.sendMail(mailData, req);
  }
}

// Export a singleton instance
module.exports = new GraphService();
