/**
 * @fileoverview CalendarService - Microsoft Graph Calendar API operations.
 * All methods are async, modular, and use GraphClient for requests.
 * Follows project error handling, validation, and normalization rules.
 */

const graphClientFactory = require('./graph-client');

function normalizeEvent(graphEvent) {
  return {
    id: graphEvent.id,
    subject: graphEvent.subject,
    start: graphEvent.start,
    end: graphEvent.end,
    attendees: (graphEvent.attendees || []).map(a => ({
      name: a.emailAddress?.name,
      email: a.emailAddress?.address,
      status: a.status?.response
    })),
    organizer: {
      name: graphEvent.organizer?.emailAddress?.name,
      email: graphEvent.organizer?.emailAddress?.address
    },
    isAllDay: !!graphEvent.isAllDay,
    recurrence: graphEvent.recurrence || null
  };
}

/**
 * Retrieves calendar events within a date range.
 * @param {object} options { start, end }
 * @returns {Promise<Array<object>>}
 */
async function getEvents(options = {}) {
  const client = await graphClientFactory.createClient();
  const { start, end } = options;
  const filter = start && end ? `?$filter=start/dateTime ge '${start}T00:00:00' and end/dateTime le '${end}T23:59:59'` : '';
  const res = await client.api(`/me/events${filter}`).get();
  return (res.value || []).map(normalizeEvent);
}

/**
 * Creates a new calendar event.
 * @param {object} eventData
 * @returns {Promise<object>}
 */
async function createEvent(eventData) {
  const client = await graphClientFactory.createClient();
  const event = {
    subject: eventData.subject,
    start: { dateTime: eventData.start, timeZone: 'UTC' },
    end: { dateTime: eventData.end, timeZone: 'UTC' },
    attendees: (eventData.attendees || []).map(email => ({ emailAddress: { address: email } })),
    recurrence: eventData.recurrence || undefined
  };
  return await client.api('/me/events').post(event);
}

/**
 * Updates an event.
 * @param {string} id
 * @param {object} updateData
 * @returns {Promise<object>}
 */
async function updateEvent(id, updateData) {
  const client = await graphClientFactory.createClient();
  return await client.api(`/me/events/${id}`).patch(updateData);
}

/**
 * Gets availability for a list of users.
 * @param {Array<string>} emails
 * @param {string} start
 * @param {string} end
 * @returns {Promise<Array<object>>}
 */
async function getAvailability(emails, start, end) {
  const client = await graphClientFactory.createClient();
  const body = {
    schedules: emails,
    startTime: { dateTime: start, timeZone: 'UTC' },
    endTime: { dateTime: end, timeZone: 'UTC' },
    availabilityViewInterval: 30
  };
  const res = await client.api('/me/calendar/getSchedule').post(body);
  return res.value || [];
}

module.exports = {
  getEvents,
  createEvent,
  updateEvent,
  getAvailability
};
