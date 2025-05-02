const createToolsService = require('./src/core/tools-service.cjs');

// Mock adapter state
const adapterState = {
  initialized: true,
  lastActivity: Date.now(),
  backendAvailable: true
};

// Create a stub module registry with test modules
const stubModuleRegistry = {
  getAllModules: () => [
    { id: 'mail', name: 'mail', capabilities: ['getInbox', 'sendEmail', 'searchEmails'] },
    { id: 'calendar', name: 'calendar', capabilities: ['getEvents', 'create', 'scheduleMeeting'] },
    { id: 'people', name: 'people', capabilities: ['find', 'searchPeople'] }
  ],
  getModule: (moduleName) => {
    const modules = {
      'mail': { id: 'mail', capabilities: ['getInbox', 'sendEmail', 'searchEmails'] },
      'calendar': { id: 'calendar', capabilities: ['getEvents', 'create', 'scheduleMeeting'] },
      'people': { id: 'people', capabilities: ['find', 'searchPeople'] }
    };
    return modules[moduleName] || null;
  }
};

// Create the tools service
const toolsService = createToolsService({
  moduleRegistry: stubModuleRegistry,
  logger: { 
    debug: (msg) => console.log('[DEBUG]', msg),
    info: (msg) => console.log('[INFO]', msg),
    warn: (msg) => console.log('[WARN]', msg),
    error: (msg) => console.log('[ERROR]', msg)
  }
});

// Mock executeModuleMethod function
async function executeModuleMethod(moduleName, methodName, params) {
  console.log(`Executing module method: ${moduleName}.${methodName} with params:`, JSON.stringify(params, null, 2));
  return { success: true, result: 'Mock result' };
}

// Simplified handleToolCall similar to the adapter's implementation
async function handleToolCall(toolName, toolArgs) {
  console.log(`[TEST] Handling tool call: ${toolName}`);
  
  // First try to use the toolsService to map and transform parameters
  const { mapping, params } = toolsService.transformToolParameters(toolName, toolArgs);
  
  if (mapping) {
    console.log(`[TEST] Using tools service mapping: ${toolName} -> ${mapping.moduleName}.${mapping.methodName}`);
    return await executeModuleMethod(mapping.moduleName, mapping.methodName, params);
  }
  
  console.log('[TEST] Could not map tool');
  return { error: `Unknown tool: ${toolName}` };
}

// Test cases
async function runTests() {
  console.log('TEST 1: Basic mail tool');
  const result1 = await handleToolCall('getMail', { limit: 10 });
  console.log('Result:', JSON.stringify(result1, null, 2));
  
  console.log('\nTEST 2: Calendar tool with parameter transformation');
  const result2 = await handleToolCall('scheduleMeeting', {
    subject: 'Important Meeting',
    attendees: 'john@example.com,jane@example.com',
    start: '2025-03-15T10:00:00',
    end: '2025-03-15T11:00:00',
    location: 'Conference Room A',
    isOnlineMeeting: true
  });
  console.log('Result:', JSON.stringify(result2, null, 2));
  
  console.log('\nTEST 3: Unknown tool');
  const result3 = await handleToolCall('nonExistentTool', { some: 'param' });
  console.log('Result:', JSON.stringify(result3, null, 2));
}

runTests().catch(console.error);