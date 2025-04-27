/**
 * @fileoverview Microsoft 365 MCP Adapter
 *
 * This adapter implements the Model Context Protocol (MCP) to enable Claude
 * to access Microsoft 365 data (mail, calendar, files) through the MCP server.
 * 
 * It follows the official MCP specification at https://modelcontextprotocol.io/
 * 
 * This adapter uses a proxy approach to communicate with backend modules without
 * directly importing them, providing true isolation between the MCP protocol
 * handling and the backend implementation.
 */

const readline = require('readline');
const fs = require('fs');
const path = require('path');
const os = require('os');

// HTTP client for API communication
const http = require('http');

// API configuration
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 3000;
const API_BASE_PATH = process.env.API_BASE_PATH || '/api';
const API_TIMEOUT = process.env.API_TIMEOUT || 30000; // 30 seconds

// Configuration
const LOG_FILE = 'mcp-adapter.log';

// Adapter state
let adapterState = {
    initialized: false,
    lastActivity: 0,
    backendAvailable: false
};

/**
 * Call the API server
 * @param {string} method - HTTP method (GET, POST)
 * @param {string} path - API path (e.g., '/v1/mail')
 * @param {object} data - Request data for POST requests
 * @returns {Promise<object>} - API response
 */
async function callApi(method, path, data = null) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: API_HOST,
            port: API_PORT,
            path: `${API_BASE_PATH}${path}`,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json',
                // Include a header to indicate this is an internal API call
                // This allows the backend to recognize it's from the MCP adapter
                'X-MCP-Internal-Call': 'true'
            },
            timeout: API_TIMEOUT
        };
        
        if (data && method === 'POST') {
            options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(data));
        }
        
        const req = http.request(options, (res) => {
            let responseData = '';
            
            res.on('data', (chunk) => {
                responseData += chunk;
            });
            
            res.on('end', () => {
                try {
                    // Handle empty response
                    if (!responseData) {
                        return resolve({});
                    }
                    
                    const parsedData = JSON.parse(responseData);
                    
                    if (res.statusCode >= 400) {
                        reject(new Error(`API error: ${res.statusCode} ${parsedData.error || 'Unknown error'}`));
                    } else {
                        resolve(parsedData);
                    }
                } catch (error) {
                    reject(new Error(`Failed to parse API response: ${error.message}`));
                }
            });
        });
        
        req.on('error', (error) => {
            reject(new Error(`API request failed: ${error.message}`));
        });
        
        req.on('timeout', () => {
            req.destroy();
            reject(new Error(`API request timed out after ${API_TIMEOUT}ms`));
        });
        
        if (data && method === 'POST') {
            req.write(JSON.stringify(data));
        }
        
        req.end();
    });
}

// Helper: log to stderr and file
function logDebug(message, ...args) {
    const ts = new Date().toISOString();
    if (args.length === 0) {
        process.stderr.write(`[${ts}] ${message}\n`);
    } else {
        const safeArgs = args.map(arg => (typeof arg === 'string' ? arg : JSON.stringify(arg)));
        process.stderr.write(`[${ts}] ${message} ${safeArgs.join(' ')}\n`);
    }
}

// Helper: log to file and stderr only (no HTTP/UI log)
function logToFile(prefix, method, data) {
    const timestamp = new Date().toISOString();
    const logEntry = `[${timestamp}] ${prefix} ${method} ${JSON.stringify(data)}\n`;
    // Try to write to file, but don't fail if we can't
    try {
        const logDir = path.dirname(LOG_FILE);
        try {
            fs.accessSync(logDir, fs.constants.W_OK);
            fs.appendFileSync(LOG_FILE, logEntry);
        } catch (accessErr) {
            // If we can't access the log directory, try the temp directory
            const tempLogFile = path.join(os.tmpdir(), 'mcp-adapter.log');
            fs.appendFileSync(tempLogFile, logEntry);
            if (!global.logLocationWarned) {
                logDebug(`[MCP Adapter] Cannot write to ${LOG_FILE}, using ${tempLogFile} instead`);
                global.logLocationWarned = true;
            }
        }
    } catch (fileErr) {
        if (!global.logFileDisabled) {
            logDebug('[MCP Adapter] File logging disabled due to errors');
            global.logFileDisabled = true;
        }
    }
}

