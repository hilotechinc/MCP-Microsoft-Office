const calendarModule = require('../../../src/modules/calendar');

describe('Calendar Module', () => {
    const mockGraphService = {
        getEvents: jest.fn(async (range) => [
            { id: '1', subject: 'A', start: { dateTime: '2025-01-01T09:00:00Z' }, end: { dateTime: '2025-01-01T10:00:00Z' } }
        ]),
        createEvent: jest.fn(async (event) => ({ id: '2', ...event })),
        updateEvent: jest.fn(async (id, updates) => ({ id, ...updates })),
        getAvailability: jest.fn(async (users, timeRange) => ({ users, timeRange, available: true }))
    };
    const mockCacheService = {
        get: jest.fn(async () => undefined),
        set: jest.fn(async () => {})
    };
    const mockEventService = {
        findBestSlot: jest.fn(async (attendees, preferredTimes) => ({ start: '2025-01-01T11:00:00Z', end: '2025-01-01T12:00:00Z' }))
    };
    let mod;
    beforeEach(() => {
        mod = calendarModule.init({ graphService: mockGraphService, cacheService: mockCacheService, eventService: mockEventService });
    });
    it('handles getEvents intent', async () => {
        const res = await mod.handleIntent('getEvents', { range: { start: '2025-01-01', end: '2025-01-02' } }, {});
        expect(res).toHaveProperty('type', 'calendarList');
        expect(Array.isArray(res.items)).toBe(true);
        expect(res.items[0]).toHaveProperty('id', '1');
    });
    it('handles createEvent intent', async () => {
        const res = await mod.handleIntent('createEvent', { event: { subject: 'Meeting' } }, {});
        expect(res).toHaveProperty('type', 'calendarEvent');
        expect(res.event).toHaveProperty('id', '2');
    });
    it('handles updateEvent intent', async () => {
        const res = await mod.handleIntent('updateEvent', { eventId: '2', updates: { subject: 'Updated' } }, {});
        expect(res).toHaveProperty('type', 'calendarEvent');
        expect(res.event).toHaveProperty('id', '2');
        expect(res.event).toHaveProperty('subject', 'Updated');
    });
    it('handles getAvailability intent', async () => {
        const res = await mod.handleIntent('getAvailability', { users: ['a'], timeRange: {} }, {});
        expect(res).toHaveProperty('type', 'availability');
        expect(res.data).toHaveProperty('available', true);
    });
    it('handles scheduleMeeting intent', async () => {
        const res = await mod.handleIntent('scheduleMeeting', { attendees: ['a'], preferredTimes: [] }, {});
        expect(res).toHaveProperty('type', 'calendarEvent');
        expect(res).toHaveProperty('slot');
        expect(res.slot).toHaveProperty('start');
    });
    it('throws on unknown intent', async () => {
        await expect(mod.handleIntent('unknownIntent')).rejects.toThrow(/cannot handle intent/);
    });
});
