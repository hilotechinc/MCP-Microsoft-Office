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
const https = require('https');
const { URLSearchParams } = require('url');
const Joi = require('joi'); // For parameter validation

// Import services
const monitoringService = require('./src/core/monitoring-service.cjs');
const errorService = require('./src/core/error-service.cjs');
const createToolsService = require('./src/core/tools-service.cjs');

// API configuration
const API_HOST = process.env.API_HOST || 'localhost';
const API_PORT = process.env.API_PORT || 3000;
const API_BASE_PATH = process.env.API_BASE_PATH || '/api';
const API_TIMEOUT = process.env.API_TIMEOUT || 30000; // 30 seconds

// MCP adapters should not attempt to write to files directly as they may not have permissions
// All file logging should be handled by the backend via the monitoring service
// Only use stderr for direct logging from the adapter

// Monkey-patch console methods to prevent JSON-RPC stream pollution
// Store original console methods
const originalConsole = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error
};

// Helper: Write logs to stderr and use monitoring service for backend logging
function writeToLogFile(level, ...args) {
    try {
        const prefix = `[MCP ADAPTER ${level.toUpperCase()}]`;
        const formattedArgs = args.map(arg => {
            if (typeof arg === 'object') {
                try {
                    return JSON.stringify(arg);
                } catch (e) {
                    return `[Object: ${Object.prototype.toString.call(arg)}]`;
                }
            }
            return String(arg);
        }).join(' ');
        
        // CRITICAL: NEVER write to stdout in an MCP adapter - it corrupts the JSON-RPC stream
        // Only write to stderr and use monitoring service for backend logging
        
        // Write to stderr (safe for MCP protocol)
        process.stderr.write(`${prefix} ${formattedArgs}\n`);
        
        // Use monitoring service to log through the backend (where file permissions are available)
        try {
            setImmediate(() => {
                if (level === 'error') {
                    monitoringService.logError({
                        message: `${prefix} ${formattedArgs}`,
                        category: 'MCP_ADAPTER',
                        severity: 'ERROR',
                        context: {}
                    });
                } else if (level === 'warn') {
                    monitoringService.warn(`${prefix} ${formattedArgs}`, {});
                } else if (level === 'debug') {
                    monitoringService.debug(`${prefix} ${formattedArgs}`, {});
                } else {
                    monitoringService.info(`${prefix} ${formattedArgs}`, {});
                }
            });
        } catch (monitoringErr) {
            // Silently ignore monitoring errors - we already logged to stderr
        }
    } catch (err) {
        // Last resort fallback - write directly to stderr
        process.stderr.write(`[ERROR LOGGING] Failed to log message: ${err.message}\n`);
    }
}

// Replace console methods with our safe versions that NEVER write to stdout
console.log = (...args) => {
    // NEVER use originalConsole.log as it writes to stdout
    writeToLogFile('info', ...args);
};
console.debug = (...args) => writeToLogFile('debug', ...args);
console.info = (...args) => writeToLogFile('info', ...args);
console.warn = (...args) => writeToLogFile('warn', ...args);
console.error = (...args) => writeToLogFile('error', ...args);

// Adapter state
let adapterState = {
    initialized: false,
    lastActivity: 0,
    backendAvailable: false
};

// Initialize tools service with a stub module registry containing the module definitions
const stubModuleRegistry = {
    getAllModules: () => [
        { id: 'mail', name: 'mail', capabilities: ['getInbox', 'sendEmail', 'searchEmails', 'flagEmail', 'getEmailDetails', 'markAsRead'] },
        { id: 'calendar', name: 'calendar', capabilities: ['getEvents', 'create', 'update', 'scheduleMeeting', 'getAvailability', 'findMeetingTimes', 'cancelEvent'] },
        { id: 'files', name: 'files', capabilities: ['listFiles', 'uploadFile', 'downloadFile', 'getFileMetadata'] },
        { id: 'people', name: 'people', capabilities: ['find', 'search', 'getRelevantPeople', 'getPersonById'] }
    ],
    getModule: (moduleName) => {
        const modules = {
            'mail': { id: 'mail', capabilities: ['getInbox', 'sendEmail', 'searchEmails', 'flagEmail', 'getEmailDetails', 'markAsRead'] },
            'calendar': { id: 'calendar', capabilities: ['getEvents', 'create', 'update', 'scheduleMeeting', 'getAvailability', 'findMeetingTimes', 'cancelEvent'] },
            'files': { id: 'files', capabilities: ['listFiles', 'uploadFile', 'downloadFile', 'getFileMetadata'] },
            'people': { id: 'people', capabilities: ['find', 'search', 'getRelevantPeople', 'getPersonById'] }
        };
        return modules[moduleName] || null;
    }
};
const toolsService = createToolsService({ 
    moduleRegistry: stubModuleRegistry, 
    logger: {
        debug: (...args) => logDebug('[ToolsService]', ...args),
        info: (...args) => logDebug('[ToolsService]', ...args),
        warn: (...args) => logDebug('[ToolsService] WARN:', ...args),
        error: (...args) => process.stderr.write(`[MCP ADAPTER ERROR] [ToolsService] ${args.join(' ')}\n`)
    }
});

// Helper: Initialize the adapter and check backend availability
let healthCheckInterval = null; // Keep track of the interval timer
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds

/**
 * Call the API server
 * @param {string} method - HTTP method (GET, POST, PUT, PATCH, DELETE)
 * @param {string} path - API path (e.g., '/v1/mail')
 * @param {object} data - Request data for POST requests
 * @returns {Promise<object>} - API response
 */
