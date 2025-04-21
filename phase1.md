# MCP Project: Phase 1 (MVP) Implementation Checklist

This document outlines all tasks for Phase 1, their testing criteria, and definition of success.

## Project Setup

### 1. Project Structure

- **File Summary**: Set up the basic directory structure that will organize all project files.
- [x] Create main directory structure (src, test, config)
- [x] Set up src subdirectories (main, core, api, graph, modules, nlu, utils, renderer)
- [x] Initialize git repository with .gitignore
- [x] Create README.md with project overview
- **Test**: Verify directory structure matches specification
- **Success Criteria**: All directories exist and follow the specified pattern
- **Memory Update**: Document directory structure and purpose of each folder

### Directory Structure & Purpose
- `src/` - Application source code
  - `main/` - Electron main process
  - `core/` - Core services (auth, cache, error, monitoring, storage, etc.)
  - `api/` - Local API server (Express)
  - `graph/` - Microsoft Graph integration
  - `modules/` - Functional modules (mail, calendar, files)
  - `nlu/` - Natural language understanding
  - `utils/` - Utilities and validation schemas
  - `renderer/` - Electron renderer (UI)
- `test/` - Unit, integration, and E2E tests
- `config/` - Build and tooling configuration

### 2. Package Configuration

- **File Summary**: `package.json` - Defines project dependencies, scripts, and metadata.
- [x] Create package.json with project details
- [x] Configure build scripts
- [x] Add development dependencies
- [x] Configure electron-builder
- [x] Set up minimal electron-builder configuration
- [x] Set up ESLint and Prettier
- **Test**: Run `npm install` and verify all dependencies install correctly
- **Success Criteria**: All scripts run without errors
- **Memory Update**: Document available npm scripts and their purposes

### Linting & Formatting
- `standard` is used for linting and formatting JavaScript code.
- The `lint` script (`npm run lint`) runs Standard, which checks and auto-formats code style.
- No separate Prettier config is needed for Phase 1 as Standard covers formatting.

### Electron Builder Config
- `appId`: com.microsoft.mcpdesktop
- `productName`: MCP Desktop
- `directories.buildResources`: build assets directory
- `directories.output`: build output directory (dist)
- `files`: includes src and package.json
- `mac`, `win`, `linux`: platform targets for packaging

This config allows packaging for all major platforms as required.

### DevDependencies & Purpose
- `electron`: Electron runtime for desktop app
- `electron-builder`: Packaging/building Electron apps
- `standard`: JavaScript linter/formatter
- `jest`: Test framework for unit/integration tests
- `nodemon`: Auto-reloads Electron for development

All required build, dev, test, and lint scripts are present in package.json and match the project architecture requirements.

### NPM Scripts & Purpose
- `start`: Launches the Electron app
- `dev`: Runs Electron with nodemon, watching src for changes (development mode)
- `test`: Runs Jest test suite
- `lint`: Runs StandardJS linter
- `build`: Builds the Electron app using electron-builder

### 3. Configuration System

- **File Summary**: `src/config/index.js` - Manages application configuration from multiple sources.
- [x] Create configuration schema
- [x] Implement environment variable loading
- [x] Add defaults for all configuration values
- [x] Create config validation
- [x] Implement secure storage for sensitive config
- **Test**: Load app with different environment configurations
- **Success Criteria**: Config loads correctly, validates inputs, and merges sources
- **Memory Update**: Document configuration options and how to modify them

### Configuration System
- Config is loaded asynchronously from environment variables, `.env` file (if present), and secure storage (keytar).
- Validation and defaults are enforced using Joi schemas.
- Sensitive secrets (e.g., MICROSOFT_CLIENT_SECRET) are stored/retrieved via keytar.
- To modify config, set environment variables, edit `.env`, or update secrets in keytar.
- Use the exported async `getConfig()` from `src/config/index.js` to access validated config in your modules.
- All config operations are async and non-blocking, following project rules.

#### Example usage:
```js
const { getConfig } = require('../config');
(async () => {
  const config = await getConfig();
  // use config.PORT, config.MICROSOFT_CLIENT_ID, etc.
})();
```

