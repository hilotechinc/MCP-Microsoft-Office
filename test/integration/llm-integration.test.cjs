/**
 * @fileoverview Integration test for backend LLM (NLU) query endpoint.
 * Scenario: POST /api/v1/query with/without auth.
 * Auth is not fully mocked yet, so expects 401 for now.
 */

const request = require('supertest');
const { startServer, stopServer } = require('../../src/main/server');

let server;

describe('LLM Integration', () => {
    beforeAll(async () => {
        server = await startServer(4004); // Use a test port
    });
    afterAll(async () => {
        await stopServer();
    });

    describe('POST /api/v1/query', () => {
        it('should 401 if no token', async () => {
            const res = await request(server)
                .post('/api/v1/query')
                .send({ query: 'What is my next meeting?' });
            expect(res.statusCode).toBe(401);
            expect(res.body).toHaveProperty('error', 'Missing auth token');
        });
        // TODO: When valid token mocking is in place, test real LLM/NLU flow
    });
});
