/**
 * @fileoverview MCP Calendar Module - Handles calendar-related intents and actions for MCP.
 * Exposes: id, name, capabilities, init, handleIntent. Aligned with MCP module system and phase1_architecture.md.
 */

const { normalizeEvent } = require('../../graph/normalizers.cjs');

const CALENDAR_CAPABILITIES = [
    'getEvents',
    'createEvent',
    'updateEvent',
    'getAvailability',
    'scheduleMeeting'
];

const CalendarModule = {
    /**
     * Fetch raw calendar events from Graph for debugging (no normalization)
     * @param {object} options
     * @returns {Promise<object[]>}
     */
    async getEventsRaw(options = {}) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getEventsRaw !== 'function') {
            throw new Error('GraphService.getEventsRaw not implemented');
        }
        return await graphService.getEventsRaw(options);
    },
    
    /**
     * Fetch calendar events from Graph and normalize them
     * @param {object} options
     * @returns {Promise<object[]>}
     */
    async getEvents(options = {}) {
        const { graphService } = this.services || {};
        if (!graphService || typeof graphService.getEvents !== 'function') {
            throw new Error('GraphService.getEvents not implemented');
        }
        // Pass through all options including req to the graph service
        return await graphService.getEvents(options);
    },
    id: 'calendar',
    name: 'Outlook Calendar',
    capabilities: CALENDAR_CAPABILITIES,
    /**
     * Initializes the calendar module with dependencies.
     * @param {object} services - { graphService, cacheService, eventService }
     * @returns {object} Initialized module
     */
    init(services) {
        this.services = services;
        return this;
    },
    /**
     * Handles calendar-related intents routed to this module.
     * @param {string} intent
     * @param {object} entities
     * @param {object} context
     * @returns {Promise<object>} Normalized response
     */
    async handleIntent(intent, entities = {}, context = {}) {
        const { graphService, cacheService, eventService } = this.services || {};
        switch (intent) {
            case 'getEvents': {
                const range = entities.range || {};
                const cacheKey = `calendar:events:${JSON.stringify(range)}`;
                let events = cacheService && await cacheService.get(cacheKey);
                if (!events) {
                    const raw = await graphService.getEvents(range);
                    events = Array.isArray(raw) ? raw.map(normalizeEvent) : [];
                    if (cacheService) await cacheService.set(cacheKey, events, 60);
                }
                return { type: 'calendarList', items: events };
            }
            case 'createEvent': {
                const eventData = entities.event;
                const created = await graphService.createEvent(eventData);
                return { type: 'calendarEvent', event: normalizeEvent(created) };
            }
            case 'updateEvent': {
                const { eventId, updates } = entities;
                const updated = await graphService.updateEvent(eventId, updates);
                return { type: 'calendarEvent', event: normalizeEvent(updated) };
            }
            case 'getAvailability': {
                const { users, timeRange } = entities;
                const availability = await graphService.getAvailability(users, timeRange);
                return { type: 'availability', data: availability };
            }
            case 'scheduleMeeting': {
                // Scheduling intelligence (simplified)
                const { attendees, preferredTimes } = entities;
                if (!eventService) throw new Error('eventService required for scheduling');
                const slot = await eventService.findBestSlot(attendees, preferredTimes);
                if (!slot) throw new Error('No available slot found');
                const created = await graphService.createEvent({ ...entities.event, start: slot.start, end: slot.end });
                return { type: 'calendarEvent', event: normalizeEvent(created), slot };
            }
            default:
                throw new Error(`CalendarModule cannot handle intent: ${intent}`);
        }
    }
};

module.exports = CalendarModule;
