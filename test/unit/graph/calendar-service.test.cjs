const calendarService = require('../../../src/graph/calendar-service');
const graphClientFactory = require('../../../src/graph/graph-client');

jest.mock('../../../src/graph/graph-client');

const MOCK_EVENTS = [
  {
    id: '1',
    subject: 'Test Event',
    start: { dateTime: '2025-04-22T09:00:00', timeZone: 'UTC' },
    end: { dateTime: '2025-04-22T10:00:00', timeZone: 'UTC' },
    attendees: [
      { emailAddress: { name: 'Attendee', address: 'attendee@example.com' }, status: { response: 'accepted' } }
    ],
    organizer: { emailAddress: { name: 'Organizer', address: 'org@example.com' } },
    isAllDay: false
  }
];

describe('CalendarService', () => {
  let client;
  beforeEach(() => {
    client = {
      api: jest.fn().mockReturnThis(),
      get: jest.fn(),
      post: jest.fn(),
      patch: jest.fn()
    };
    graphClientFactory.createClient.mockResolvedValue(client);
  });

  it('should retrieve calendar events', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockResolvedValue({ value: MOCK_EVENTS }) });
    const events = await calendarService.getEvents({ start: '2025-04-22', end: '2025-04-23' });
    expect(Array.isArray(events)).toBe(true);
    expect(events[0]).toHaveProperty('id', '1');
    expect(events[0]).toHaveProperty('subject', 'Test Event');
    expect(events[0]).toHaveProperty('start');
    expect(events[0]).toHaveProperty('attendees');
  });

  it('should create a new event', async () => {
    client.api.mockReturnValue({ post: jest.fn().mockResolvedValue({ id: '2', subject: 'New Event' }) });
    const result = await calendarService.createEvent({ subject: 'New Event', start: '2025-04-22T11:00:00', end: '2025-04-22T12:00:00', attendees: [] });
    expect(result).toHaveProperty('id', '2');
    expect(result).toHaveProperty('subject', 'New Event');
  });

  it('should update an event', async () => {
    client.api.mockReturnValue({ patch: jest.fn().mockResolvedValue({ id: '1', subject: 'Updated Event' }) });
    const result = await calendarService.updateEvent('1', { subject: 'Updated Event' });
    expect(result.subject).toBe('Updated Event');
  });

  it('should check availability', async () => {
    client.api.mockReturnValue({ post: jest.fn().mockResolvedValue({ value: [{ scheduleId: 'user@example.com', availabilityView: '0001111' }] }) });
    const result = await calendarService.getAvailability(['user@example.com'], '2025-04-22T09:00:00', '2025-04-22T17:00:00');
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty('scheduleId', 'user@example.com');
  });

  it('should support recurring event creation', async () => {
    client.api.mockReturnValue({ post: jest.fn().mockResolvedValue({ id: '3', subject: 'Recurring Event' }) });
    const recurrence = {
      pattern: { type: 'daily', interval: 1 },
      range: { type: 'endDate', startDate: '2025-04-22', endDate: '2025-04-29' }
    };
    const result = await calendarService.createEvent({ subject: 'Recurring Event', start: '2025-04-22T09:00:00', end: '2025-04-22T10:00:00', attendees: [], recurrence });
    expect(result).toHaveProperty('id', '3');
  });

  it('should handle throttling errors gracefully', async () => {
    client.api.mockReturnValue({ get: jest.fn().mockRejectedValue(new Error('Graph API throttled (429)')) });
    await expect(calendarService.getEvents({ start: '2025-04-22', end: '2025-04-23' })).rejects.toThrow(/429/);
  });
});
