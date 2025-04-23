/**
 * @fileoverview Tests Express server lifecycle and health endpoint.
 */
// Use Jest's built-in expect
// const { expect } = require('chai');
const axios = require('axios');
const http = require('http');
const express = require('express');

// Import server factory or main server logic for test (adjust import as needed)
const { startServer, stopServer } = require('../../../src/main/server');

let server;
const TEST_PORT = 3999;
const BASE_URL = `http://localhost:${TEST_PORT}`;

describe('Express Server', () => {
    afterEach(async () => {
        if (server && server.listening) {
            await stopServer(server);
        }
    });

    it('should start, respond to /api/health, and shut down cleanly', async () => {
        server = await startServer(TEST_PORT);
        expect(server.listening).toBe(true);

        // Health endpoint
        const response = await axios.get(`${BASE_URL}/api/health`);
        expect(response.status).toBe(200);
        expect(response.data).toHaveProperty('status', 'ok');

        await stopServer(server);
        expect(server.listening).toBe(false);
    });
});
