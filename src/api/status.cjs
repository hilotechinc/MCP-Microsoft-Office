/**
 * @fileoverview Status endpoint for MCP API backend.
 * Reports authentication and connection status for Microsoft Graph and LLM APIs.
 */

const express = require('express');
const msal = require('../auth/msal-service.cjs');
const llm = require('../llm/llm-service.cjs');

const router = express.Router();

router.get('/', async (req, res) => {
    try {
        const msGraphStatus = await msal.isAuthenticated(req) ? 'green' : 'red';
        const llmStatus = await llm.isConfigured() ? 'green' : 'red';
        res.json({
            msGraph: msGraphStatus,
            llm: llmStatus,
            details: {
                msGraph: await msal.statusDetails(req),
                llm: await llm.statusDetails()
            }
        });
    } catch (err) {
        res.status(500).json({ error: 'Failed to fetch status', details: err.message });
    }
});

module.exports = router;