// Helper: send JSON-RPC response
function sendResponse(id, result, error) {
    // Only include 'result' on success, 'error' on failure, never both
    const msg = { jsonrpc: '2.0', id };
    if (error) {
        msg.error = error;
    } else {
        msg.result = result;
    }
    process.stdout.write(JSON.stringify(msg) + '\n');
}

// Helper: Initialize the adapter and check backend availability
async function initializeAdapter() {
    if (adapterState.initialized) {
        return adapterState.backendAvailable;
    }
    
    try {
        // Check if backend API is available by calling the health endpoint
        const healthResponse = await callApi('GET', '/health');
        
        if (!healthResponse || healthResponse.status !== 'ok') {
            logDebug('[MCP Adapter] Error: Backend API server not available');
            adapterState.backendAvailable = false;
        } else {
            logDebug('[MCP Adapter] Successfully connected to backend API server');
            adapterState.backendAvailable = true;
        }
        
        adapterState.initialized = true;
        return adapterState.backendAvailable;
    } catch (error) {
        logDebug('[MCP Adapter] Initialization error:', error.message);
        adapterState.initialized = true;
        adapterState.backendAvailable = false;
        return false;
    }
}

// Helper: Check if we can access Microsoft 365 data
async function checkModuleAccess() {
    try {
        if (!adapterState.initialized) {
            await initializeAdapter();
        }
        
        if (!adapterState.backendAvailable) {
            logDebug('[MCP Adapter] Backend API server is not available');
            return false;
        }
        
        // Check API status endpoint
        const statusResponse = await callApi('GET', '/status');
        if (statusResponse && statusResponse.status === 'ok') {
            logDebug('[MCP Adapter] Microsoft 365 API is available');
            return true;
        } else {
            logDebug('[MCP Adapter] Microsoft 365 API status check failed');
            return false;
        }
    } catch (error) {
        logDebug('[MCP Adapter] Module access check error:', error.message);
        return false;
    }
}