// TODO: [callApi] Implement circuit breaker pattern (e.g., using 'opossum') (HIGH)
// TODO: [callApi] Refine retry logic (e.g., exponential backoff, specific status codes) (MEDIUM)
// TODO: [callApi] Support PATCH/PUT; add retry + circuit breaker (HIGH) - Partially Implemented (PUT/PATCH support + Basic Retry added)
async function callApi(method, path, data = null) {
    const MAX_RETRIES = 3;
    const RETRY_DELAY_MS = 100;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            return await new Promise((resolve, reject) => {
                const options = {
                    hostname: API_HOST,
                    port: API_PORT,
                    path: `${API_BASE_PATH}${path}`,
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Accept': 'application/json',
                        'X-MCP-Internal-Call': 'true'
                    },
                    timeout: API_TIMEOUT
                };

                const requestBody = data ? JSON.stringify(data) : null;

                if (requestBody && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
                    options.headers['Content-Length'] = Buffer.byteLength(requestBody);
                }

                const req = http.request(options, (res) => {
                    let responseData = '';
                    res.on('data', (chunk) => { responseData += chunk; });
                    res.on('end', () => {
                        try {
                            if (!responseData) {
                                if (res.statusCode >= 200 && res.statusCode < 300) {
                                    return resolve({});
                                } else {
                                    // Treat 5xx errors as potentially retryable
                                    const err = new Error(`API error: ${res.statusCode} with empty response`);
                                    if (res.statusCode >= 500) err.isRetryable = true;
                                    return reject(err);
                                }
                            }

                            const parsedData = JSON.parse(responseData);
                            if (res.statusCode >= 400) {
                                const err = new Error(`API error: ${res.statusCode} ${parsedData.error || responseData}`);
                                // Treat 5xx errors as potentially retryable
                                if (res.statusCode >= 500) err.isRetryable = true;
                                reject(err);
                            } else {
                                resolve(parsedData);
                            }
                        } catch (parseError) {
                            reject(new Error(`Failed to parse API response: ${parseError.message}. Raw: ${responseData.slice(0, 100)}...`));
                        }
                    });
                });

                req.on('error', (error) => {
                    // Network errors are retryable
                    error.isRetryable = true;
                    reject(new Error(`API request network error: ${error.message}`));
                });

                req.on('timeout', () => {
                    req.destroy();
                    const timeoutError = new Error(`API request timed out after ${API_TIMEOUT}ms`);
                    timeoutError.isRetryable = true; // Timeouts are retryable
                    reject(timeoutError);
                });

                if (requestBody && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
                    req.write(requestBody);
                }
                req.end();
            });
        } catch (error) {
            lastError = error;
            if (error.isRetryable && attempt < MAX_RETRIES) {
                logDebug(`[callApi] Attempt ${attempt} failed (${error.message}), retrying in ${RETRY_DELAY_MS * attempt}ms...`);
                await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * attempt)); // Simple increasing delay
            } else {
                logDebug(`[callApi] Failed after ${attempt} attempts: ${error.message}`);
                throw lastError; // Throw the last encountered error
            }
        }
    }
    // This line should technically not be reached if MAX_RETRIES >= 1
    throw lastError || new Error('callApi failed after all retries.');
}

// Helper: log debug messages safely (never to stdout)
function logDebug(message, ...args) {
    try {
        // Format the message with args
        let formattedMessage = message;
        if (args.length > 0) {
            try {
                const formattedArgs = args.map(arg => {
                    if (arg instanceof Error) {
                        return `${arg.message}\n${arg.stack || 'No stack trace'}`;
                    } else if (typeof arg === 'object') {
                        try {
                            return JSON.stringify(arg, null, 2);
                        } catch (e) {
                            return `[Object: ${Object.prototype.toString.call(arg)}]`;
                        }
                    }
                    return String(arg);
                }).join(' ');
                formattedMessage = `${message} ${formattedArgs}`;
            } catch (formatErr) {
                formattedMessage = `${message} [Error formatting args: ${formatErr.message}]`;
            }
        }
        
        // CRITICAL: NEVER write to stdout in an MCP adapter - it corrupts the JSON-RPC stream
        // Only write to stderr or use the monitoring service
        
        // Write to stderr (safe for MCP)
        process.stderr.write(`[DEBUG] ${formattedMessage}\n`);
        
        // Also log to monitoring service if available
        try {
            setImmediate(() => {
                monitoringService.debug(formattedMessage, {});
            });
        } catch (monitoringErr) {
            // Silently ignore monitoring errors - we already logged to stderr
        }
    } catch (err) {
        // Last resort fallback - write directly to stderr
        process.stderr.write(`[ERROR LOGGING] Failed to log debug message: ${err.message}\n`);
    }
}

// Helper: log protocol messages via monitoring service (never to stdout)
// Uses MonitoringService for centralized logging through the backend
function logToFile(prefix, method, data) {
    try {
        // Format the data for logging
        const formattedData = typeof data === 'object' ? JSON.stringify(data) : String(data);
        
        // Use monitoring service for centralized logging through the backend
        try {
            // Use setImmediate to avoid blocking the main thread
            setImmediate(() => {
                try {
                    // Use debug level for protocol logs
                    monitoringService.debug(`[MCP PROTOCOL] ${prefix} ${method}`, {
                        protocol: true,
                        prefix,
                        method,
                        data: typeof data === 'object' ? data : { value: data }
                    });
                } catch (innerErr) {
                    // Log monitoring errors to stderr only
                    process.stderr.write(`[MONITORING ERROR] ${innerErr.message}\n`);
                }
            });
        } catch (err) {
            // Last resort: log to stderr
            process.stderr.write(`[MCP PROTOCOL LOG ERROR] ${err.message}\n`);
        }
    } catch (err) {
        // Last resort: log to stderr
        process.stderr.write(`[MCP PROTOCOL LOG ERROR] ${err.message}\n`);
    }
}

