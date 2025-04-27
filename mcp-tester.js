/**
 * MCP Tester
 * 
 * A simple tool to test the MCP adapter and validate the flow from dev-server.cjs
 * to mcp-adapter.cjs, ensuring proper MCP protocol compliance.
 */

const { spawn } = require('child_process');
const readline = require('readline');
const path = require('path');

// Configuration
const MCP_ADAPTER_PATH = path.join(__dirname, 'mcp-adapter.cjs');

// JSON-RPC helper functions
let requestId = 1;
let mcpProcess = null;
let responseHandlers = new Map();

function createJsonRpcRequest(method, params = {}) {
  return {
    jsonrpc: '2.0',
    id: requestId++,
    method,
    params
  };
}

function startMcpAdapter() {
  return new Promise((resolve, reject) => {
    console.log(`Starting MCP adapter from: ${MCP_ADAPTER_PATH}`);
    
    mcpProcess = spawn('node', [MCP_ADAPTER_PATH]);
    
    // Create readline interface for stdout
    const rl = readline.createInterface({
      input: mcpProcess.stdout,
      crlfDelay: Infinity
    });
    
    // Listen for JSON-RPC responses
    rl.on('line', (line) => {
      try {
        // Only process lines that look like JSON
        if (line.trim().startsWith('{') && line.trim().endsWith('}')) {
          const response = JSON.parse(line);
          
          // Handle response if it has an id
          if (response.id && responseHandlers.has(response.id)) {
            const handler = responseHandlers.get(response.id);
            responseHandlers.delete(response.id);
            handler.resolve(response);
          }
        }
      } catch (error) {
        console.log('Non-JSON line from adapter:', line);
      }
    });
    
    // Handle stderr for debugging
    mcpProcess.stderr.on('data', (data) => {
      console.log(`MCP Adapter stderr: ${data}`);
    });
    
    // Handle process exit
    mcpProcess.on('close', (code) => {
      if (code !== 0) {
        console.log(`MCP Adapter process exited with code ${code}`);
      }
    });
    
    // Give the adapter a moment to initialize
    setTimeout(() => {
      resolve();
    }, 1000);
  });
}

function sendRequest(request) {
  return new Promise((resolve, reject) => {
    if (!mcpProcess || mcpProcess.killed) {
      reject(new Error('MCP Adapter process is not running'));
      return;
    }
    
    // Register response handler
    responseHandlers.set(request.id, { resolve, reject });
    
    // Send request to stdin of the adapter
    const requestStr = JSON.stringify(request) + '\n';
    mcpProcess.stdin.write(requestStr);
    
    // Set timeout for response
    setTimeout(() => {
      if (responseHandlers.has(request.id)) {
        responseHandlers.delete(request.id);
        reject(new Error('Request timed out'));
      }
    }, 10000); // 10 second timeout
  });
}

// MCP protocol methods
async function getManifest() {
  console.log('\n📋 Requesting MCP manifest...');
  const request = createJsonRpcRequest('getManifest', { protocolVersion: '2024-11-05' });
  const response = await sendRequest(request);
  
  if (response.error) {
    console.error('❌ Error getting manifest:', response.error);
    return null;
  }
  
  console.log('✅ Received MCP manifest:');
  console.log(JSON.stringify(response.result, null, 2));
  return response.result;
}

async function listTools() {
  console.log('\n🔧 Requesting tool list...');
  const request = createJsonRpcRequest('tools/list');
  const response = await sendRequest(request);
  
  if (response.error) {
    console.error('❌ Error listing tools:', response.error);
    return [];
  }
  
  console.log(`✅ Found ${response.result.tools.length} tools`);
  return response.result.tools;
}

