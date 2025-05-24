/**
 * @fileoverview MCP API endpoint for status dashboard.
 * Returns health/auth status for Microsoft Graph and LLM provider.
 */
const express = require('express');
const router = express.Router();
const msal = require('../auth/msal-service.cjs');
const llm = require('../llm/llm-service.cjs');
const MonitoringService = require('../core/monitoring-service.cjs');
const ErrorService = require('../core/error-service.cjs');

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
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.API,
            `Status check failed: ${err.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                stack: err.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        res.status(500).json({ error: 'Status check failed', details: err.message });
    }
});

// Simulated login endpoint for demo (replace with real MSAL logic)
// This endpoint should be accessible at /api/auth/login
router.post('/auth/login', async (req, res) => {
    try {
        await msal.login(req, res);
        MonitoringService.info('User logged in successfully', {
            timestamp: new Date().toISOString()
        }, 'auth');
    } catch (error) {
        const mcpError = ErrorService.createError(
            ErrorService.CATEGORIES.AUTH,
            `Login failed: ${error.message}`,
            ErrorService.SEVERITIES.ERROR,
            {
                stack: error.stack,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        res.status(500).json({ error: 'Login failed', message: error.message });
    }
});

module.exports = router;