// Helper: Execute a module method with error handling via API
async function executeModuleMethod(moduleName, methodName, params = {}) {
    try {
        if (!adapterState.initialized) {
            await initializeAdapter();
        }
        if (!adapterState.backendAvailable) {
            throw new Error('Backend API server not available');
        }
        
        // Map module and method to API endpoints
        let apiPath = '';
        let apiMethod = 'GET';
        let apiData = null;
        
        // Map module.method to API endpoints
        switch (`${moduleName}.${methodName}`) {
            case 'mail.getMail':
                apiPath = '/v1/mail';
                apiMethod = 'GET';
                break;
            case 'mail.sendMail':
                apiPath = '/v1/mail/send';
                apiMethod = 'POST';
                apiData = params;
                break;
            case 'calendar.getEvents':
                apiPath = '/v1/calendar';
                apiMethod = 'GET';
                break;
            case 'calendar.createEvent':
                apiPath = '/v1/calendar/create';
                apiMethod = 'POST';
                apiData = params;
                break;
            case 'files.listFiles':
                apiPath = '/v1/files';
                apiMethod = 'GET';
                break;
            case 'files.uploadFile':
                apiPath = '/v1/files/upload';
                apiMethod = 'POST';
                apiData = params;
                break;
            case 'system.getToolDefinitions':
                apiPath = '/tools';
                apiMethod = 'GET';
                break;
            case 'system.getManifest':
                apiPath = '/tools';  // Same as getToolDefinitions but we'll transform the response
                apiMethod = 'GET';
                break;
            case 'system.getResources':
                // Return empty resources list as this isn't implemented yet
                return { resources: [] };
            case 'system.getPrompts':
                // Return empty prompts list as this isn't implemented yet
                return { prompts: [] };
            default:
                throw new Error(`Unknown API endpoint for ${moduleName}.${methodName}`);
        }
        
        // For GET requests with params, add them as query parameters
        if (apiMethod === 'GET' && Object.keys(params).length > 0) {
            const queryParams = new URLSearchParams();
            for (const [key, value] of Object.entries(params)) {
                queryParams.append(key, value);
            }
            apiPath += `?${queryParams.toString()}`;
        }
        
        logDebug(`[MCP Adapter] Executing ${moduleName}.${methodName} via API: ${apiMethod} ${apiPath}`);
        const result = await callApi(apiMethod, apiPath, apiData);
        
        // Special case for system.getManifest to transform tools list to manifest format
        if (`${moduleName}.${methodName}` === 'system.getManifest' && result && result.tools) {
            return {
                protocolVersion: params.protocolVersion || "2024-11-05",
                capabilities: {
                    toolInvocation: true,
                    manifest: true
                },
                serverInfo: {
                    name: "Microsoft 365 MCP Gateway",
                    version: "1.0.0"
                }
            };
        }
        
        return result;
    } catch (error) {
        logDebug(`[MCP Adapter] Error executing ${moduleName}.${methodName}:`, error.message);
        if (error.message.includes('authentication') || error.message.includes('unauthorized') || error.message.includes('401')) {
            return { 
                error: 'Authentication required. Please log in via the web UI.',
                errorType: 'auth_required'
            };
        }
        return { 
            error: `Error executing ${moduleName}.${methodName}: ${error.message}`,
            errorType: 'module_error'
        };
    }
}

