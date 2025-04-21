# MCP Project: Phase 1 Architecture

## System Overview

Phase 1 delivers a desktop application enabling natural language interaction with Microsoft 365 Mail, Calendar, and OneDrive services. The architecture follows these principles:

- **Desktop-first**: Runs locally on user's machine
- **Privacy-focused**: Processes data locally when possible
- **Modular design**: Independent modules for different Microsoft services
- **Asynchronous operations**: Non-blocking operations throughout
- **Local caching**: In-memory caching for performance

## Component Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Electron Application                       │
│                                                                 │
│  ┌─────────────────┐        ┌─────────────────────────────┐    │
│  │                 │        │                             │    │
│  │   UI Layer      │◄──────►│   Local API Server          │    │
│  │   (Renderer)    │        │   (Express)                 │    │
│  │                 │        │                             │    │
│  └─────────────────┘        └───────────────┬─────────────┘    │
│                                             │                   │
│                                             ▼                   │
│  ┌─────────────────┐        ┌─────────────────────────────┐    │
│  │                 │        │                             │    │
│  │  Local Storage  │◄──────►│   Module System             │    │
│  │  (SQLite)       │        │   (Mail, Calendar, Files)   │    │
│  │                 │        │                             │    │
│  └─────────────────┘        └───────────────┬─────────────┘    │
│                                             │                   │
└─────────────────────────────────────────────┼─────────────────┬─┘
                                              │                 │
                                              ▼                 ▼
┌─────────────────────────────┐    ┌─────────────────┐  ┌────────────────┐
│                             │    │                 │  │                │
│  Microsoft Graph API        │◄──►│  LLM Service    │  │ User's Microsoft│
│                             │    │  (Claude/OpenAI)│  │ Account        │
│                             │    │                 │  │                │
└─────────────────────────────┘    └─────────────────┘  └────────────────┘
```

## Data Flow

1. **User Input**: User enters natural language query in UI
2. **Query Processing**:
   - Query sent to NLU Agent via API
   - NLU Agent processes query (pattern matching or LLM)
   - Intent and entities extracted
3. **Module Handling**:
   - Intent routed to appropriate module
   - Module performs Graph API operations
   - Data normalized and cached
4. **Response Generation**:
   - Structured data returned to UI
   - Conversation context updated
5. **UI Rendering**:
   - Response displayed in conversation interface
   - Possible actions presented to user

## Complete File Structure

```