// Helper: send JSON-RPC response
function sendResponse(id, result, error) {
    try {
        // Build JSON-RPC response
        const response = {
            jsonrpc: '2.0',
            id
        };
        
        if (error) {
            response.error = error;
        } else {
            response.result = result || null;
        }
        
        // Convert to JSON
        const jsonResponse = JSON.stringify(response);
        
        // Send to stdout (the only place we should write to stdout)
        // CRITICAL: Use process.stdout.write directly instead of console.log
        // to avoid any potential interference from console monkey-patching
        process.stdout.write(jsonResponse + '\n');
    } catch (err) {
        // Log error to stderr (never stdout)
        process.stderr.write(`[ERROR] Failed to send response: ${err.message}\n`);
        
        // Try to send a simplified error response
        try {
            const fallbackResponse = {
                jsonrpc: '2.0',
                id,
                error: {
                    code: -32603,
                    message: 'Internal error while sending response'
                }
            };
            // Use process.stdout.write directly
            process.stdout.write(JSON.stringify(fallbackResponse) + '\n');
        } catch (fallbackErr) {
            // Last resort: write directly to stdout
            process.stdout.write(JSON.stringify({
                jsonrpc: '2.0',
                id,
                error: { code: -32603, message: 'Critical error' }
            }) + '\n');
        }
    }
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
            adapterState.initialized = true;

            // Start periodic health checks only if initial check was successful
            if (!healthCheckInterval) {
                healthCheckInterval = setInterval(async () => {
                    try {
                        const healthResponse = await callApi('GET', '/health');
                        if (healthResponse && healthResponse.status === 'ok') {
                            if (!adapterState.backendAvailable) {
                                logDebug('[MCP Adapter] Backend API server became available again.');
                                adapterState.backendAvailable = true;
                                // TODO: Reset consecutive failure count here
                            }
                        } else {
                            throw new Error('Backend health check failed or returned invalid status');
                        }
                    } catch (error) {
                        if (adapterState.backendAvailable) {
                            logDebug(`[MCP Adapter] Periodic health check failed: ${error.message}. Marking backend as unavailable.`);
                            adapterState.backendAvailable = false;
                            // TODO: Increment consecutive failure count here
                            // TODO: Implement fail-fast: if consecutive failures > threshold, clearInterval(healthCheckInterval) and log permanent failure.
                        }
                        // else: It was already unavailable, do nothing extra
                    }
                }, HEALTH_CHECK_INTERVAL_MS);

                // TODO: Ensure healthCheckInterval is cleared on adapter shutdown/process exit.
            }
        }
        return adapterState.backendAvailable;
    } catch (error) {
        logDebug(`[MCP Adapter] Initialization error: ${error.message}`);
        adapterState.initialized = true;
        adapterState.backendAvailable = false;
        return false;
    }
}

/**
 * Check if the backend API is available and if tools/modules are loaded.
 * Calls the `/v1/tools` endpoint.
 */
async function checkModuleAccess() {
    try {
        if (!adapterState.initialized) {
            await initializeAdapter();
        }

        if (!adapterState.backendAvailable) {
            logDebug('[MCP Adapter] checkModuleAccess: Backend API server is not available (cached state).');
            return false;
        }

        // Check if tools are accessible via the API
        logDebug('[MCP Adapter] checkModuleAccess: Checking /v1/tools endpoint...');
        const toolsResponse = await callApi('GET', '/v1/tools');

        // Check for a successful response and a non-empty tools array
        if (toolsResponse && Array.isArray(toolsResponse.tools) && toolsResponse.tools.length > 0) {
            logDebug(`[MCP Adapter] checkModuleAccess: Success - ${toolsResponse.tools.length} tools reported by API.`);
            return true;
        } else {
            logDebug('[MCP Adapter] checkModuleAccess: Failed - API did not return a valid tools list.', toolsResponse);
            return false;
        }
    } catch (error) {
        logDebug(`[MCP Adapter] checkModuleAccess: Error checking /v1/tools - ${error.message}`);
        return false;
    }
}

