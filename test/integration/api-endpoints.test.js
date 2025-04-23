/**
 * @fileoverview Integration tests for MCP backend API endpoints.
 * Focus: Express API endpoints (auth, mail, calendar, files, etc)
 */

const request = require('supertest');
const { startServer, stopServer } = require('../../src/main/server');

let server;

describe('API Integration', () => {
    beforeAll(async () => {
        server = await startServer(4001); // Use a test port
    });
    afterAll(async () => {
        await stopServer();
    });

    describe('GET /api/health', () => {
        it('should return status ok', async () => {
            const res = await request(server).get('/api/health');
            expect(res.statusCode).toBe(200);
            expect(res.body).toHaveProperty('status', 'ok');
        });
    });

    // TODO: Add more endpoint tests (auth, mail, calendar, etc)
});