mcp-desktop/
├── package.json
├── .env.example
├── README.md
├── .gitignore
├── electron-builder.yml
├── src/
│   ├── main/                   # Electron main process
│   │   ├── index.js            # Main entry point
│   │   ├── preload.js          # Preload script for renderer
│   │   ├── menu.js             # Application menu
│   │   └── server.js           # Express server setup
│   │
│   ├── core/                   # Core services
│   │   ├── auth-service.js     # Microsoft authentication
│   │   ├── cache-service.js    # In-memory caching
│   │   ├── context-service.js  # Conversation context
│   │   ├── error-service.js    # Error handling
│   │   ├── event-service.js    # Event management
│   │   ├── monitoring-service.js # Logging and monitoring
│   │   └── storage-service.js  # SQLite storage
│   │
│   ├── api/                    # API layer
│   │   ├── routes.js           # API route definitions
│   │   ├── middleware/
│   │   │   ├── auth-middleware.js    # Authentication checks
│   │   │   ├── error-middleware.js   # Error handling
│   │   │   └── validation-middleware.js # Request validation
│   │   │
│   │   └── controllers/
│   │       ├── query-controller.js   # Natural language queries
│   │       ├── mail-controller.js    # Mail operations
│   │       ├── calendar-controller.js # Calendar operations
│   │       └── files-controller.js   # File operations
│   │
│   ├── graph/                  # Microsoft Graph integration
│   │   ├── graph-client.js     # Graph client factory
│   │   ├── mail-service.js     # Mail API operations
│   │   ├── calendar-service.js # Calendar API operations
│   │   ├── files-service.js    # Files API operations
│   │   └── normalizers.js      # Data normalizers
│   │
│   ├── modules/                # Functional modules
│   │   ├── module-registry.js  # Module management
│   │   ├── mail/
│   │   │   ├── index.js        # Mail module definition
│   │   │   └── handlers.js     # Mail intent handlers
│   │   │
│   │   ├── calendar/
│   │   │   ├── index.js        # Calendar module definition
│   │   │   └── handlers.js     # Calendar intent handlers
│   │   │
│   │   └── files/
│   │       ├── index.js        # Files module definition
│   │       └── handlers.js     # Files intent handlers
│   │
│   ├── nlu/                    # Natural language understanding
│   │   ├── nlu-agent.js        # NLU coordination
│   │   ├── llm-service.js      # External LLM integration
│   │   └── intent-router.js    # Intent mapping
│   │
│   ├── config/                 # Configuration
│   │   └── index.js            # Configuration management
│   │
│   ├── utils/                  # Utilities
│   │   ├── schemas/            # Joi validation schemas
│   │   │   ├── mail-schemas.js # Mail validation schemas
│   │   │   ├── calendar-schemas.js # Calendar schemas
│   │   │   └── files-schemas.js # Files validation schemas
│   │   │
│   │   ├── constants.js        # System constants
│   │   └── helpers.js          # Helper functions
│   │
│   └── renderer/               # Electron renderer (UI)
│       ├── index.html          # Main HTML file
│       ├── index.js            # Renderer entry point
│       ├── styles/             # CSS styles
│       │   └── main.css        # Main stylesheet
│       │
│       └── components/         # UI components
│           ├── app.js          # Main app component
│           ├── conversation.js # Conversation display
│           ├── message.js      # Message component
│           ├── input-form.js   # Query input form
│           └── settings.js     # Settings panel
│
├── test/                       # Tests
│   ├── unit/                   # Unit tests
│   │   ├── core/               # Core service tests
│   │   ├── graph/              # Graph service tests
│   │   ├── modules/            # Module tests
│   │   └── nlu/                # NLU tests
│   │
│   ├── integration/            # Integration tests
│   │   ├── api/                # API tests
│   │   └── graph/              # Graph integration tests
│   │
│   └── e2e/                    # End-to-end tests
│       └── app.test.js         # Application E2E test
│
└── config/                     # Build configuration
    ├── jest.config.js          # Jest configuration
    ├── eslint.config.js        # ESLint configuration
    └── electron-builder.js     # Electron builder config
```

## Core Services

### Authentication Service

**File**: `src/core/auth-service.js`

Handles Microsoft authentication using MSAL public client flow:

```javascript
class AuthService {
  constructor() {
    this.pca = new msal.PublicClientApplication({
      auth: {
        clientId: process.env.MICROSOFT_CLIENT_ID,
        authority: "https://login.microsoftonline.com/common"
      }
    });
  }

  async login() { /* ... */ }
  async getAccessToken() { /* ... */ }
  async logout() { /* ... */ }
}
```

### Cache Service

**File**: `src/core/cache-service.js`

Provides in-memory caching with TTL support:

```javascript
class CacheService {
  constructor() {
    this.cache = new Map();
    this.expirations = new Map();
  }

  async get(key) { /* ... */ }
  async set(key, value, ttlSeconds = 300) { /* ... */ }
  async invalidate(key) { /* ... */ }
  async invalidatePattern(pattern) { /* ... */ }
}
```

### Error Service

**File**: `src/core/error-service.js`

Standardized error handling:

```javascript
class ErrorService {
  static CATEGORIES = {
    AUTH: 'auth',
    GRAPH: 'graph',
    API: 'api',
    DATABASE: 'database',
    MODULE: 'module',
    NLU: 'nlu',
    SYSTEM: 'system'
  };

  static createError(category, message, severity, context) { /* ... */ }
  static createApiError(error) { /* ... */ }
}
```

### Storage Service

**File**: `src/core/storage-service.js`

SQLite-based persistent storage:

```javascript
class StorageService {
  constructor() {
    this.db = null;
    this.init();
  }