#### Supported config options:
- `PORT` (number, default: 3000)
- `NODE_ENV` (development/production/test, default: development)
- `LOG_LEVEL` (info/warn/error/debug, default: info)
- `CACHE_TTL` (seconds, default: 3600)
- `MICROSOFT_CLIENT_ID` (required)
- `MICROSOFT_TENANT_ID` (required)
- `MICROSOFT_REDIRECT_URI` (default: http://localhost:3000/auth/callback)
- `MICROSOFT_CLIENT_SECRET` (from keytar, optional)

## Core Services

### 4. Error Service

- **File Summary**: `src/core/error-service.js` - Provides standardized error creation and handling.
- [x] Define error categories and severity levels
- [ ] Implement createError function
- [ ] Add context sanitization to remove sensitive data
- [ ] Create API-friendly error responses
- [ ] Implement error logging integration
- **Test**: Create errors of different types and verify format

#### Error Categories & Severities
- Categories: `auth`, `graph`, `api`, `database`, `module`, `nlu`, `system`
- Severities: `info`, `warning`, `error`, `critical`
- Exported as constants from `src/core/error-service.js` for use throughout the application.

```javascript
// Test: Error Creation
const error = ErrorService.createError('auth', 'Authentication failed', 'error', { userId: 'testUser' });
expect(error).toHaveProperty('id');
expect(error).toHaveProperty('category', 'auth');
expect(error).toHaveProperty('message', 'Authentication failed');
expect(error).toHaveProperty('severity', 'error');
expect(error.context).toHaveProperty('userId', 'testUser');
```

- **Success Criteria**: Errors correctly categorized, sensitive data redacted, standardized format
- **Memory Update**: Document error categories, severity levels, and usage patterns

### 5. Monitoring Service

- **File Summary**: `src/core/monitoring-service.js` - Handles logging, metrics, and monitoring.
- [ ] Set up Winston logger
- [ ] Create logging levels (debug, info, warn, error, critical)
- [ ] Implement log rotation for file logging
- [ ] Add context enrichment for logs
- [ ] Create performance metric tracking
- **Test**: Generate logs at different levels and check output

```javascript
// Test: Log Generation
MonitoringService.info('User logged in', { userId: 'testUser' });
// Verify log file contains entry with correct level, message and context
const logContents = fs.readFileSync(LOG_FILE_PATH, 'utf8');
expect(logContents).toContain('info');
expect(logContents).toContain('User logged in');
expect(logContents).toContain('testUser');
```

- **Success Criteria**: Logs correctly written with appropriate levels and context
- **Memory Update**: Document logging patterns and available methods

### 6. Cache Service

- **File Summary**: `src/core/cache-service.js` - Provides in-memory caching with TTL support.
- [ ] Implement in-memory Map for cache storage
- [ ] Create get/set methods with TTL support
- [ ] Add cache invalidation by key or pattern
- [ ] Implement automatic cleanup of expired items
- [ ] Add cache statistics/monitoring
- **Test**: Store and retrieve items with different TTLs

```javascript
// Test: Cache Expiration
await cacheService.set('test-key', { value: 'test-data' }, 1); // 1 second TTL
const immediate = await cacheService.get('test-key');
expect(immediate).toEqual({ value: 'test-data' });

// Wait for expiration
await new Promise(resolve => setTimeout(resolve, 1100));
const expired = await cacheService.get('test-key');
expect(expired).toBeNull();
```

- **Success Criteria**: Cache correctly stores, retrieves, and expires items
- **Memory Update**: Document cache service methods and TTL strategy

### 7. Event Service

- **File Summary**: `src/core/event-service.js` - Manages event-based communication between components.
- [ ] Create event subscription mechanism
- [ ] Implement event emission
- [ ] Add support for event filtering
- [ ] Create one-time event listeners
- [ ] Implement unsubscribe functionality
- **Test**: Subscribe to events and verify callbacks are triggered

```javascript
// Test: Event Emission
const handler = jest.fn();
const subscriptionId = await eventService.subscribe('test-event', handler);

await eventService.emit('test-event', { data: 'test-payload' });
expect(handler).toHaveBeenCalledWith({ data: 'test-payload' });

// Test unsubscribe
await eventService.unsubscribe(subscriptionId);
await eventService.emit('test-event', { data: 'second-payload' });
expect(handler).toHaveBeenCalledTimes(1); // Still only called once
```

- **Success Criteria**: Events properly emitted and received by subscribers
- **Memory Update**: Document event patterns and subscription methods

### 8. Storage Service

- **File Summary**: `src/core/storage-service.js` - Handles persistent storage using SQLite.
- [ ] Set up SQLite database initialization
- [ ] Create tables for settings and history
- [ ] Implement CRUD operations for settings
- [ ] Add conversation history storage
- [ ] Implement encryption for sensitive data
- **Test**: Store and retrieve different data types

```javascript
// Test: Settings Storage
await storageService.setSetting('theme', 'dark');
const theme = await storageService.getSetting('theme');
expect(theme).toBe('dark');

// Test: Sensitive Data Encryption
await storageService.setSecure('api-key', 'secret-value');
const rawDb = new Database(DB_PATH);
const row = await rawDb.get('SELECT value FROM settings WHERE key = ?', ['api-key']);
expect(row.value).not.toBe('secret-value'); // Should be encrypted
const decrypted = await storageService.getSecure('api-key');
expect(decrypted).toBe('secret-value');
```

- **Success Criteria**: Data persists between app restarts, sensitive data encrypted
- **Memory Update**: Document storage schema and available methods

### 9. Authentication Service

- **File Summary**: `src/core/auth-service.js` - Handles Microsoft authentication via MSAL.
- [ ] Implement MSAL configuration
- [ ] Create login flow with redirect
- [ ] Add token caching mechanism
- [ ] Implement token refresh
- [ ] Create secure token storage
- [ ] Add sign-out functionality
- **Test**: Run authentication flow with test account

```javascript
// Test: Token Acquisition 
// Note: This may require mocking MSAL or integration testing
const authResult = await authService.login();
expect(authResult).toHaveProperty('accessToken');
expect(authResult).toHaveProperty('account');
expect(authResult).toHaveProperty('expiresOn');

// Test: Token Refresh
const token = await authService.getAccessToken();
expect(token).toBeTruthy();
```

- **Success Criteria**: Successfully authenticates with Microsoft account and maintains tokens
- **Memory Update**: Document authentication flow and token management

## Microsoft Graph Integration

### 10. Graph Client Factory

- **File Summary**: `src/graph/graph-client.js` - Creates authenticated Microsoft Graph clients.
- [ ] Implement authenticated client creation
- [ ] Add token acquisition
- [ ] Create retry logic for failed requests
- [ ] Implement request batching helper
- [ ] Add middleware for telemetry
- **Test**: Create Graph client and make a simple API call

```javascript
// Test: Graph Client Creation
const client = await graphClientFactory.createClient();
const profile = await client.api('/me').get();
expect(profile).toHaveProperty('displayName');
expect(profile).toHaveProperty('mail');
```

- **Success Criteria**: Successfully creates authenticated Graph client and makes API calls
- **Memory Update**: Document client creation pattern and available options

### 11. Mail Service

- **File Summary**: `src/graph/mail-service.js` - Handles Microsoft Graph Mail API operations.
- [ ] Implement functions to get emails (inbox, sent, etc.)
- [ ] Add email search functionality
- [ ] Create email sending capabilities
- [ ] Implement email flag/categorization
- [ ] Add attachment handling
- **Test**: Retrieve emails and verify correct format

```javascript
// Test: Email Retrieval
const emails = await mailService.getInbox({ top: 10 });
expect(Array.isArray(emails)).toBe(true);
if (emails.length > 0) {
  expect(emails[0]).toHaveProperty('id');
  expect(emails[0]).toHaveProperty('subject');
  expect(emails[0]).toHaveProperty('from');
}

// Test: Email Search
const searchResults = await mailService.searchEmails('test');
expect(Array.isArray(searchResults)).toBe(true);
```

- **Success Criteria**: Successfully retrieves, searches, and manipulates emails
- **Memory Update**: Document mail service methods and parameters

### 12. Calendar Service

- **File Summary**: `src/graph/calendar-service.js` - Handles Microsoft Graph Calendar API operations.
- [ ] Implement functions to get calendar events
- [ ] Add event creation/updating
- [ ] Create meeting scheduling helpers
- [ ] Implement availability checking
- [ ] Add recurring event support
- **Test**: Retrieve calendar events and verify format

```javascript
// Test: Event Retrieval
const today = new Date();
const tomorrow = new Date(today);
tomorrow.setDate(tomorrow.getDate() + 1);

const events = await calendarService.getEvents(today, tomorrow);
expect(Array.isArray(events)).toBe(true);
if (events.length > 0) {
  expect(events[0]).toHaveProperty('id');
  expect(events[0]).toHaveProperty('subject');
  expect(events[0]).toHaveProperty('start');
  expect(events[0]).toHaveProperty('end');
}

// Test: Finding Available Times
const availableTimes = await calendarService.findAvailableTimes(
  ['test@example.com'], 
  today, 
  tomorrow
);
expect(Array.isArray(availableTimes)).toBe(true);
```

- **Success Criteria**: Successfully retrieves, creates, and manages calendar events
- **Memory Update**: Document calendar service methods and parameters

### 13. Files Service

- **File Summary**: `src/graph/files-service.js` - Handles Microsoft Graph Files API operations.
- [ ] Implement functions to get files and folders
- [ ] Add file search capabilities
- [ ] Create file metadata retrieval
- [ ] Implement file sharing functionality
- [ ] Add file content operations
- **Test**: Retrieve files and verify format

```javascript
// Test: File Retrieval
const files = await filesService.getRecentFiles();
expect(Array.isArray(files)).toBe(true);
if (files.length > 0) {
  expect(files[0]).toHaveProperty('id');
  expect(files[0]).toHaveProperty('name');
  expect(files[0]).toHaveProperty('webUrl');
}

// Test: File Search
const searchResults = await filesService.searchFiles('document');
expect(Array.isArray(searchResults)).toBe(true);
```

- **Success Criteria**: Successfully retrieves, searches, and manages files
- **Memory Update**: Document files service methods and parameters

### 14. Data Normalizers

- **File Summary**: `src/graph/normalizers.js` - Contains functions for normalizing Graph API responses.
- [ ] Create email normalization
- [ ] Implement event normalization
- [ ] Add file normalization
- [ ] Create user profile normalization
- [ ] Implement consistent object patterns
- **Test**: Normalize raw API data and verify structure

```javascript
// Test: Email Normalization
const rawEmail = { /* mock Graph API response */ };
const normalized = normalizeEmail(rawEmail);
expect(normalized).toHaveProperty('id');
expect(normalized).toHaveProperty('subject');
expect(normalized).toHaveProperty('from');
expect(normalized).toHaveProperty('received');
expect(normalized).not.toHaveProperty('body'); // Should be excluded
```

- **Success Criteria**: Successfully transforms raw API responses to clean, consistent objects
- **Memory Update**: Document normalization patterns for each entity type

## Module System

### 15. Module Registry

- **File Summary**: `src/modules/module-registry.js` - Manages the discovery and lifecycle of modules.
- [ ] Create module registration mechanism
- [ ] Implement capability registration
- [ ] Add dynamic module discovery
- [ ] Create intent routing logic
- [ ] Implement module initialization with dependencies
- **Test**: Register test modules and verify discovery

```javascript
// Test: Module Registration
const testModule = {
  id: 'test-module',
  name: 'Test Module',
  capabilities: ['testCapability'],
  init: () => testModule,
  handleIntent: jest.fn()
};

moduleRegistry.registerModule(testModule);
const modules = moduleRegistry.getAllModules();
expect(modules).toContainEqual(testModule);

// Test: Capability Lookup
const capableModules = moduleRegistry.findModulesForIntent('testCapability');
expect(capableModules).toContainEqual(testModule);
```

- **Success Criteria**: Successfully registers, discovers, and initializes modules
- **Memory Update**: Document module registration pattern and module lifecycle

### 16. Mail Module

- **File Summary**: `src/modules/mail/index.js` - Implements mail-related functionality and intent handling.
- [ ] Define module interface and capabilities
- [ ] Implement handlers for mail-related intents
- [ ] Create mail actions (send, read, search)
- [ ] Add normalized response formatting
- [ ] Implement caching strategy
- **Test**: Process mail-related intents and verify responses

```javascript
// Test: Intent Handling
const mailModule = require('../src/modules/mail');
// Initialize with mock services
mailModule.init({
  graphService: mockGraphService,
  cacheService: mockCacheService,
  eventService: mockEventService
});

const response = await mailModule.handleIntent('readMail', { count: 5 }, {});
expect(response).toHaveProperty('type', 'mailList');
expect(response).toHaveProperty('data');
expect(response.data).toHaveProperty('emails');
expect(Array.isArray(response.data.emails)).toBe(true);
```

- **Success Criteria**: Successfully handles mail-related intents and returns structured responses
- **Memory Update**: Document mail module capabilities and supported intents

### 17. Calendar Module

- **File Summary**: `src/modules/calendar/index.js` - Implements calendar-related functionality and intent handling.
- [ ] Define module interface and capabilities
- [ ] Implement handlers for calendar-related intents
- [ ] Create calendar actions (create, find, update)
- [ ] Add scheduling intelligence
- [ ] Implement caching strategy
- **Test**: Process calendar-related intents and verify responses

```javascript
// Test: Intent Handling
const calendarModule = require('../src/modules/calendar');
// Initialize with mock services
calendarModule.init({
  graphService: mockGraphService,
  cacheService: mockCacheService,
  eventService: mockEventService
});

const response = await calendarModule.handleIntent('getUpcomingMeetings', { days: 7 }, {});
expect(response).toHaveProperty('type', 'calendarEvents');
expect(response).toHaveProperty('data');
expect(response.data).toHaveProperty('events');
expect(Array.isArray(response.data.events)).toBe(true);
```

- **Success Criteria**: Successfully handles calendar-related intents and returns structured responses
- **Memory Update**: Document calendar module capabilities and supported intents

### 18. Files Module

- **File Summary**: `src/modules/files/index.js` - Implements file-related functionality and intent handling.
- [ ] Define module interface and capabilities
- [ ] Implement handlers for file-related intents
- [ ] Create file actions (find, open, share)
- [ ] Add document organization
- [ ] Implement caching strategy
- **Test**: Process file-related intents and verify responses

```javascript
// Test: Intent Handling
const filesModule = require('../src/modules/files');
// Initialize with mock services
filesModule.init({
  graphService: mockGraphService,
  cacheService: mockCacheService,
  eventService: mockEventService
});

const response = await filesModule.handleIntent('findDocuments', { 
  documentType: 'presentation',
  topic: 'marketing'
}, {});
expect(response).toHaveProperty('type', 'documentList');
expect(response).toHaveProperty('data');
expect(response.data).toHaveProperty('documents');
expect(Array.isArray(response.data.documents)).toBe(true);
```

- **Success Criteria**: Successfully handles file-related intents and returns structured responses
- **Memory Update**: Document files module capabilities and supported intents

## NLU Integration

### 19. LLM Service

- **File Summary**: `src/nlu/llm-service.js` - Integrates with external LLMs (Claude/OpenAI).
- [ ] Implement provider-agnostic interface
- [ ] Add Claude API integration
- [ ] Create OpenAI API integration
- [ ] Implement prompt management
- [ ] Add response parsing
- **Test**: Send test prompts to LLM and verify responses

```javascript
// Test: LLM Completion
const prompt = "Extract the intent from this query: 'Show me my recent emails'";
const response = await llmService.completePrompt(prompt);
expect(response).toBeTruthy();
expect(typeof response).toBe('string');

// Test: Provider Switching
process.env.LLM_PROVIDER = 'claude';
const claudeResponse = await llmService.completePrompt(prompt);
expect(claudeResponse).toBeTruthy();

process.env.LLM_PROVIDER = 'openai';
const openaiResponse = await llmService.completePrompt(prompt);
expect(openaiResponse).toBeTruthy();
```

- **Success Criteria**: Successfully communicates with LLM APIs and returns responses
- **Memory Update**: Document LLM service methods and provider configuration

### 20. NLU Agent

- **File Summary**: `src/nlu/nlu-agent.js` - Coordinates natural language understanding.
- [ ] Create query processing pipeline
- [ ] Implement intent extraction with LLM
- [ ] Add entity recognition
- [ ] Create fallback mechanisms
- [ ] Implement context-aware understanding
- **Test**: Process test queries and verify intent extraction

```javascript
// Test: Query Processing
const result = await nluAgent.processQuery({
  query: "Show me my unread emails from yesterday"
});
expect(result).toHaveProperty('intent');
expect(result).toHaveProperty('entities');
expect(result).toHaveProperty('confidence');
expect(result.intent).toBe('getUnreadMail');
expect(result.entities).toHaveProperty('timeframe');
```

- **Success Criteria**: Successfully extracts intents and entities from natural language queries
- **Memory Update**: Document NLU processing flow and supported query types

### 21. Intent Router

- **File Summary**: `src/nlu/intent-router.js` - Maps intents to modules that can handle them.
- [ ] Implement intent to module mapping
- [ ] Create confidence scoring
- [ ] Add fallback patterns for common intents
- [ ] Implement disambiguation for unclear intents
- **Test**: Route intents to appropriate modules

```javascript
// Test: Intent Routing
const modules = await intentRouter.findModulesForIntent('readMail', { count: 5 });
expect(modules).toHaveLength(1);
expect(modules[0].id).toBe('mail');

// Test: Fallback Pattern Matching
const fallbackIntent = await intentRouter.matchPatterns("What emails do I have?");
expect(fallbackIntent).toBe('readMail');
```

- **Success Criteria**: Successfully maps intents to the correct modules for handling
- **Memory Update**: Document intent routing patterns and fallback mechanisms

## Context Management

### 22. Context Service

- **File Summary**: `src/core/context-service.js` - Maintains conversation context and history.
- [ ] Implement context storage
- [ ] Create conversation history tracking
- [ ] Add entity tracking across conversations
- [ ] Implement topic detection
- [ ] Create context retrieval for LLM prompting
- **Test**: Update and retrieve context information

```javascript
// Test: Context Management
await contextService.updateContext({
  currentTopic: 'emails',
  recentEntities: {
    people: [{ name: 'John Smith', email: 'john@example.com' }]
  }
});

const context = await contextService.getCurrentContext();
expect(context).toHaveProperty('currentTopic', 'emails');
expect(context.recentEntities.people[0].name).toBe('John Smith');

// Test: Conversation History
await contextService.addToConversation('user', 'Show me emails from John');
await contextService.addToConversation('assistant', 'Here are your emails from John Smith');

const history = await contextService.getConversationHistory(2);
expect(history).toHaveLength(2);
expect(history[0].role).toBe('user');
expect(history[1].role).toBe('assistant');
```

- **Success Criteria**: Successfully maintains conversation context and history
- **Memory Update**: Document context management patterns and available methods

## API Layer

### 23. Express Server Setup

- **File Summary**: `src/main/server.js` - Sets up the local Express server for the API.
- [ ] Initialize Express application
- [ ] Configure middleware (CORS, body parser, etc.)
- [ ] Set up error handling middleware
- [ ] Add request logging
- [ ] Create server lifecycle management
- **Test**: Start server and make basic requests

```javascript
// Test: Server Startup
const server = await startServer(3000);
expect(server.listening).toBe(true);

// Test: Basic Endpoint
const response = await axios.get('http://localhost:3000/api/health');
expect(response.status).toBe(200);
expect(response.data).toHaveProperty('status', 'ok');

// Test: Server Shutdown
await stopServer(server);
expect(server.listening).toBe(false);
```

- **Success Criteria**: Server starts, responds to requests, and shuts down cleanly
- **Memory Update**: Document server configuration and lifecycle

### 24. API Routes

- **File Summary**: `src/api/routes.js` - Defines all API endpoints and their handlers.
- [ ] Set up route registration system
- [ ] Define core API routes
- [ ] Create versioned API paths
- [ ] Add authentication middleware
- [ ] Implement request validation
- **Test**: Register routes and verify they respond

```javascript
// Test: Route Registration
const router = express.Router();
registerRoutes(router);

// Mock Express app
const app = express();
app.use('/api', router);

// Test endpoint response
const response = await request(app).get('/api/modules');
expect(response.status).toBe(200);
expect(Array.isArray(response.body)).toBe(true);
```

- **Success Criteria**: Routes registered and responding correctly to requests
- **Memory Update**: Document API routes and their purposes

### 25. Query Controller

- **File Summary**: `src/api/controllers/query-controller.js` - Handles natural language query requests.
- [ ] Implement query processing endpoint
- [ ] Add query validation
- [ ] Create context handling
- [ ] Implement intent routing
- [ ] Add response formatting
- **Test**: Process queries and verify responses

```javascript
// Test: Query Processing
const response = await request(app)
  .post('/api/query')
  .send({ query: "Show me my unread emails" });

expect(response.status).toBe(200);
expect(response.body).toHaveProperty('response');
expect(response.body).toHaveProperty('context');
expect(response.body.response).toHaveProperty('type');
expect(response.body.response).toHaveProperty('data');
```

- **Success Criteria**: Successfully processes natural language queries and returns structured responses
- **Memory Update**: Document query controller behavior and response format

### 26. Module-Specific Controllers

- **File Summary**: `src/api/controllers/[module]-controller.js` - Handles module-specific API endpoints.
- [ ] Create mail controller
- [ ] Implement calendar controller
- [ ] Add files controller
- [ ] Create consistent response formatting
- **Test**: Call module endpoints and verify responses

```javascript
// Test: Mail Controller
const response = await request(app)
  .get('/api/mail')
  .query({ filter: 'isRead eq false', limit: 10 });

expect(response.status).toBe(200);
expect(Array.isArray(response.body)).toBe(true);
if (response.body.length > 0) {
  expect(response.body[0]).toHaveProperty('id');
  expect(response.body[0]).toHaveProperty('subject');
}
```

- **Success Criteria**: Module controllers handle requests and return appropriate responses
- **Memory Update**: Document controller methods and parameters

## Desktop Application

### 27. Electron Main Process

- **File Summary**: `src/main/index.js` - Entry point for the Electron desktop application.
- [ ] Create main window management
- [ ] Implement IPC communication
- [ ] Set up application menu
- [ ] Add system tray integration
- [ ] Implement app lifecycle management
- **Test**: Launch app and verify window creation

```javascript
// This requires integration testing with Spectron or similar
const app = new spectron.Application({
  path: electronPath,
  args: [path.join(__dirname, '..')]
});

await app.start();
expect(app.isRunning()).toBe(true);
const windowCount = await app.client.getWindowCount();
expect(windowCount).toBe(1);
```

- **Success Criteria**: Application launches and creates main window
- **Memory Update**: Document main process setup and window management

### 28. Preload Script

- **File Summary**: `src/main/preload.js` - Provides secure API access to the renderer process.
- [ ] Create secure IPC bridge
- [ ] Implement API exposure
- [ ] Add context isolation
- [ ] Create utility functions
- **Test**: Verify exposed APIs in renderer

```javascript
// This requires integration testing
// Verify that window.api exists in the renderer
const hasApi = await app.client.execute(() => {
  return window.api !== undefined;
});
expect(hasApi).toBe(true);

// Verify IPC methods
const hasQueryMethod = await app.client.execute(() => {
  return typeof window.api.sendQuery === 'function';
});
expect(hasQueryMethod).toBe(true);
```

- **Success Criteria**: APIs securely exposed to renderer process
- **Memory Update**: Document exposed APIs and their usage

### 29. Renderer Process

- **File Summary**: `src/renderer/index.js` - Entry point for the renderer process (UI).
- [ ] Initialize UI framework
- [ ] Set up IPC communication
- [ ] Create basic UI components
- [ ] Implement conversation display
- [ ] Add input handling
- **Test**: Render UI and verify components

```javascript
// This requires integration testing
// Verify that main components are rendered
const hasConversation = await app.client.isExisting('#conversation-container');
expect(hasConversation).toBe(true);

const hasInput = await app.client.isExisting('#query-input');
expect(hasInput).toBe(true);
```

- **Success Criteria**: UI renders correctly with all required components
- **Memory Update**: Document renderer initialization and component structure

### 30. Basic UI Components

- **File Summary**: `src/renderer/components/*.js` - UI components for the user interface.
- [ ] Create conversation component
- [ ] Implement message display
- [ ] Add input form
- [ ] Create settings panel
- [ ] Implement loading indicators
- **Test**: Render components and verify functionality

```javascript
// Test basic UI interaction
await app.client.setValue('#query-input', 'Show me my emails');
await app.client.click('#send-button');

// Wait for response
await app.client.waitUntil(async () => {
  const messages = await app.client.$$('.message');
  return messages.length >= 2; // User message + response
}, 5000);

const messages = await app.client.$$('.message');
expect(messages.length).toBeGreaterThanOrEqual(2);
```

- **Success Criteria**: Components render and function correctly
- **Memory Update**: Document component props and behavior

## Testing

### 31. Unit Tests

- **File Summary**: `test/unit/*.test.js` - Unit tests for individual components.
- [ ] Set up Jest configuration
- [ ] Create tests for core services
- [ ] Implement tests for Graph services
- [ ] Add tests for module functionality
- [ ] Create utility function tests
- **Test**: Run test suite and verify coverage

```bash
npm run test:unit
```

- **Success Criteria**: All unit tests pass with ≥80% coverage
- **Memory Update**: Document testing patterns and coverage status

### 32. Integration Tests

- **File Summary**: `test/integration/*.test.js` - Tests that verify multiple components working together.
- [ ] Set up integration test environment
- [ ] Create auth flow tests
- [ ] Implement API endpoint tests
- [ ] Add module interaction tests
- [ ] Create LLM integration tests
- **Test**: Run integration tests

```bash
npm run test:integration
```

- **Success Criteria**: All integration tests pass
- **Memory Update**: Document integration test scenarios

### 33. End-to-End Tests

- **File Summary**: `test/e2e/*.test.js` - Tests for complete application flows.
- [ ] Set up E2E test environment (Spectron)
- [ ] Create basic application flow tests
- [ ] Implement conversation tests
- [ ] Add authentication flow tests
- [ ] Create error handling tests
- **Test**: Run E2E tests

```bash
npm run test:e2e
```

- **Success Criteria**: All E2E tests pass
- **Memory Update**: Document E2E test scenarios

## Packaging and Distribution

### 34. Electron Builder Configuration

- **File Summary**: `electron-builder.yml` - Configuration for building desktop packages.
- [ ] Configure application metadata
- [ ] Set up build targets for each platform
- [ ] Configure code signing
- [ ] Add auto-update configuration
- [ ] Set up installation options
- **Test**: Build test package

```bash
npm run build
```

- **Success Criteria**: Application packages successfully for all platforms
- **Memory Update**: Document build configuration and distribution options

### 35. Final Integration and Testing

- **File Summary**: Final verification of the complete system.
- [ ] Perform full application testing
- [ ] Verify all user stories for Phase 1
- [ ] Conduct performance testing
- [ ] Check memory usage
- [ ] Ensure error handling throughout
- **Test**: Complete user flows with real Microsoft account
- **Success Criteria**: Application meets all Phase 1 requirements and user stories
- **Memory Update**: Document known issues and limitations

## Definition of Done for Phase 1

Phase 1 is considered complete when:

1. All checklist items are implemented and tested
2. The application successfully:
   - Authenticates with Microsoft 365
   - Retrieves and processes emails, calendar events, and files
   - Understands natural language queries
   - Provides contextual responses
   - Works on Windows, macOS, and Linux
3. All core user stories are fulfilled
4. Performance benchmarks are met
5. Documentation is complete

Additionally, the application should have:

- Clean error handling
- Appropriate logging
- Secure handling of user data
- A simple but functional UI
- Smooth conversation flow.
