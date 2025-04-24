/**
 * @fileoverview MCP API endpoint for status dashboard.
 * Returns health/auth status for Microsoft Graph and LLM provider.
 */
const express = require('express');
const router = express.Router();
const msal = require('../auth/msal-service.cjs');
const llm = require('../llm/llm-service.cjs');

/**
 * GET /api/status
 * Returns { msGraph: 'green'|'red', llm: 'green'|'red', details: {...} }
 */
router.get('/', async (req, res) => {
    try {
        const msGraphStatus = await msal.isAuthenticated(req) ? 'green' : 'red';
        const llmStatus = await llm.isConfigured() ? 'green' : 'red';
        const msGraphDetails = await msal.statusDetails(req);
        res.json({
            msGraph: msGraphStatus,
            llm: llmStatus,
            details: {
                msGraph: msGraphDetails,
                llm: await llm.statusDetails()
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Status check failed', details: err.message });
    }
});

// Simulated login endpoint for demo (replace with real MSAL logic)
// This endpoint should be accessible at /api/auth/login
router.post('/auth/login', async (req, res) => {
    try {
        await msal.login(req, res);
        console.log('User logged in successfully');
    } catch (error) {
        console.error('Login failed:', error);
        res.status(500).json({ error: 'Login failed', message: error.message });
    }
});

module.exports = router;