// Helper: Execute a module method with error handling via API
async function executeModuleMethod(moduleName, methodName, params = {}) {
    try {
        // Make sure adapter is initialized
        if (!adapterState.initialized) {
            await initializeAdapter();
        }

        // Update last activity timestamp
        adapterState.lastActivity = Date.now();

        // --- Parameter Transformation ---
        // Instead of validating parameters, we'll transform them as needed
        // to match the format expected by the backend API
        
        // Log the parameters being processed
        logDebug(`[MCP Adapter] Processing parameters for ${moduleName}.${methodName}:`, params);
        
        // Transform parameters based on the module and method
        // This ensures compatibility with the backend API expectations
        let transformedParams = { ...params }; // Start with a copy of the original params
        // Map module.method to API endpoints
        let apiPath = '';
        let apiMethod = 'GET';
        let apiData = null;

        // Determine API path and method based on module.method
        const moduleMethod = `${moduleName}.${methodName}`;
        
        // Log the module method being executed for debugging
        logDebug(`[MCP Adapter] Executing module method: ${moduleMethod} with params:`, transformedParams);
        
        // Helper function to transform attendees from string or array to proper format
        const transformAttendees = (attendees) => {
            if (!attendees) return undefined;
            
            // If attendees is a string (comma-separated), convert to array
            if (typeof attendees === 'string') {
                return attendees.split(',').map(email => email.trim());
            }
            
            // If already an array, return as is
            return attendees;
        };
        
        // Helper function to transform date/time to proper format
        const transformDateTime = (dateTime, timeZone = 'UTC') => {
            if (!dateTime) return undefined;
            
            // If already an object with dateTime, return as is
            if (typeof dateTime === 'object' && dateTime.dateTime) {
                return dateTime;
            }
            
            // If a string, convert to object format
            if (typeof dateTime === 'string') {
                return {
                    dateTime: dateTime,
                    timeZone: timeZone
                };
            }
            
            return dateTime;
        };
        
        switch (moduleMethod) {
            // Query module endpoints
            case 'query.processQuery':
            case 'query.getQuery': // Add alias for backward compatibility
                apiPath = '/v1/query';
                apiMethod = 'POST';
                // Ensure query parameter is properly named for the API
                apiData = { 
                    query: transformedParams.query,
                    context: transformedParams.context
                };
                // Log the API call for debugging
                logDebug(`[MCP Adapter] Making POST request to ${apiPath} with data:`, apiData);
                break;
            
            // Email details endpoint
            case 'mail.getEmailDetails':
                if (!transformedParams.id) {
                    throw new Error('Email ID is required for getEmailDetails');
                }
                // Properly format the path with the ID parameter
                apiPath = `/v1/mail/${transformedParams.id}`;
                apiMethod = 'GET';
                // Log the API call for debugging
                logDebug(`[MCP Adapter] Making GET request to ${apiPath}`);
                break;
                
            // Mark email as read endpoint
            case 'mail.markAsRead':
                if (!transformedParams.id) {
                    throw new Error('Email ID is required for markAsRead');
                }
                // Properly format the path with the ID parameter
                apiPath = `/v1/mail/${transformedParams.id}/read`;
                apiMethod = 'PATCH';
                // Include isRead in the request body
                apiData = {
                    isRead: transformedParams.isRead !== false // Default to true if not explicitly set to false
                };
                // Log the API call for debugging
                logDebug(`[MCP Adapter] Making PATCH request to ${apiPath} with data:`, apiData);
                break;
            case 'mail.getInbox':
            case 'mail.readMail':
            case 'outlook mail.readMail':
                apiPath = '/v1/mail';
                apiMethod = 'GET';
                break;
            case 'mail.sendEmail':
            case 'mail.send':
                const toolDefinition = toolsService.getToolByName('mail.sendEmail');
                if (toolDefinition) {
                    apiPath = toolDefinition.endpoint;
                    apiMethod = toolDefinition.method;
                } else {
                    apiPath = '/v1/mail/send';
                    apiMethod = 'POST';
                }
                // Basic structuring - assumes controller expects these directly
                // Infer contentType
                const looksLikeHtml = /<[a-z][\s\S]*>/i.test(params.body || '');
                apiData = {
                    to: params.to,
                    cc: params.cc, // Pass CC if provided
                    bcc: params.bcc, // Pass BCC if provided
                    subject: params.subject,
                    body: params.body,
                    contentType: looksLikeHtml ? 'HTML' : 'Text' // Set content type
                };
                logDebug(`[MCP Adapter] Handling ${moduleName}.${methodName} with path ${apiPath} and data:`, apiData);
                break;
            case 'mail.searchMail':
            case 'mail.searchEmails':
            case 'mail.search': // Added this alias to handle Claude's tool call
                apiPath = '/v1/mail/search';
                apiMethod = 'GET';
                // Map 'query' parameter to 'q' as expected by the controller
                if (params.query && !params.q) {
                    params.q = params.query;
                    // Remove the original query param to avoid confusion
                    delete params.query;
                }
                break;
            case 'mail.flagMail':
            case 'mail.flagEmail':
                apiPath = '/v1/mail/flag';
                apiMethod = 'POST';
                apiData = params;
                break;
            case 'mail.getAttachments':
                apiPath = '/v1/mail/attachments';
                apiMethod = 'GET';
                break;

            // Calendar module endpoints
            case 'calendar.getEvents':
            case 'calendar.getCalendar':
                apiPath = '/v1/calendar';
                apiMethod = 'GET';
                break;
            case 'calendar.createEvent':
            case 'calendar.create':
                apiPath = '/v1/calendar/events';
                apiMethod = 'POST';
                // Map of Microsoft time zones to IANA time zones
                // The server will use this mapping to convert between formats as needed
                const TIMEZONE_MAPPING = {
                    'Pacific Standard Time': 'America/Los_Angeles',
                    'Eastern Standard Time': 'America/New_York',
                    'Central Standard Time': 'America/Chicago',
                    'Mountain Standard Time': 'America/Denver',
                    'Alaskan Standard Time': 'America/Anchorage',
                    'Hawaiian Standard Time': 'Pacific/Honolulu',
                    'W. Europe Standard Time': 'Europe/Berlin',
                    'GMT Standard Time': 'Europe/London',
                    'Romance Standard Time': 'Europe/Paris',
                    'E. Europe Standard Time': 'Europe/Bucharest',
                    'Singapore Standard Time': 'Asia/Singapore',
                    'Tokyo Standard Time': 'Asia/Tokyo',
                    'China Standard Time': 'Asia/Shanghai',
                    'India Standard Time': 'Asia/Kolkata',
                    'UTC': 'UTC'
                };
                
                // For createEvent, we want to preserve the original Microsoft time zone format
                // because the Graph API expects this format in the Prefer header
                // The server's calendar-service.cjs will handle the mapping to IANA format
                
                // Make copies of start/end to avoid mutating the original
                const start = { ...transformedParams.start };
                const end = { ...transformedParams.end };
                
                // Log the original time zones for debugging
                if (start && start.timeZone) {
                    console.log(`[MCP Adapter] Original start time zone: ${start.timeZone}`);
                    // Note that we're NOT converting here - the server will handle it
                }
                
                if (end && end.timeZone) {
                    console.log(`[MCP Adapter] Original end time zone: ${end.timeZone}`);
                    // Note that we're NOT converting here - the server will handle it
                }
                
                // Pass the user's timeZone parameter if provided - this helps the server
                // determine the preferred timezone when not specified in start/end
                const timeZone = transformedParams.timeZone;
                if (timeZone) {
                    console.log(`[MCP Adapter] Using provided timeZone parameter: ${timeZone}`);
                }
                
                // Transform parameters to match the controller's expectations
                apiData = {
                    subject: transformedParams.subject,
                    start: transformDateTime(start, timeZone),
                    end: transformDateTime(end, timeZone),
                    location: transformedParams.location,
                    body: transformedParams.body,
                    isOnlineMeeting: transformedParams.isOnlineMeeting
                };
                
                // Special handling for attendees based on format
                if (transformedParams.attendees) {
                    // Handle different potential formats of attendees
                    if (Array.isArray(transformedParams.attendees)) {
                        const formattedAttendees = [];
                        
                        for (const attendee of transformedParams.attendees) {
                            // Case 1: It's already in the right format with emailAddress.address
                            if (attendee && attendee.emailAddress && attendee.emailAddress.address) {
                                formattedAttendees.push(attendee);
                            }
                            // Case 2: It's an object with email property
                            else if (attendee && attendee.email) {
                                formattedAttendees.push({
                                    emailAddress: {
                                        address: attendee.email,
                                        name: attendee.name || attendee.email.split('@')[0]
                                    },
                                    type: attendee.type || 'required'
                                });
                            }
                            // Case 3: It's a simple string (email)
                            else if (typeof attendee === 'string') {
                                formattedAttendees.push({
                                    emailAddress: {
                                        address: attendee,
                                        name: attendee.split('@')[0]
                                    },
                                    type: 'required'
                                });
                            }
                        }
                        
                        if (formattedAttendees.length > 0) {
                            apiData.attendees = formattedAttendees;
                        }
                    }
                }
                // Log the API call for debugging
                logDebug(`[MCP Adapter] Making POST request to ${apiPath} with data:`, apiData);
                break;
            case 'calendar.events': // Handle the events endpoint for fetching events
                apiPath = '/v1/calendar';  // Changed from /v1/calendar/events to /v1/calendar
                apiMethod = 'GET';
                // For GET requests, parameters go in the query string
                apiData = null;
                apiParams = {
                    limit: transformedParams.limit || 20,
                    filter: transformedParams.filter,
                    timeMin: transformedParams.timeMin,
                    timeMax: transformedParams.timeMax
                };
                
                // Log the API call for debugging
                logDebug(`[MCP Adapter] Making GET request to ${apiPath} with params:`, apiParams);
                break;
            case 'calendar.updateEvent':
            case 'calendar.update':
                // Ensure we have a valid event ID
                if (!transformedParams.id) {
                    throw new Error('Event ID is required for calendar update');
                }
                apiPath = '/v1/calendar/events/' + transformedParams.id;
                apiMethod = 'PUT';
                
                // Create an object with only the provided parameters
                // This avoids sending undefined values that could overwrite existing data
                const updateData = {};
                
                if (transformedParams.subject !== undefined) {
                    updateData.subject = transformedParams.subject;
                }
                
                if (transformedParams.start !== undefined) {
                    updateData.start = transformDateTime(transformedParams.start, transformedParams.timeZone);
                }
                
                if (transformedParams.end !== undefined) {
                    updateData.end = transformDateTime(transformedParams.end, transformedParams.timeZone);
                }
                
                if (transformedParams.attendees !== undefined) {
                    updateData.attendees = transformAttendees(transformedParams.attendees);
                }
                
                if (transformedParams.location !== undefined) {
                    updateData.location = transformedParams.location;
                }
                
                if (transformedParams.body !== undefined) {
                    updateData.body = transformedParams.body;
                }
                
                if (transformedParams.isOnlineMeeting !== undefined) {
                    updateData.isOnlineMeeting = transformedParams.isOnlineMeeting;
                }
                
                apiData = updateData;
                
                // Log the update data for debugging
                logDebug(`[MCP Adapter] Updating event ${transformedParams.id} with data:`, apiData);
                break;
            case 'calendar.getAvailability':
            case 'calendar.availability':
                apiPath = '/v1/calendar/availability';
                apiMethod = 'POST';
                
                // Ensure we have start/end dates for availability check
                if (!transformedParams.start && !transformedParams.startTime) {
                    throw new Error('Start time is required for getAvailability');
                }
                
                if (!transformedParams.end && !transformedParams.endTime) {
                    throw new Error('End time is required for getAvailability');
                }
                
                // Transform start/end to ISO string format if they're Date objects
                const startTime = typeof transformedParams.start === 'object' && transformedParams.start.dateTime 
                    ? transformedParams.start.dateTime 
                    : transformedParams.start || transformedParams.startTime;
                
                const endTime = typeof transformedParams.end === 'object' && transformedParams.end.dateTime 
                    ? transformedParams.end.dateTime 
                    : transformedParams.end || transformedParams.endTime;
                
                // Transform parameters to match the controller's expectations
                // The controller expects users and timeSlots array
                apiData = {
                    // Use users or attendees, transforming as needed
                    users: transformAttendees(transformedParams.users) || transformAttendees(transformedParams.attendees) || [],
                    // Format as timeSlots array as required by the controller
                    timeSlots: [
                        {
                            start: {
                                dateTime: startTime,
                                timeZone: transformedParams.timeZone || 'UTC'
                            },
                            end: {
                                dateTime: endTime,
                                timeZone: transformedParams.timeZone || 'UTC'
                            }
                        }
                    ]
                };
                
                // Log the transformed data for debugging
                logDebug(`[MCP Adapter] Transformed availability data:`, apiData);
                break;
            case 'calendar.acceptEvent':
                apiPath = `/v1/calendar/events/${params.eventId}/accept`;
                apiMethod = 'POST';
                apiData = params.comment ? { comment: params.comment } : {};
                break;
            case 'calendar.tentativelyAcceptEvent':
                apiPath = `/v1/calendar/events/${params.eventId}/tentativelyAccept`;
                apiMethod = 'POST';
                apiData = params.comment ? { comment: params.comment } : {};
                break;
            case 'calendar.declineEvent':
                apiPath = `/v1/calendar/events/${params.eventId}/decline`;
                apiMethod = 'POST';
                apiData = params.comment ? { comment: params.comment } : {};
                break;
            case 'calendar.cancelEvent':
                // Handle both eventId and id parameter names
                if (!transformedParams.eventId && !transformedParams.id) {
                    throw new Error('Event ID is required for cancelEvent (either eventId or id parameter)');
                }
                
                const cancelEventId = transformedParams.eventId || transformedParams.id;
                apiPath = `/v1/calendar/events/${cancelEventId}/cancel`;
                apiMethod = 'POST';
                apiData = transformedParams.comment ? { comment: transformedParams.comment } : {};
                
                // Log the cancel request
                logDebug(`[MCP Adapter] Cancelling event ${cancelEventId}`);
                break;
            case 'calendar.findMeetingTimes':
            case 'calendar.findtimes': // Add this case to handle the findtimes endpoint
                apiPath = '/v1/calendar/findMeetingTimes';
                apiMethod = 'POST';
                // Transform parameters to match what the calendar service expects
                
                // Extract time constraints from different possible input formats
                let timeConstraints = transformedParams.timeConstraints;
                if (!timeConstraints && (transformedParams.startTime || transformedParams.start)) {
                    timeConstraints = {
                        startTime: transformedParams.startTime || transformedParams.start,
                        endTime: transformedParams.endTime || transformedParams.end,
                        timeZone: transformedParams.timeZone || 'UTC'
                    };
                }
                
                apiData = {
                    // Transform attendees to array format
                    attendees: transformAttendees(transformedParams.attendees) || [],
                    // Time constraints
                    timeConstraint: {
                        start: timeConstraints?.startTime || timeConstraints?.start,
                        end: timeConstraints?.endTime || timeConstraints?.end,
                        timeZone: timeConstraints?.timeZone || transformedParams.timeZone || 'UTC'
                    },
                    // Duration in minutes
                    meetingDuration: transformedParams.meetingDuration || transformedParams.duration || 60,
                    // Additional parameters
                    maxCandidates: transformedParams.maxCandidates || 10,
                    minimumAttendeePercentage: transformedParams.minimumAttendeePercentage || 100
                };
                
                // Log the transformed parameters for debugging
                logDebug(`[MCP Adapter] Transformed findMeetingTimes parameters:`, apiData);
                break;
            case 'calendar.scheduleMeeting':
            case 'calendar.schedule': // Add alias for backward compatibility
                apiPath = '/v1/calendar/events'; // Map to the same endpoint as createEvent
                apiMethod = 'POST';
                
                // Extract start and end time information - prioritize preferredTimes if available
                let meetingStartTime, meetingEndTime;
                
                if (transformedParams.preferredTimes && transformedParams.preferredTimes.length > 0) {
                    meetingStartTime = transformedParams.preferredTimes[0].start;
                    meetingEndTime = transformedParams.preferredTimes[0].end;
                    console.log(`[MCP Adapter scheduleMeeting] Using preferredTimes: ${JSON.stringify(meetingStartTime)} to ${JSON.stringify(meetingEndTime)}`);
                } else {
                    // Try various parameter combinations to extract start/end times
                    if (transformedParams.start) {
                        meetingStartTime = transformedParams.start;
                    } else if (transformedParams.startDateTime) {
                        meetingStartTime = { 
                            dateTime: transformedParams.startDateTime, 
                            timeZone: transformedParams.timeZone || 'Pacific Standard Time' 
                        };
                    }
                    
                    if (transformedParams.end) {
                        meetingEndTime = transformedParams.end;
                    } else if (transformedParams.endDateTime) {
                        meetingEndTime = { 
                            dateTime: transformedParams.endDateTime, 
                            timeZone: transformedParams.timeZone || 'Pacific Standard Time' 
                        };
                    }
                    
                    console.log(`[MCP Adapter scheduleMeeting] Using direct parameters: ${JSON.stringify(meetingStartTime)} to ${JSON.stringify(meetingEndTime)}`);
                }
                
                // Log timezone information for debugging
                if (meetingStartTime && meetingStartTime.timeZone) {
                    console.log(`[MCP Adapter scheduleMeeting] Start time zone: ${meetingStartTime.timeZone}`);
                }
                
                if (meetingEndTime && meetingEndTime.timeZone) {
                    console.log(`[MCP Adapter scheduleMeeting] End time zone: ${meetingEndTime.timeZone}`);
                }
                
                if (transformedParams.timeZone) {
                    console.log(`[MCP Adapter scheduleMeeting] Default time zone: ${transformedParams.timeZone}`);
                }
                
                // Transform parameters to match what the calendar controller expects
                apiData = {
                    // Required parameters
                    subject: transformedParams.subject,
                    attendees: transformAttendees(transformedParams.attendees) || [],
                    // Use the extracted start and end times
                    start: meetingStartTime ? transformDateTime(meetingStartTime, transformedParams.timeZone) : undefined,
                    end: meetingEndTime ? transformDateTime(meetingEndTime, transformedParams.timeZone) : undefined,
                    // Optional parameters
                    location: transformedParams.location,
                    body: transformedParams.body,
                    isOnlineMeeting: transformedParams.isOnlineMeeting
                };
                // Log the API call for debugging
                logDebug(`[MCP Adapter] Making POST request to ${apiPath} with data:`, apiData);
                break;
            case 'calendar.getRooms':
                apiPath = '/v1/calendar/rooms';
                apiMethod = 'GET';
                break;
            case 'calendar.getCalendars':
                apiPath = '/v1/calendar/calendars';
                apiMethod = 'GET';
                break;
            case 'calendar.addAttachment':
                apiPath = `/v1/calendar/events/${params.eventId}/attachments`;
                apiMethod = 'POST';
                apiData = params.attachment;
                break;
            case 'calendar.removeAttachment':
                apiPath = `/v1/calendar/events/${params.eventId}/attachments/${params.attachmentId}`;
                apiMethod = 'DELETE';
                break;

            // Files module endpoints
            case 'files.listFiles':
                apiPath = '/v1/files';
                apiMethod = 'GET';
                break;
            case 'files.searchFiles':
                apiPath = '/v1/files/search';
                apiMethod = 'GET';
                break;
            case 'files.downloadFile':
                apiPath = '/v1/files/download';
                apiMethod = 'GET';
                break;
            case 'files.uploadFile':
                apiPath = '/v1/files/upload';
                apiMethod = 'POST';
                apiData = params;
                break;
            case 'files.getFileMetadata':
                apiPath = '/v1/files/metadata';
                apiMethod = 'GET';
                break;
            case 'files.createSharingLink':
                apiPath = '/v1/files/share';
                apiMethod = 'POST';
                apiData = params;
                break;
            case 'files.getSharingLinks':
                apiPath = '/v1/files/sharing';
                apiMethod = 'GET';
                break;
            case 'files.removeSharingPermission':
                apiPath = '/v1/files/sharing/remove';
                apiMethod = 'POST';
                apiData = params;
                break;
            case 'files.getFileContent':
                apiPath = '/v1/files/content';
                apiMethod = 'GET';
                break;
            case 'files.setFileContent':
                apiPath = '/v1/files/content';
                apiMethod = 'POST';
                apiData = params;
                break;
            case 'files.updateFileContent':
                apiPath = '/v1/files/content/update';
                apiMethod = 'POST';
                apiData = params;
                break;

            // People module endpoints
            case 'people.getRelevantPeople':
                apiPath = '/v1/people';
                apiMethod = 'GET';
                // Map any limit parameter correctly
                if (params.limit) {
                    params.limit = parseInt(params.limit, 10);
                }
                break;
            case 'people.searchPeople':
            case 'people.search':
                apiPath = '/v1/people/search';
                apiMethod = 'GET';
                // Make sure query parameter is preserved
                if (!params.query && params.q) {
                    params.query = params.q;
                    // Remove the q param to avoid confusion
                    delete params.q;
                }
                break;
            case 'people.findPeople':
            case 'people.find':
                apiPath = '/v1/people/find';
                apiMethod = 'GET';
                // Make sure query parameter is preserved
                if (!params.query && params.q) {
                    params.query = params.q;
                    // Remove the q param to avoid confusion
                    delete params.q;
                }
                // Ensure limit is parsed as integer
                if (params.limit) {
                    params.limit = parseInt(params.limit, 10);
                }
                break;
            case 'people.getPersonById':
                apiPath = `/v1/people/${params.id}`;
                apiMethod = 'GET';
                break;

            // System endpoints
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
                // Special handling for complex objects and arrays to prevent [object Object] in URLs
                if (typeof value === 'object' && value !== null) {
                    continue; // Skip adding complex objects to query params
                } else {
                    queryParams.append(key, value);
                }
            }
            
            if (queryParams.toString()) {
                apiPath += `?${queryParams.toString()}`;
            }
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

        // TODO: [Streaming] Handle streaming responses if API supports it (e.g., for file downloads) (MEDIUM)

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

// Helper function to handle calendar timeframe conversion
function processCalendarTimeframe(toolArgs) {
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
    return {
        ...toolArgs,
        start,
        end
    };
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
        
        logDebug(`[MCP Adapter] Handling tool call: ${toolName}`);
        
        // Special handling for calendar date ranges
        if ((toolName === 'getEvents' || toolName === 'getCalendar') && toolArgs.timeframe) {
            toolArgs = processCalendarTimeframe(toolArgs);
        }
        
        // First try to use the toolsService to map and transform the parameters
        const { mapping, params } = toolsService.transformToolParameters(toolName, toolArgs);
        
        if (mapping) {
            logDebug(`[MCP Adapter] Using tools service mapping: ${toolName} -> ${mapping.moduleName}.${mapping.methodName}`);
            return await executeModuleMethod(mapping.moduleName, mapping.methodName, params);
        }
        
        // If tools service can't map it, try the API approach
        try {
            const toolsResponse = await callApi('GET', '/tools');
            if (toolsResponse && Array.isArray(toolsResponse.tools)) {
                // Find the tool definition
                const toolDef = toolsResponse.tools.find(tool => tool.name === toolName);
                if (toolDef) {
                    // Extract module and method from endpoint
                    // Example: /api/v1/mail/send -> mail.sendEmail
                    const path = toolDef.endpoint.replace('/api/v1/', '');
                    const parts = path.split('/');

                    if (parts.length > 0) {
                        const moduleName = parts[0];
                        let methodName = parts.length > 1 ? parts[1] : 'get' + moduleName.charAt(0).toUpperCase() + moduleName.slice(1);

                        // Special case mappings
                        const methodMappings = {
                            'mail': { '': 'getInbox' },
                            'calendar': { '': 'getEvents' },
                            'files': { '': 'listFiles' },
                            'people': { '': 'getRelevantPeople' }
                        };

                        if (parts.length === 1 && methodMappings[moduleName] && methodMappings[moduleName]['']) {
                            methodName = methodMappings[moduleName][''];
                        }

                        logDebug(`[MCP Adapter] Using API mapping: ${toolName} -> ${moduleName}.${methodName}`);
                        return await executeModuleMethod(moduleName, methodName, toolArgs);
                    }
                }
            }
        } catch (error) {
            // If API call fails, log the error
            logDebug(`[MCP Adapter] Failed to get tool mapping from API: ${error.message}`);
        }
        
        // If we get here, we couldn't map the tool
        logDebug(`[MCP Adapter] Could not map tool: ${toolName}`);
        return { error: `Unknown tool: ${toolName}` };
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
                // Try to get tools list from the API first, then fallback to tools service if needed
                try {
                    logDebug('[MCP Adapter] Getting tools list from API');
                    const toolsResult = await callApi('GET', '/tools');

                    if (!toolsResult || !toolsResult.tools) {
                        logDebug('[MCP Adapter] API returned invalid tools list, falling back to tools service');
                        
                        // Use the tools service to get the tools list
                        const toolsFromService = toolsService.getAllTools();
                        
                        if (toolsFromService && toolsFromService.length > 0) {
                            // Format tools for MCP response
                            const mcpTools = toolsFromService.map(tool => ({
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
                        } else {
                            // If tools service also fails, return empty list
                            result = {
                                protocolVersion: (params && params.protocolVersion) ? params.protocolVersion : "2024-11-05",
                                tools: []
                            };
                        }
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
                    logDebug('[MCP Adapter] Falling back to tools service');
                    
                    // Use the tools service as fallback
                    try {
                        const toolsFromService = toolsService.getAllTools();
                        
                        if (toolsFromService && toolsFromService.length > 0) {
                            // Format tools for MCP response
                            const mcpTools = toolsFromService.map(tool => ({
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
                        } else {
                            // If tools service also fails, return empty list
                            result = {
                                protocolVersion: (params && params.protocolVersion) ? params.protocolVersion : "2024-11-05",
                                tools: []
                            };
                        }
                    } catch (serviceError) {
                        logDebug('[MCP Adapter] Error getting tools from service:', serviceError.message);
                        // Final fallback - empty list
                        result = {
                            protocolVersion: (params && params.protocolVersion) ? params.protocolVersion : "2024-11-05",
                            tools: []
                        };
                    }
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

// Helper: handle core requests (manifest, listResources)
async function _handleCoreRequest(coreMethodName, requestId, coreParams = {}) {
    logDebug(`[MCP Adapter] Handling core request: ${coreMethodName}`);
    try {
        const hasAccess = await checkModuleAccess();
        if (!hasAccess) {
            sendResponse(requestId, null, createJsonRpcError(-32001, 'Access Denied', 'Backend or modules unavailable.'));
            return;
        }
        const result = await executeModuleMethod('core', coreMethodName, coreParams);
        sendResponse(requestId, result);
    } catch (error) { 
        logDebug(`[MCP Adapter] Error handling ${coreMethodName}:`, error);
        sendResponse(requestId, null, createJsonRpcError(-32603, 'Internal Error', `Error handling ${coreMethodName}: ${error.message}`));
    }
}

// Initialize: check backend API availability
async function initialize() {
    // Allow skipping initialization for specific test environments
    if (process.env.MCP_SKIP_INIT === 'true') {
        logDebug('[MCP Adapter] Skipping initialization due to MCP_SKIP_INIT flag.');
        adapterState.initialized = true; // Mark as initialized to avoid re-triggering
        adapterState.backendAvailable = true; // Assume available for tests
        return Promise.resolve(true);
    }

    logDebug('[MCP Adapter] Initializing (API isolation approach)...');
    const ok = await initializeAdapter();
    if (!ok) {
        logDebug('[MCP Adapter] Initialization failed: Backend API not available.');
    } else {
        logDebug('[MCP Adapter] Initialization successful: Backend API available.');
    }
    return Promise.resolve(ok);
}

// Graceful shutdown
async function shutdown() {
    logDebug('[MCP Adapter] Shutting down...');
    if (healthCheckInterval) {
        clearInterval(healthCheckInterval);
        healthCheckInterval = null;
        logDebug('[MCP Adapter] Health check interval cleared.');
    }
    // TODO: [Cleanup] Add any other necessary cleanup (e.g., close connections) (LOW)
}

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
    shutdown().then(() => process.exit(0));
});

process.on('SIGTERM', () => {
    logDebug('[MCP Adapter] Received SIGTERM. Exiting.');
    shutdown().then(() => process.exit(0));
});

// Properly apply the console monkey-patching to ensure no logs go to stdout
console.log = (...args) => writeToLogFile('log', ...args);
console.debug = (...args) => writeToLogFile('debug', ...args);
console.info = (...args) => writeToLogFile('info', ...args);
console.warn = (...args) => writeToLogFile('warn', ...args);
console.error = (...args) => writeToLogFile('error', ...args);

// Run initialization (proxy approach)
initialize();
