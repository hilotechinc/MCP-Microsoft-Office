/**
 * @fileoverview MCP Adapter for Claude Desktop (Model Context Protocol)
 *
 * This script implements the MCP JSON-RPC protocol over stdio, acting as a bridge between Claude and the MCP HTTP API.
 * It receives JSON-RPC requests from Claude, translates them to HTTP requests to the local API, and returns the results.
 * Logs are sent to stderr only, never stdout.
 */

const { spawn } = require('child_process');
const fetch = require('node-fetch');
const readline = require('readline');
const fs = require('fs');

const API_BASE = 'http://localhost:3000/api/v1';

function isJsonRpcMessage(obj) {
    return obj && typeof obj === 'object' && typeof obj.jsonrpc === 'string' && (obj.method || obj.result || obj.error);
}

function logProtocol(msg) {
    // Write protocol messages to stdout, one per line
    process.stdout.write(JSON.stringify(msg) + '\n');
}

function logToFile(message, ...args) {
    // Protocol messages must NOT go through this logger
    if (isJsonRpcMessage(message)) {
        logProtocol(message);
        return;
    }
    // Human logs go to stderr
    const ts = new Date().toISOString();
    if (args.length === 0) {
        process.stderr.write(`[${ts}] ${message}\n`);
    } else {
        const safeArgs = args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg)));
        process.stderr.write(`[${ts}] ${message} ${safeArgs.join(' ')}\n`);
    }
}

// Helper: send JSON-RPC response
function sendResponse(id, result, error) {
    // Only include 'result' on success, 'error' on failure, never both
    const msg = { jsonrpc: '2.0', id };
    if (error) {
        msg.error = {
            code: error.code || -32000,
            message: error.message || String(error),
            data: error.data || undefined
        };
    } else {
        msg.result = result;
    }
    process.stdout.write(JSON.stringify(msg) + '\n');
}

