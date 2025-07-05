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
    const startTime = Date.now();
    const { userId, deviceId } = req.user || {};
    const sessionId = req.session?.id;
    
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing status check request', {
                method: req.method,
                path: req.path,
                sessionId,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'status');
        }
        
        const msGraphStatus = await msal.isAuthenticated(req) ? 'green' : 'red';
        const llmStatus = await llm.isConfigured() ? 'green' : 'red';
        const msGraphDetails = await msal.statusDetails(req);
        
        const statusResponse = {
            msGraph: msGraphStatus,
            llm: llmStatus,
            details: {
                msGraph: msGraphDetails,
                llm: await llm.statusDetails()
            }
        };
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('Status check completed successfully', {
                msGraphStatus,
                llmStatus,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'status', null, userId);
        } else if (sessionId) {
            MonitoringService.info('Status check completed with session', {
                sessionId,
                msGraphStatus,
                llmStatus,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'status');
        }
        
        res.json(statusResponse);
        
    } catch (err) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'status',
            'Failed to retrieve system status',
            'error',
            {
                endpoint: '/api/status',
                error: err.message,
                stack: err.stack,
                operation: 'status_check',
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Status check failed', {
                error: err.message,
                operation: 'status_check',
                timestamp: new Date().toISOString()
            }, 'status', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Status check failed', {
                sessionId,
                error: err.message,
                operation: 'status_check',
                timestamp: new Date().toISOString()
            }, 'status');
        }
        
        res.status(500).json({ 
            error: 'STATUS_CHECK_FAILED',
            error_description: 'Unable to retrieve system status' 
        });
    }
});

// Simulated login endpoint for demo (replace with real MSAL logic)
// This endpoint should be accessible at /api/auth/login
router.post('/auth/login', async (req, res) => {
    const startTime = Date.now();
    const { userId, deviceId } = req.user || {};
    const sessionId = req.session?.id;
    
    try {
        // Pattern 1: Development Debug Logs
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Processing login request', {
                method: req.method,
                path: req.path,
                sessionId,
                userAgent: req.get('User-Agent'),
                timestamp: new Date().toISOString(),
                userId,
                deviceId
            }, 'auth');
        }
        
        await msal.login(req, res);
        
        // Pattern 2: User Activity Logs
        if (userId) {
            MonitoringService.info('User logged in successfully', {
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.info('User logged in with session', {
                sessionId,
                duration: Date.now() - startTime,
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
    } catch (error) {
        // Pattern 3: Infrastructure Error Logging
        const mcpError = ErrorService.createError(
            'auth',
            'Failed to authenticate user',
            'error',
            {
                endpoint: '/api/status/auth/login',
                error: error.message,
                stack: error.stack,
                operation: 'user_login',
                userId,
                deviceId,
                timestamp: new Date().toISOString()
            }
        );
        MonitoringService.logError(mcpError);
        
        // Pattern 4: User Error Tracking
        if (userId) {
            MonitoringService.error('Login failed', {
                error: error.message,
                operation: 'user_login',
                timestamp: new Date().toISOString()
            }, 'auth', null, userId);
        } else if (sessionId) {
            MonitoringService.error('Login failed', {
                sessionId,
                error: error.message,
                operation: 'user_login',
                timestamp: new Date().toISOString()
            }, 'auth');
        }
        
        res.status(500).json({ 
            error: 'LOGIN_FAILED',
            error_description: 'Authentication failed' 
        });
    }
});

module.exports = router;
