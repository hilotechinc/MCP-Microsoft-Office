/**
 * @fileoverview MCP API endpoint for status dashboard.
 * Returns health/auth status for Microsoft Graph and LLM provider.
 */
const express = require('express');
const router = express.Router();
const msal = require('../auth/msal-service');
const llm = require('../llm/llm-service');

/**
 * GET /api/status
 * Returns { msGraph: 'green'|'red', llm: 'green'|'red', details: {...} }
 */
router.get('/status', async (req, res) => {
    try {
        const msGraphStatus = await msal.isAuthenticated(req) ? 'green' : 'red';
        const llmStatus = await llm.isConfigured() ? 'green' : 'red';
        const msGraphDetails = await msal.statusDetails(req);
        if (msGraphStatus === 'red') {
            msGraphDetails.loginUrl = msal.getLoginUrl();
        }
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
router.post('/auth/login', msal.login);

module.exports = router;
