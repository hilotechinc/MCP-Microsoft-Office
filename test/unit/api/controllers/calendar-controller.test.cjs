/**
 * @fileoverview Unit tests for calendar-controller (dependency-injected).
 */
// Use Jest's built-in expect
// const { expect } = require('chai');
// Using Jest's built-in mocking instead of sinon
const httpMocks = require('node-mocks-http');
const calendarControllerFactory = require('../../../../src/api/controllers/calendar-controller');

function mockDeps(overrides = {}) {
    return {
        calendarModule: {
            getEvents: jest.fn().mockResolvedValue([{ id: '1', subject: 'Event' }]),
            createEvent: jest.fn().mockResolvedValue({ created: true })
        },
        ...overrides
    };
}

describe('calendar-controller', () => {
    it('should call getEvents and return events', async () => {
        const deps = mockDeps();
        const { getEvents } = calendarControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'GET', query: {} });
        const res = httpMocks.createResponse();
        await getEvents(req, res);
        expect(deps.calendarModule.getEvents).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(Array.isArray(res._getJSONData())).toBe(true);
    });

    it('should validate createEvent input and return 400 on invalid', async () => {
        const deps = mockDeps();
        const { createEvent } = calendarControllerFactory(deps);
        const req = httpMocks.createRequest({ method: 'POST', body: { subject: '', start: {}, end: {} } });
        const res = httpMocks.createResponse();
        await createEvent(req, res);
        expect(res.statusCode).toBe(400);
        expect(res._getJSONData()).toHaveProperty('error');
    });

    it('should call createEvent and return result on valid input', async () => {
        const deps = mockDeps();
        const { createEvent } = calendarControllerFactory(deps);
        const req = httpMocks.createRequest({
            method: 'POST',
            body: {
                subject: 'Meeting',
                start: { dateTime: '2025-04-23T10:00:00Z', timeZone: 'UTC' },
                end: { dateTime: '2025-04-23T11:00:00Z', timeZone: 'UTC' }
            }
        });
        const res = httpMocks.createResponse();
        await createEvent(req, res);
        expect(deps.calendarModule.createEvent).toHaveBeenCalledTimes(1);
        expect(res.statusCode).toBe(200);
        expect(res._getJSONData()).toHaveProperty('created');
    });

    it('should handle internal errors and return 500', async () => {
        const deps = mockDeps({ calendarModule: { createEvent: jest.fn().mockRejectedValue(new Error('fail')) } });
        const { createEvent } = calendarControllerFactory(deps);
        const req = httpMocks.createRequest({
            method: 'POST',
            body: {
                subject: 'Meeting',
                start: { dateTime: '2025-04-23T10:00:00Z', timeZone: 'UTC' },
                end: { dateTime: '2025-04-23T11:00:00Z', timeZone: 'UTC' }
            }
        });
        const res = httpMocks.createResponse();
        await createEvent(req, res);
        expect(res.statusCode).toBe(500);
        expect(res._getJSONData()).toHaveProperty('error');
    });
});