// Helper: Map MCP tool calls to module methods
async function handleToolCall(toolName, toolArgs) {
    try {
        // Make sure adapter is initialized
        if (!adapterState.initialized) {
            await initializeAdapter();
        }
        
        // Update last activity timestamp
        adapterState.lastActivity = Date.now();
        
        // Map tool calls to module methods
        switch (toolName) {
            case 'query':
                // Natural language query to Microsoft 365
                return { error: 'Query functionality not yet implemented' };
                
            case 'getMail':
                // Fetch mail from Microsoft 365 inbox
                return await executeModuleMethod('mail', 'getMail', toolArgs);
                
            case 'sendMail':
                // Send an email via Microsoft 365
                return await executeModuleMethod('mail', 'sendMail', toolArgs);
                
            case 'getCalendar':
                // Process date ranges for calendar
                const timeframe = toolArgs.timeframe || 'today';
                let start, end;
                
                const today = new Date();
                const todayStr = today.toISOString().split('T')[0];
                
                switch (timeframe) {
                    case 'today':
                        start = todayStr;
                        end = todayStr;
                        break;
                    case 'week':
                        // Start of current week (Sunday)
                        const startOfWeek = new Date(today);
                        startOfWeek.setDate(today.getDate() - today.getDay());
                        start = startOfWeek.toISOString().split('T')[0];
                        
                        // End of current week (Saturday)
                        const endOfWeek = new Date(today);
                        endOfWeek.setDate(today.getDate() + (6 - today.getDay()));
                        end = endOfWeek.toISOString().split('T')[0];
                        break;
                    case 'month':
                        // Start of current month
                        start = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;
                        
                        // End of current month
                        const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0);
                        end = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(lastDay.getDate()).padStart(2, '0')}`;
                        break;
                    default:
                        // Default to today if timeframe is not recognized
                        start = todayStr;
                        end = todayStr;
                }
                
                logDebug(`[MCP Adapter] Calendar request with date range: ${start} to ${end}`);
                
                // Add date range to the arguments
                const calendarArgs = {
                    ...toolArgs,
                    start,
                    end
                };
                
                return await executeModuleMethod('calendar', 'getEvents', calendarArgs);
                
            case 'createEvent':
                // Create a calendar event in Microsoft 365
                return await executeModuleMethod('calendar', 'createEvent', toolArgs);
                
            case 'listFiles':
                // List files in OneDrive/SharePoint
                return await executeModuleMethod('files', 'listFiles', toolArgs);
                
            case 'uploadFile':
                // Upload a file to OneDrive/SharePoint
                return await executeModuleMethod('files', 'uploadFile', toolArgs);
                
            default:
                return { error: `Unknown tool: ${toolName}` };
        }
    } catch (error) {
        logDebug(`[MCP Adapter] Error handling tool call ${toolName}:`, error.message);
        return { 
            error: `Error handling tool call: ${error.message}`,
            errorType: 'tool_error'
        };
    }
}

// Helper: handle incoming JSON-RPC requests
async function handleRequest(msg) {
    const { id, method, params } = msg;
    
    // Debug: log every request to stderr and file
    logDebug(`[MCP Adapter] Received: ${method}`, params);
    logToFile('Received:', method, params);
    
    try {
        let result;
        
        // Handle standard MCP methods
        switch (method) {
            case 'initialize': {
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
                logDebug("[MCP Adapter] Responded to initialize with protocolVersion:", result.protocolVersion);
                return;
            }
            case 'tools/call': {
                if (!params || !params.name) {
                    sendResponse(id, null, { code: -32602, message: 'Missing tool name in params' });
                    return;
                }
                
                const toolName = params.name;
                const toolArgs = params.arguments || {};
                logDebug(`[MCP Adapter] Calling tool: ${toolName} with args:`, toolArgs);
                
                try {
                    // Use the handleToolCall function to process the tool call
                    const toolResult = await handleToolCall(toolName, toolArgs);
                    
                    if (toolResult && toolResult.error) {
                        logDebug(`[MCP Adapter] Tool error (${toolName}):`, toolResult.error);
                        sendResponse(id, null, { code: -32603, message: `Tool error: ${toolResult.error}` });
                        return;
                    }
                    
                    // Format the result according to MCP spec
                    const formattedResult = {
                        content: [
                            {
                                type: "text",
                                text: JSON.stringify(toolResult, null, 2)
                            }
                        ],
                        isError: false
                    };
                    
                    // Success response
                    sendResponse(id, formattedResult, null);
                    logDebug(`[MCP Adapter] Tool ${toolName} succeeded:`, JSON.stringify(toolResult).substring(0, 100) + '...');
                    return;
                } catch (err) {
                    logDebug(`[MCP Adapter] Tool error (${toolName}):`, err);
                    sendResponse(id, null, { code: -32603, message: `Tool error: ${err.message}` });
                    return;
                }
                break;
            }
            case 'tools/list':
                // Get the tools list from the API
                try {
                    logDebug('[MCP Adapter] Getting tools list from API');
                    const toolsResult = await callApi('GET', '/tools');
                    
                    if (!toolsResult || !toolsResult.tools) {
                        logDebug('[MCP Adapter] API returned invalid tools list');
                        // Fallback to empty list if API fails
                        result = {
                            protocolVersion: (params && params.protocolVersion) ? params.protocolVersion : "2024-11-05",
                            tools: []
                        };
                    } else {
                        // Convert API tools format to MCP format
                        const mcpTools = toolsResult.tools.map(tool => ({
                            name: tool.name,
                            description: tool.description,
                            inputSchema: {
                                type: 'object',
                                properties: Object.entries(tool.parameters || {}).reduce((acc, [key, value]) => {
                                    acc[key] = {
                                        type: value.type || 'string',
                                        description: value.description || ''
                                    };
                                    return acc;
                                }, {}),
                                required: Object.entries(tool.parameters || {})
                                    .filter(([_, value]) => !value.optional)
                                    .map(([key, _]) => key)
                            }
                        }));
                        
                        result = {
                            protocolVersion: (params && params.protocolVersion) ? params.protocolVersion : "2024-11-05",
                            tools: mcpTools
                        };
                    }
                } catch (error) {
                    logDebug('[MCP Adapter] Error getting tools list from API:', error.message);
                    // Fallback to empty list if API fails
                    result = {
                        protocolVersion: (params && params.protocolVersion) ? params.protocolVersion : "2024-11-05",
                        tools: []
                    };
                }
                sendResponse(id, result, null);
                logToFile('Responded:', method, { id, result });
                logDebug("[MCP Adapter] Responded to tools/list");
                return;
            case 'getManifest':
                // Legacy method - same as tools/list for compatibility
                // Create a standard MCP manifest
                result = {
                    protocolVersion: (params && params.protocolVersion) ? params.protocolVersion : "2024-11-05",
                    capabilities: {
                        toolInvocation: true,
                        manifest: true
                    },
                    serverInfo: {
                        name: "Microsoft 365 MCP Gateway",
                        version: "1.0.0"
                    }
                };
                sendResponse(id, result, null);
                logToFile('Responded:', method, { id, result });
                logDebug("[MCP Adapter] Responded to getManifest");
                return;
            case 'resources/list':
                // Return empty resources list (not implemented yet)
                logDebug('[MCP Adapter] Returning empty resources list');
                result = { resources: [] };
                sendResponse(id, result, null);
                logToFile('Responded:', method, { id, result });
                logDebug("[MCP Adapter] Responded to resources/list");
                return;
            case 'prompts/list':
                // Return empty prompts list (not implemented yet)
                logDebug('[MCP Adapter] Returning empty prompts list');
                result = { prompts: [] };
                sendResponse(id, result, null);
                logToFile('Responded:', method, { id, result });
                logDebug("[MCP Adapter] Responded to prompts/list");
                return;
            default:
                logDebug(`[MCP Adapter] Unknown method: ${method}`);
                sendResponse(id, null, { code: -32601, message: `Method not found: ${method}` });
                return;
        }
    } catch (err) {
        logDebug(`[MCP Adapter] Error handling ${method}:`, err);
        sendResponse(id, null, { code: -32603, message: `Internal error: ${err.message}` });
    }
}

// Initialize: check backend API availability
async function initialize() {
    logDebug('[MCP Adapter] Initializing (API isolation approach)...');
    const ok = await initializeAdapter();
    if (ok) {
        logDebug('[MCP Adapter] ✅ Backend API server available. Ready to handle MCP requests.');
    } else {
        logDebug('[MCP Adapter] ❌ Backend API server not available. Adapter will function in limited mode.');
    }
}

// Run initialization (proxy approach)
initialize();

// Main: read stdin line by line, handle JSON-RPC
const rl = readline.createInterface({ input: process.stdin });
rl.on('line', (line) => {
    try {
        const msg = JSON.parse(line);
        const { id, method, params } = msg;
        // MCP PATCH: Ignore JSON-RPC notifications (method present, id undefined)
        if (method && typeof id === 'undefined') {
            logToFile('Received', method, { params });
            logDebug(`[MCP Adapter] Received notification: ${method} ${JSON.stringify(params)}`);
            // Do not respond to notifications, per JSON-RPC spec
            return;
        }
        // Normal request: handle as before
        handleRequest(msg);
    } catch (err) {
        logDebug('[MCP Adapter] Invalid JSON-RPC:', line, err);
    }
});

// Log if stdin closes unexpectedly
rl.on('close', () => {
    logDebug('[MCP Adapter] Stdin closed. Exiting.');
    process.exit(0);
});

// Handle process signals for clean shutdown
process.on('SIGINT', () => {
    logDebug('[MCP Adapter] Received SIGINT. Exiting.');
    process.exit(0);
});

process.on('SIGTERM', () => {
    logDebug('[MCP Adapter] Received SIGTERM. Exiting.');
    process.exit(0);
});