async function validateTools(tools) {
  console.log('\n🔍 Validating tool definitions against MCP specification...');
  
  if (!tools || tools.length === 0) {
    console.log('❌ No tools found to validate');
    return false;
  }
  
  let isValid = true;
  let validCount = 0;
  
  for (const tool of tools) {
    console.log(`\nValidating tool: ${tool.name}`);
    
    // Check required fields
    if (!tool.name) {
      console.error('❌ Missing required field: name');
      isValid = false;
      continue;
    }
    
    if (!tool.inputSchema) {
      console.error('❌ Missing required field: inputSchema');
      isValid = false;
      continue;
    }
    
    // Check inputSchema structure
    if (tool.inputSchema.type !== 'object') {
      console.error('❌ inputSchema must have type: "object"');
      isValid = false;
      continue;
    }
    
    if (!tool.inputSchema.properties) {
      console.error('❌ inputSchema must have properties object');
      isValid = false;
      continue;
    }
    
    // Check optional fields
    if (tool.annotations) {
      console.log('  ✓ Has annotations');
      
      // Validate annotation fields
      const validAnnotations = ['title', 'readOnlyHint', 'destructiveHint', 'idempotentHint', 'openWorldHint'];
      const invalidAnnotations = Object.keys(tool.annotations).filter(key => !validAnnotations.includes(key));
      
      if (invalidAnnotations.length > 0) {
        console.warn(`  ⚠️ Contains invalid annotation fields: ${invalidAnnotations.join(', ')}`);
      }
    }
    
    console.log('  ✅ Tool definition is valid');
    validCount++;
  }
  
  console.log(`\n📊 Validation summary: ${validCount}/${tools.length} tools are valid`);
  return isValid;
}

async function callTool(toolName, args) {
  console.log(`\n🚀 Calling tool: ${toolName}`);
  const request = createJsonRpcRequest('tools/call', {
    name: toolName,
    arguments: args
  });
  
  const response = await sendRequest(request);
  
  if (response.error) {
    console.error('❌ Error calling tool:', response.error);
    return null;
  }
  
  console.log('✅ Tool call successful:');
  console.log(JSON.stringify(response.result, null, 2));
  return response.result;
}

// Interactive menu
function createMenu() {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return {
    showMainMenu: async function() {
      console.log('
=== MCP Tester Menu ===');
      console.log('1. Get MCP Manifest');
      console.log('2. List and Validate Tools');
      console.log('3. Test Tool Call (getMail)');
      console.log('4. Test Tool Call (getCalendar)');
      console.log('5. Exit');
      
      const answer = await new Promise(resolve => {
        rl.question('
Select an option (1-5): ', resolve);
      });
      
      switch (answer) {
        case '1':
          await getManifest();
          await this.showMainMenu();
          break;
        case '2':
          const tools = await listTools();
          console.log('
Tool list:');
          if (tools && tools.length > 0) {
            tools.forEach((tool, index) => {
              console.log(`${index + 1}. ${tool.name}: ${tool.description || 'No description'}`);
            });
            await validateTools(tools);
          } else {
            console.log('No tools found or error occurred');
          }
          await this.showMainMenu();
          break;
        case '3':
          await callTool('getMail', { limit: 5 });
          await this.showMainMenu();
          break;
        case '4':
          await callTool('getCalendar', { limit: 5 });
          await this.showMainMenu();
          break;
        case '5':
          console.log('
Exiting MCP Tester. Goodbye!');
          if (mcpProcess && !mcpProcess.killed) {
            console.log('Terminating MCP adapter process...');
            mcpProcess.kill();
          }
          rl.close();
          setTimeout(() => process.exit(0), 500); // Give time for process to clean up
          break;
        default:
          console.log('
Invalid option. Please try again.');
          await this.showMainMenu();
      }
    },
    close: function() {
      if (mcpProcess && !mcpProcess.killed) {
        mcpProcess.kill();
      }
      rl.close();
    }
  };
}

// Main function
async function main() {
  console.log('=== MCP Adapter Tester ===');
  console.log(`Starting MCP adapter from: ${MCP_ADAPTER_PATH}`);
  
  try {
    // Start the MCP adapter as a child process
    await startMcpAdapter();
    
    // Check if MCP adapter is responding
    const manifest = await getManifest();
    if (!manifest) {
      console.error('\n\u274c Could not get manifest from MCP adapter.');
      if (mcpProcess) mcpProcess.kill();
      process.exit(1);
    }
    
    // Show interactive menu
    const menu = createMenu();
    await menu.showMainMenu();
  } catch (error) {
    console.error('\n\u274c Error:', error.message);
    if (mcpProcess) mcpProcess.kill();
    process.exit(1);
  }
}

// Run the main function
main();
