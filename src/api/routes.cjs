/**
 * @fileoverview Registers all API routes for MCP backend.
 * Exports a function to register endpoints on an Express router.
 */

const express = require('express');
const status = require('./status.cjs');

/**
 * Register all API endpoints on the given router.
 * @param {express.Router} router
 */
function registerRoutes(router) {
    // Status endpoints
    router.use('/status', status);
        // Microsoft login (redirect to Microsoft)
    router.get('/login', (req, res) => {
        const msal = require('../auth/msal-service.cjs');
        msal.login(req, res);
    });
    // Microsoft OAuth callback
    router.get('/auth/callback', (req, res) => {
        const msal = require('../auth/msal-service.cjs');
        msal.handleAuthCallback(req, res);
    });
    // Logout
    router.get('/logout', (req, res) => {
        const msal = require('../auth/msal-service.cjs');
        msal.logout(req, res);
    });
    // Add additional routes here as needed
}

module.exports = { registerRoutes };
