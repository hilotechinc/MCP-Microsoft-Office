/**
 * @fileoverview Integration test for backend module interaction (mail + calendar).
 * Scenario: Calls both mail and calendar endpoints, checks responses and isolation.
 * Auth is not fully mocked yet, so expects 401 for now.
 */

const request = require('supertest');
const { startServer, stopServer } = require('../../src/main/server');

let server;

describe('Module Interaction Integration', () => {
    beforeAll(async () => {
        server = await startServer(4003); // Use a test port
    });
    afterAll(async () => {
        await stopServer();
    });

    describe('GET /api/v1/mail and /api/v1/calendar', () => {
        it('should 401 for mail (no token)', async () => {
            const res = await request(server).get('/api/v1/mail');
            expect(res.statusCode).toBe(401);
        });
        it('should 401 for calendar (no token)', async () => {
            const res = await request(server).get('/api/v1/calendar');
            expect(res.statusCode).toBe(401);
        });
        // TODO: When valid token mocking is in place, test real module interaction
    });
});