// Helper: handle incoming JSON-RPC requests
async function handleRequest(req) {
    const { id, method, params } = req;
    // Debug: log every request to stderr and file
    console.error(`[MCP Adapter] Received: ${method}`, params);
    logToFile('Received:', method, params);
    try {
        let result;
        switch (method) {
            case 'tools/invoke': {
                if (!params || !params.name) {
                    sendResponse(id, null, { code: -32602, message: 'Missing tool name in params' });
                    return;
                }
                const toolName = params.name;
                const toolArgs = params.arguments || {};
                let toolResult;
                try {
                    switch (toolName) {
                        case 'query':
                            toolResult = await http('POST', '/query', toolArgs);
                            break;
                        case 'getMail':
                            toolResult = await http('GET', '/mail', toolArgs);
                            break;
                        case 'sendMail':
                            toolResult = await http('POST', '/mail/send', toolArgs);
                            break;
                        case 'getCalendar':
                            toolResult = await http('GET', '/calendar', toolArgs);
                            break;
                        case 'createEvent':
                            toolResult = await http('POST', '/calendar/create', toolArgs);
                            break;
                        case 'listFiles':
                            toolResult = await http('GET', '/files', toolArgs);
                            break;
                        case 'uploadFile':
                            toolResult = await http('POST', '/files/upload', toolArgs);
                            break;
                        default:
                            sendResponse(id, null, { code: -32601, message: 'Unknown tool: ' + toolName });
                            return;
                    }
                    sendResponse(id, toolResult, null);
                } catch (err) {
                    sendResponse(id, null, { message: err.message });
                    console.error('[MCP Adapter] Error in tools/invoke:', err);
                }
                return;
            }
            case 'initialize':
                // Standard MCP handshake with protocolVersion, capabilities
                result = {
                    protocolVersion: (params && params.protocolVersion) ? params.protocolVersion : "2024-11-05",
                    capabilities: {
                        toolInvocation: true,
                        manifest: true
                    },
                    serverInfo: {
                        name: "MCP Microsoft 365 Gateway",
                        version: "1.0.0"
                    }
                };
                sendResponse(id, result, null);
                logToFile('Responded:', method, { id, result });
                console.error("[MCP Adapter] Responded to initialize with protocolVersion:", result.protocolVersion);
                return;
            case 'getManifest':
                // Return manifest describing all available tools with descriptions and parameter schemas
                result = {
                    name: "MCP Microsoft 365 Gateway",
                    description: "Access your Microsoft 365 mail, calendar, and files via Claude.",
                    tools: [
                        {
                            name: 'query',
                            description: 'Submit a natural language query to Microsoft 365 (mail, calendar, files).',
                            parameters: {
                                type: 'object',
                                properties: {
                                    query: { type: 'string', description: 'The user\'s natural language question.' },
                                    context: { type: 'object', description: 'Conversation context.', optional: true }
                                },
                                required: ['query']
                            }
                        },
                        {
                            name: 'getMail',
                            description: 'Fetch mail from Microsoft 365 inbox.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    limit: { type: 'number', description: 'Number of messages to fetch.', optional: true },
                                    filter: { type: 'string', description: 'Filter string.', optional: true }
                                }
                            }
                        },
                        {
                            name: 'sendMail',
                            description: 'Send an email via Microsoft 365.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    to: { type: 'string', description: 'Recipient email(s), comma-separated or as array.' },
                                    subject: { type: 'string', description: 'Email subject.' },
                                    body: { type: 'string', description: 'Email body.' }
                                },
                                required: ['to', 'subject', 'body']
                            }
                        },
                        {
                            name: 'getCalendar',
                            description: 'Fetch calendar events from Microsoft 365.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    limit: { type: 'number', description: 'Number of events to fetch.', optional: true },
                                    filter: { type: 'string', description: 'Filter string.', optional: true }
                                }
                            }
                        },
                        {
                            name: 'createEvent',
                            description: 'Create a calendar event in Microsoft 365.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    subject: { type: 'string', description: 'Event subject.' },
                                    start: { type: 'object', description: 'Start time (ISO 8601, with timeZone).' },
                                    end: { type: 'object', description: 'End time (ISO 8601, with timeZone).' }
                                },
                                required: ['subject', 'start', 'end']
                            }
                        },
                        {
                            name: 'listFiles',
                            description: 'List files in OneDrive/SharePoint.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    parentId: { type: 'string', description: 'Parent folder ID.', optional: true }
                                }
                            }
                        },
                        {
                            name: 'uploadFile',
                            description: 'Upload a file to OneDrive/SharePoint.',
                            parameters: {
                                type: 'object',
                                properties: {
                                    name: { type: 'string', description: 'File name.' },
                                    content: { type: 'string', description: 'File content (base64 or plain text).' }
                                },
                                required: ['name', 'content']
                            }
                        }
                    ]
                };
                sendResponse(id, result, null);
                console.error('[MCP Adapter] Responded to getManifest');
                return;
            case 'shutdown':
                sendResponse(id, { ok: true }, null);
                process.exit(0);
                return;
            case 'query':
                result = await http('POST', '/query', params);
                break;
            case 'getMail':
                result = await http('GET', '/mail', params);
                break;
            case 'sendMail':
                result = await http('POST', '/mail/send', params);
                break;
            case 'getCalendar':
                result = await http('GET', '/calendar', params);
                break;
            case 'createEvent':
                result = await http('POST', '/calendar/create', params);
                break;
            case 'listFiles':
                result = await http('GET', '/files', params);
                break;
            case 'uploadFile':
                result = await http('POST', '/files/upload', params);
                break;
            case 'tools/list':
                // MCP/Claude expects this; return available tools as an object
                sendResponse(id, { tools: [
                    { name: 'query' },
                    { name: 'getMail' },
                    { name: 'sendMail' },
                    { name: 'getCalendar' },
                    { name: 'createEvent' },
                    { name: 'listFiles' },
                    { name: 'uploadFile' }
                ] }, null);
                logToFile('Responded:', method, { id, result: { tools: [
                    { name: 'query' },
                    { name: 'getMail' },
                    { name: 'sendMail' },
                    { name: 'getCalendar' },
                    { name: 'createEvent' },
                    { name: 'listFiles' },
                    { name: 'uploadFile' }
                ] } });
                console.error('[MCP Adapter] Responded to tools/list');
                return;
            case 'resources/list':
                // MCP/Claude expects this; return resources as an object
                sendResponse(id, { resources: [] }, null);
                logToFile('Responded:', method, { id, result: { resources: [] } });
                console.error('[MCP Adapter] Responded to resources/list');
                return;
            case 'prompts/list':
                // MCP/Claude expects this; return prompts as an object
                sendResponse(id, { prompts: [] }, null);
                logToFile('Responded:', method, { id, result: { prompts: [] } });
                console.error('[MCP Adapter] Responded to prompts/list');
                return;
            default:
                sendResponse(id, null, { code: -32601, message: 'Unknown method: ' + method });
                logToFile('Responded:', method, { id, error: { code: -32601, message: 'Unknown method: ' + method } });
                return;
        }
        sendResponse(id, result, null);
        logToFile('Responded:', method, { id, result });
    } catch (err) {
        sendResponse(id, null, { message: err.message });
        logToFile('Error:', method, { id, error: err.message, stack: err.stack });
        console.error('[MCP Adapter] Error:', err);
    }
}

// Helper: make HTTP requests to the API
async function http(method, path, params) {
    const url = API_BASE + path;
    if (method === 'GET') {
        const qs = params ? '?' + new URLSearchParams(params).toString() : '';
        const resp = await fetch(url + qs);
        return await resp.json();
    } else {
        const resp = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(params)
        });
        return await resp.json();
    }
}

// Main: read stdin line by line, handle JSON-RPC
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
    try {
        const msg = JSON.parse(line);
        const { id, method, params } = msg;
        // MCP PATCH: Ignore JSON-RPC notifications (method present, id undefined)
        if (method && typeof id === 'undefined') {
            console.error(`[MCP Adapter] Received notification: ${method} ${JSON.stringify(params)}`);
            // Do not respond to notifications, per JSON-RPC spec
            return;
        }
        // Normal request: handle as before
        handleRequest(msg);
    } catch (err) {
        console.error('[MCP Adapter] Invalid JSON-RPC:', line, err);
    }
});
// Log if stdin closes unexpectedly
rl.on('close', () => {
    console.error('[MCP Adapter] Stdin closed. Exiting.');
    process.exit(0);
});

// Handle process signals for clean shutdown
process.on('SIGINT', () => {
    console.error('[MCP Adapter] Received SIGINT. Exiting.');
    process.exit(0);
});
process.on('SIGTERM', () => {
    console.error('[MCP Adapter] Received SIGTERM. Exiting.');
    process.exit(0);
});

// Keep the adapter alive as a persistent gateway for Claude Desktop
setInterval(() => {}, 1000 * 60 * 60); // 1 hour no-op interval, renewed
