/**
 * @fileoverview Backend E2E test: login (auth fail), query, mail, calendar flow.
 * Simulates a real user workflow across multiple endpoints.
 * Auth is not fully mocked yet, so expects 401s for now.
 */

const request = require('supertest');
const { startServer, stopServer } = require('../../src/main/server');

let server;

describe('Backend E2E Workflow', () => {
    beforeAll(async () => {
        server = await startServer(5001); // Use a test port
    });
    afterAll(async () => {
        await stopServer();
    });

    it('should 401 on login-protected endpoints (mail, calendar, query)', async () => {
        // Query endpoint
        let res = await request(server).post('/api/v1/query').send({ query: 'What is my next meeting?' });
        expect(res.statusCode).toBe(401);
        // Mail endpoint
        res = await request(server).get('/api/v1/mail');
        expect(res.statusCode).toBe(401);
        // Calendar endpoint
        res = await request(server).get('/api/v1/calendar');
        expect(res.statusCode).toBe(401);
    });

    // TODO: When valid token mocking is supported, chain real flows
});
