/**
 * @fileoverview End-to-end tests for the MCP adapter.
 * These tests verify that the MCP adapter properly handles Claude Desktop requests.
 */

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');
const fs = require('fs');

const MCP_ADAPTER_PATH = path.join(__dirname, '../../mcp-adapter.cjs');

// Utility to create JSON-RPC requests
function createJsonRpcRequest(method, params = {}, id = 1) {
  return {
    jsonrpc: '2.0',
    id,
    method,
    params
  };
}

// Utility to send requests to MCP adapter and get responses
async function sendRequestToAdapter(mcpProcess, request, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    let responseReceived = false;
    
    // Set up response listener
    const rl = readline.createInterface({
      input: mcpProcess.stdout,
      crlfDelay: Infinity
    });
    
    const responseHandler = (line) => {
      try {
        if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
          const response = JSON.parse(line);
          if (response.id === request.id) {
            responseReceived = true;
            rl.close();
            resolve(response);
          }
        }
      } catch (error) {
        // Not JSON or not the response we're waiting for
      }
    };
    
    rl.on('line', responseHandler);
    
    // Send the request
    const requestStr = JSON.stringify(request) + '\n';
    mcpProcess.stdin.write(requestStr);
    
    // Set timeout
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        rl.close();
        reject(new Error(`Request timed out after ${timeoutMs}ms`));
      }
    }, timeoutMs);
    
    // Clean up on response
    rl.on('close', () => {
      clearTimeout(timeout);
    });
  });
}

describe('MCP Adapter E2E', () => {
  let mcpProcess;
  
  beforeEach(() => {
    // Start the MCP adapter process before each test
    mcpProcess = spawn('node', [MCP_ADAPTER_PATH]);
    
    // Log any stderr output for debugging
    mcpProcess.stderr.on('data', (data) => {
      console.log(`[MCP Adapter stderr]: ${data}`);
    });
  });
  
  afterEach(() => {
    // Kill the process after each test
    if (mcpProcess && !mcpProcess.killed) {
      mcpProcess.kill();
    }
  });
  
  test('should respond to initialize request with proper protocol version', async () => {
    const initRequest = createJsonRpcRequest('initialize', {
      protocolVersion: '2024-11-05'
    });
    
    const response = await sendRequestToAdapter(mcpProcess, initRequest);
    
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 1);
    expect(response.result).toHaveProperty('protocolVersion', '2024-11-05');
    expect(response.result).toHaveProperty('capabilities.toolInvocation', true);
    expect(response.result).toHaveProperty('capabilities.manifest', true);
    expect(response.result).toHaveProperty('serverInfo.name');
  });
  
  test('should respond to tools/list with valid tools array', async () => {
    // First initialize
    const initRequest = createJsonRpcRequest('initialize', {
      protocolVersion: '2024-11-05'
    }, 1);
    await sendRequestToAdapter(mcpProcess, initRequest);
    
    // Then request tools list
    const toolsRequest = createJsonRpcRequest('tools/list', {}, 2);
    const response = await sendRequestToAdapter(mcpProcess, toolsRequest);
    
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 2);
    expect(response.result).toHaveProperty('tools');
    expect(Array.isArray(response.result.tools)).toBe(true);
    
    // Verify we have essential tools
    const toolNames = response.result.tools.map(t => t.name);
    expect(toolNames).toContain('findPeople');
    expect(toolNames).toContain('createEvent');
  });
  
  // Test findPeople tool which is used in the lunch booking scenario
  test('findPeople tool should accept query parameter', async () => {
    // Initialize first
    await sendRequestToAdapter(mcpProcess, createJsonRpcRequest('initialize', {
      protocolVersion: '2024-11-05'
    }, 1));
    
    // Call the findPeople tool
    const findPeopleRequest = createJsonRpcRequest('tools/call', {
      name: 'findPeople',
      arguments: {
        query: 'Allan'
      }
    }, 2);
    
    const response = await sendRequestToAdapter(mcpProcess, findPeopleRequest, 10000);
    
    expect(response).toHaveProperty('jsonrpc', '2.0');
    expect(response).toHaveProperty('id', 2);
    expect(response).toHaveProperty('result.content');
    expect(Array.isArray(response.result.content)).toBe(true);
    expect(response.result.content[0]).toHaveProperty('type', 'text');
    
    // The result should be parseable as JSON
    const contentText = response.result.content[0].text;
    expect(() => JSON.parse(contentText)).not.toThrow();
  });
  
  // Test booking lunch scenario
  test('should handle lunch booking scenario', async () => {
    // Skip this test in CI environments without proper auth
    if (process.env.CI) {
      console.log('Skipping lunch booking test in CI environment');
      return;
    }
    
    // Initialize first
    await sendRequestToAdapter(mcpProcess, createJsonRpcRequest('initialize', {
      protocolVersion: '2024-11-05'
    }, 1));
    
    // 1. Call findPeople to find Allan
    const findPeopleRequest = createJsonRpcRequest('tools/call', {
      name: 'findPeople',
      arguments: {
        query: 'Allan'
      }
    }, 2);
    
    const findPeopleResponse = await sendRequestToAdapter(mcpProcess, findPeopleRequest, 10000);
    const peopleResultText = findPeopleResponse.result.content[0].text;
    let allanEmail = 'AllanD@M365x28827508.OnMicrosoft.com'; // Default if not found
    
    try {
      const peopleResult = JSON.parse(peopleResultText);
      if (peopleResult.people && peopleResult.people.length > 0) {
        allanEmail = peopleResult.people[0].email || allanEmail;
      }
    } catch (e) {
      console.log('Error parsing people result:', e);
    }
    
    // 2. Create lunch event
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(12, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrow);
    tomorrowEnd.setHours(13, 0, 0, 0);
    
    const createEventRequest = createJsonRpcRequest('tools/call', {
      name: 'createEvent',
      arguments: {
        subject: 'Lunch with Allan',
        start: {
          dateTime: tomorrow.toISOString(),
          timeZone: 'Pacific Standard Time'
        },
        end: {
          dateTime: tomorrowEnd.toISOString(),
          timeZone: 'Pacific Standard Time'
        },
        location: 'Restaurant',
        body: 'Lunch meeting',
        attendees: [
          { emailAddress: { address: allanEmail } }
        ]
      }
    }, 3);
    
    const createEventResponse = await sendRequestToAdapter(mcpProcess, createEventRequest, 10000);
    expect(createEventResponse).toHaveProperty('jsonrpc', '2.0');
    expect(createEventResponse).toHaveProperty('id', 3);
    expect(createEventResponse).toHaveProperty('result.content');
    expect(createEventResponse.result.isError).toBe(false);
  });
});