/**
 * @fileoverview Log controller for MCP API.
 * Handles logging from the adapter for UI display.
 */

const express = require('express');

// In-memory storage for log entries
let logEntries = [];
const MAX_LOG_ENTRIES = 100; // Limit the number of entries to prevent memory issues

/**
 * Add a log entry from the adapter
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function addLogEntry(req, res) {
    try {
        console.log('[LOG CONTROLLER] Received log entry request:', JSON.stringify(req.body).substring(0, 200));
        
        const logEntry = req.body;
        
        // Validate log entry
        if (!logEntry || !logEntry.source || !logEntry.endpoint) {
            console.error('[LOG CONTROLLER] Invalid log entry format:', JSON.stringify(logEntry));
            return res.status(400).json({ error: 'Invalid log entry format' });
        }
        
        // Add timestamp if not provided
        if (!logEntry.timestamp) {
            logEntry.timestamp = new Date().toISOString();
        }
        
        // Add to log entries (at the beginning for newest first)
        logEntries.unshift(logEntry);
        console.log(`[LOG CONTROLLER] Added log entry. Total entries: ${logEntries.length}`);
        
        // Trim log entries if needed
        if (logEntries.length > MAX_LOG_ENTRIES) {
            logEntries = logEntries.slice(0, MAX_LOG_ENTRIES);
        }
        
        // Broadcast to any connected WebSocket clients (if implemented)
        // This would be for real-time updates
        
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('[LOG CONTROLLER] Error adding log entry:', error);
        res.status(500).json({ error: 'Failed to add log entry' });
    }
}

/**
 * Get all log entries
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function getLogEntries(req, res) {
    try {
        console.log(`[LOG CONTROLLER] Getting log entries. Count: ${logEntries.length}`);
        res.status(200).json(logEntries);
    } catch (error) {
        console.error('[LOG CONTROLLER] Error getting log entries:', error);
        res.status(500).json({ error: 'Failed to get log entries' });
    }
}

/**
 * Clear all log entries
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function clearLogEntries(req, res) {
    try {
        logEntries = [];
        res.status(200).json({ success: true });
    } catch (error) {
        console.error('Error clearing log entries:', error);
        res.status(500).json({ error: 'Failed to clear log entries' });
    }
}

module.exports = {
    addLogEntry,
    getLogEntries,
    clearLogEntries
};