  async init() { /* SQLite setup */ }
  async getSetting(key) { /* ... */ }
  async setSetting(key, value) { /* ... */ }
  async saveConversation(entry) { /* ... */ }
  async getConversationHistory(limit = 20) { /* ... */ }
}
```

## Microsoft Graph Integration

### Graph Client Factory

**File**: `src/graph/graph-client.js`

Creates authenticated Microsoft Graph clients:

```javascript
class GraphClientFactory {
  constructor(authService) {
    this.authService = authService;
  }

  async createClient() {
    const token = await this.authService.getAccessToken();
    return Client.init({
      authProvider: (done) => {
        done(null, token);
      }
    });
  }
}
```

### Microsoft Graph Services

Three service files for Microsoft Graph APIs:

- **`src/graph/mail-service.js`**: Mail operations
- **`src/graph/calendar-service.js`**: Calendar operations
- **`src/graph/files-service.js`**: OneDrive operations

Each service follows this pattern:

```javascript
class MailService {
  constructor(graphClientFactory, cacheService) {
    this.graphClientFactory = graphClientFactory;
    this.cacheService = cacheService;
  }

  async getInbox(options = {}) { /* ... */ }
  async searchEmails(query, options = {}) { /* ... */ }
  async getEmailById(id) { /* ... */ }
  async sendEmail(emailData) { /* ... */ }
}
```

## Module System

### Module Registry

**File**: `src/modules/module-registry.js`

Manages functional modules:

```javascript
class ModuleRegistry {
  constructor() {
    this.modules = new Map();
    this.moduleCapabilities = new Map();
  }

  registerModule(module) { /* ... */ }
  getModule(moduleId) { /* ... */ }
  getAllModules() { /* ... */ }
  findModulesForIntent(intent) { /* ... */ }
}
```

### Module Structure

Each module follows this structure:

**Mail Module**: `src/modules/mail/index.js`

```javascript
module.exports = {
  id: 'mail',
  name: 'Outlook Mail',
  capabilities: ['readMail', 'sendMail', 'searchMail'],
  
  init(services) { /* ... */ },
  async handleIntent(intent, entities, context) {
    switch (intent) {
      case 'readMail': return this.handlers.readMail(entities, context);
      case 'sendMail': return this.handlers.sendMail(entities, context);
      case 'searchMail': return this.handlers.searchMail(entities, context);
    }
  },
  handlers: require('./handlers')
};
```

**Module Handlers**: `src/modules/mail/handlers.js`

```javascript
module.exports = {
  async readMail(entities, context) { /* ... */ },
  async sendMail(entities, context) { /* ... */ },
  async searchMail(entities, context) { /* ... */ }
};
```

## NLU Integration

### NLU Agent

**File**: `src/nlu/nlu-agent.js`

Coordinates natural language understanding:

```javascript
class NLUAgent {
  constructor(llmService, intentRouter) {
    this.llm = llmService;
    this.intentRouter = intentRouter;
  }

  async processQuery(input) {
    // Try pattern matching first
    const patternResult = this.intentRouter.matchPatterns(input.query);
    if (patternResult && patternResult.confidence > 0.8) {
      return patternResult;
    }

    // Fall back to LLM
    const prompt = this.buildPrompt(input);
    const llmResponse = await this.llm.completePrompt(prompt);
    return this.parseResponse(llmResponse);
  }
  
  // Other methods...
}
```

### LLM Service

**File**: `src/nlu/llm-service.js`

Provider-agnostic LLM integration:

```javascript
class LLMService {
  constructor() {
    this.provider = process.env.LLM_PROVIDER || 'claude';
  }

  async completePrompt(prompt, options = {}) {
    if (this.provider === 'claude') {
      return this.completeWithClaude(prompt, options);
    } else {
      return this.completeWithOpenAI(prompt, options);
    }
  }

