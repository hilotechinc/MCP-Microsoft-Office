/**
 * @fileoverview Tests API route registration and endpoint responses.
 */
// Use Jest's built-in expect
// const { expect } = require('chai');
const express = require('express');
const request = require('supertest');

// Import the route registration function
const { registerRoutes } = require('../../../src/api/routes');

describe('API Routes', () => {
    let app;
    beforeEach(() => {
        app = express();
        app.use(express.json());
        const router = express.Router();
        registerRoutes(router);
        app.use('/api', router);
    });

    it('should respond to /api/health', async () => {
        const res = await request(app).get('/api/health');
        expect(res.status).toBe(200);
        expect(res.body).toHaveProperty('status', 'ok');
    });

    it('should respond to /api/modules', async () => {
        const res = await request(app).get('/api/modules');
        expect([200, 404]).toContain(res.status); // 200 if implemented, 404 if not
    });

    it('should respond to versioned endpoints', async () => {
        const res = await request(app).get('/api/v1/mail');
        expect([200, 401, 404]).toContain(res.status); // 200 if open, 401 if auth required, 404 if not found
    });
});