  async completeWithClaude(prompt, options) { /* ... */ }
  async completeWithOpenAI(prompt, options) { /* ... */ }
}
```

## API Layer

### API Routes

**File**: `src/api/routes.js`

Defines API endpoints:

```javascript
module.exports = function(app) {
  // Natural language query endpoint
  app.post('/api/query', queryController.processQuery);
  
  // Mail endpoints
  app.get('/api/mail', mailController.getEmails);
  app.get('/api/mail/:id', mailController.getEmail);
  app.post('/api/mail', mailController.sendEmail);
  
  // Calendar endpoints
  app.get('/api/calendar', calendarController.getEvents);
  app.post('/api/calendar', calendarController.createEvent);
  app.get('/api/calendar/:id', calendarController.getEvent);
  
  // Files endpoints
  app.get('/api/files', filesController.getFiles);
  app.get('/api/files/:id', filesController.getFile);
  app.get('/api/files/search', filesController.searchFiles);
  
  // System endpoints
  app.get('/api/modules', (req, res) => {
    const modules = moduleRegistry.getAllModules();
    res.json(modules.map(m => ({
      id: m.id,
      name: m.name,
      capabilities: m.capabilities
    })));
  });
};
```

### Query Controller

**File**: `src/api/controllers/query-controller.js`

Handles natural language queries:

```javascript
const queryController = {
  async processQuery(req, res) {
    try {
      const { query, context = {} } = req.body;
      
      // Process with NLU agent
      const nluResult = await nluAgent.processQuery({ query, context });
      
      // Find module to handle intent
      const module = moduleRegistry.findModulesForIntent(nluResult.intent)[0];
      if (!module) {
        return res.status(400).json({
          error: `No module can handle intent: ${nluResult.intent}`
        });
      }
      
      // Handle intent with module
      const response = await module.handleIntent(
        nluResult.intent,
        nluResult.entities,
        context
      );
      
      // Update context
      const updatedContext = await contextService.updateContext({
        currentIntent: nluResult.intent,
        currentEntities: nluResult.entities
      });
      
      // Return response with context
      res.json({
        response,
        context: updatedContext
      });
    } catch (error) {
      const mcpError = ErrorService.createError(
        'api',
        'Failed to process query',
        'error',
        { query: req.body.query, error }
      );
      
      res.status(500).json(ErrorService.createApiError(mcpError));
    }
  }
};
```

## Electron Application

### Main Process

**File**: `src/main/index.js`

Electron main process:

```javascript
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const { startServer } = require('./server');

let mainWindow;
let server;

async function createWindow() {
  // Start local API server
  server = await startServer();
  
  // Create browser window
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true
    }
  });
  
  // Load index.html
  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
}

app.whenReady().then(createWindow);

// Exit cleanly
app.on('window-all-closed', async () => {
  if (server) {
    await new Promise(resolve => server.close(resolve));
  }
  if (process.platform !== 'darwin') app.quit();
});
```

### Express Server

**File**: `src/main/server.js`

Local API server:

```javascript
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const registerRoutes = require('../api/routes');

async function startServer(port = 3000) {
  const app = express();
  
  // Middleware
  app.use(cors());
  app.use(bodyParser.json());
  
  // Register routes
  registerRoutes(app);
  
  // Error handling
  app.use((err, req, res, next) => {
    const mcpError = ErrorService.createError(
      'api',
      err.message,
      'error',
      { path: req.path, method: req.method }
    );
    
    res.status(500).json(ErrorService.createApiError(mcpError));
  });
  
  // Start server
  return new Promise(resolve => {
    const server = app.listen(port, () => {
      console.log(`API server running on port ${port}`);
      resolve(server);
    });
  });
}

module.exports = { startServer };
```

### Renderer Process

**File**: `src/renderer/index.js`

UI entry point:

```javascript
document.addEventListener('DOMContentLoaded', () => {
  // Initialize UI components
  const app = new App({
    element: document.getElementById('app'),
    api: window.api
  });
  
  // Render application
  app.render();
});

class App {
  constructor(options) {
    this.element = options.element;
    this.api = options.api;
    this.conversation = new Conversation(
      document.getElementById('conversation')
    );
    this.inputForm = new InputForm(
      document.getElementById('input-form'),
      this.handleSubmit.bind(this)
    );
  }
  
  async handleSubmit(query) {
    // Add user message
    this.conversation.addMessage('user', query);
    
    try {
      // Send to API
      const response = await this.api.sendQuery(query);
      
      // Add response
      this.conversation.addMessage('assistant', response);
    } catch (error) {
      this.conversation.addMessage('error', 'Sorry, I encountered an error.');
    }
  }
  
  render() {
    this.conversation.render();
    this.inputForm.render();
  }
}
```

## API Contracts

### Query API

**Endpoint**: `POST /api/query`

**Request**:

```json
{
  "query": "Show me my unread emails from yesterday",
  "context": {
    "conversationHistory": [
      {"role": "user", "content": "Hi there"},
      {"role": "assistant", "content": "Hello! How can I help you?"}
    ]
  }
}
```

**Response**:

```json
{
  "response": {
    "type": "mailList",
    "data": {
      "emails": [
        {
          "id": "AAMkADc...",
          "subject": "Project update",
          "from": {
            "name": "John Smith",
            "email": "john@example.com"
          },
          "received": "2025-04-20T15:30:00Z",
          "preview": "Here's the latest update on...",
          "isRead": false
        }
      ],
      "count": 1,
      "totalCount": 1
    },
    "possibleActions": [
      {"type": "readEmail", "emailId": "AAMkADc..."},
      {"type": "markAsRead", "emailIds": ["AAMkADc..."]}
    ]
  },
  "context": {
    "currentIntent": "getUnreadMail",
    "currentEntities": {
      "timeframe": {
        "unit": "day",
        "value": 1,
        "relation": "previous"
      }
    },
    "conversationHistory": [
      {"role": "user", "content": "Hi there"},
      {"role": "assistant", "content": "Hello! How can I help you?"},
      {"role": "user", "content": "Show me my unread emails from yesterday"}
    ]
  }
}
```

## Module Response Types

Each module produces standardized response types:

### Mail Module Responses

**Mail List Response**:

```json
{
  "type": "mailList",
  "data": {
    "emails": [...],
    "count": 5,
    "totalCount": 27
  },
  "possibleActions": [...]
}
```

**Single Email Response**:

```json
{
  "type": "email",
  "data": {
    "email": {...},
    "attachments": [...]
  },
  "possibleActions": [...]
}
```

### Calendar Module Responses

**Event List Response**:

```json
{
  "type": "calendarEvents",
  "data": {
    "events": [...],
    "timeframe": {
      "start": "2025-04-21T00:00:00Z",
      "end": "2025-04-21T23:59:59Z"
    }
  },
  "possibleActions": [...]
}
```

**Single Event Response**:

```json
{
  "type": "calendarEvent",
  "data": {
    "event": {...},
    "attendees": [...]
  },
  "possibleActions": [...]
}
```

### Files Module Responses

**File List Response**:

```json
{
  "type": "fileList",
  "data": {
    "files": [...],
    "count": 12,
    "totalCount": 45
  },
  "possibleActions": [...]
}
```

**Single File Response**:

```json
{
  "type": "file",
  "data": {
    "file": {...},
    "sharedWith": [...]
  },
  "possibleActions": [...]
}
```

## Validation and Success Criteria

This architecture will be considered successfully implemented when:

1. **File Structure**: All files exist in the correct locations
2. **Module Registration**: All three modules (Mail, Calendar, Files) register properly
3. **API Endpoints**: All endpoints respond with the correct format
4. **Data Flow**: Natural language queries are processed and routed correctly
5. **Authentication**: Microsoft authentication works with proper token management
6. **Caching**: Data is correctly cached and invalidated
7. **UI Integration**: UI displays conversation and handles user input
8. **Error Handling**: Errors are properly caught, logged, and displayed

Each component should be validated against its specific success criteria as outlined in the Phase 1 Implementation Checklist.
