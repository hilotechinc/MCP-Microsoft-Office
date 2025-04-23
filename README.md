# Microsoft Cloud Platform (MCP)

MCP is a cross-platform desktop application that enables natural language interaction with Microsoft 365 services through Large Language Models (LLMs). It creates a unified conversational interface for all your Microsoft data - emails, calendar, documents, contacts, and more.

With MCP, you can chat naturally with an AI assistant about your Microsoft 365 content, receive contextual insights, and take actions across services - all through simple conversation.

## Vision & Value Proposition

- **Conversational Productivity:** Natural language is the interface for all Microsoft 365 data and actions.
- **Contextual Intelligence:** Get insights that connect information across services (e.g., "What do I need to prepare for tomorrow's meeting?").
- **Unified Experience:** Access all Microsoft services through a single, coherent interface.
- **Privacy by Design:** Processes data locally on your device when possible.
- **Productivity Enhancement:** Automates common tasks through natural language requests.

## Core Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                      Electron Application                       │
│                                                                 │
│  ┌─────────────────┐        ┌─────────────────────────────┐    │
│  │   UI Layer      │◄──────►│   Local API Server          │    │
│  │   (Renderer)    │        │   (Express)                 │    │
│  └─────────────────┘        └───────────────┬─────────────┘    │
│                                             │                   │
│  ┌─────────────────┐        ┌───────────────▼─────────────┐    │
│  │  Local Storage  │◄──────►│   Module System             │    │
│  │  (SQLite)       │        │   (Mail, Calendar, Files)   │    │
│  └─────────────────┘        └───────────────┬─────────────┘    │
│                                             │                   │
└─────────────────────────────────────────────┼─────────────────┬─┘
                                              │                 │
                                              ▼                 ▼
┌─────────────────────────────┐    ┌─────────────────┐  ┌────────────────┐
│  Microsoft Graph API        │◄──►│  LLM Service    │  │ User's Microsoft│
│                             │    │  (Claude/OpenAI)│  │ Account        │
└─────────────────────────────┘    └─────────────────┘  └────────────────┘
```

## How MCP Works

1. **User Query:** User enters a natural language request in the UI.
2. **NLU & Intent Routing:** Hybrid NLU (pattern matching + LLM) extracts intent and entities.
3. **Module Handling:** Intent is routed to the appropriate module (Mail, Calendar, Files).
4. **Graph API Access:** Module uses Microsoft Graph API to access Microsoft 365 services.
5. **Context Integration:** Information from multiple services is combined for richer insights.
6. **Response Generation:** Results are formatted into natural language and displayed with possible actions.

## Implementation Phases

The MCP project is being implemented in three strategic phases:

### Phase 1: Minimum Viable Product (MVP)
- **Core Features:** Mail, Calendar, and OneDrive modules
- **Architecture:** Desktop app with local API server
- **Technology:** Node.js, Electron, Express
- **Authentication:** MSAL public client flow
- **Data Storage:** SQLite for local persistence
- **Caching:** In-memory caching for performance
- **NLU:** Basic intent extraction and entity recognition

### Phase 2: Enhanced Experience
- **New Modules:** People/Contacts and SharePoint integration
- **Enhanced Context:** Cross-service awareness for deeper insights
- **Improved Caching:** Optional Redis support
- **Rich UI:** Enhanced message formatting and visualization
- **Advanced NLU:** More sophisticated prompting and context handling
- **Relationship Discovery:** Entity connections across services

### Phase 3: Advanced Capabilities
- **Teams Integration:** Complete Microsoft Teams support
- **Proactive Intelligence:** Notifications and smart suggestions
- **Cross-Device Sync:** Seamless experience across multiple devices
- **Enterprise Features:** Deployment, security, and compliance controls
- **Advanced Analytics:** Usage patterns and productivity insights
- **Intelligent Assistants:** Specialized helpers for deadlines, meetings, etc.

## Core Design Principles

- **Asynchronous Operations ONLY:** All operations use async/await with proper Promise handling.
- **Comprehensive Error Handling:** Standardized error creation, logging, and recovery paths.
- **Modular Architecture:** Independent modules with clear interfaces and dependency injection.
- **Test-Driven Development:** Every component has comprehensive tests for all functionality.
- **Data Validation:** Joi schemas validate all inputs and outputs throughout the application.
- **Privacy-First:** Data is normalized and minimized before processing or storage.
- **Event-Driven Communication:** Components communicate through a decoupled event system.

## Example: Mail Module

```javascript
module.exports = {
  id: 'mail',
  name: 'Outlook Mail',
  
  capabilities: ['readMail', 'sendMail', 'searchMail'],
  
  // Initialize module with services
  init(services) {
    this.mailService = services.mailService;
    this.cacheService = services.cacheService;
    return this;
  },
  
  // Handle mail-related intents
  async handleIntent(intent, entities, context) {
    switch (intent) {
      case 'readMail':
        return await this.handlers.readMail(entities, context);
      case 'sendMail':
        return await this.handlers.sendMail(entities, context);
      case 'searchMail':
        return await this.handlers.searchMail(entities, context);
    }
  },
  
  handlers: require('./handlers')
};
```

## Key User Stories

### Contextual Meeting Intelligence
"As a busy professional, I want to quickly understand the context of my upcoming meetings so I can be better prepared."

### Smart Email Management
"As someone who receives dozens of emails daily, I want help identifying and responding to important messages."

### Intelligent Document Discovery
"As a team member working across multiple projects, I want to quickly find relevant documents without searching through folders."

### Seamless Calendar Management
"As a manager coordinating with multiple teams, I want to schedule meetings efficiently without back-and-forth emails."

### Cross-Application Insights
"As a knowledge worker, I want insights that connect information across different applications."

## Project Structure

```
mcp-desktop/
├── src/
│   ├── main/                   # Electron main process
│   ├── core/                   # Core services
│   │   ├── auth-service.js     # Microsoft authentication
│   │   ├── cache-service.js    # Caching layer
│   │   ├── error-service.js    # Error handling
│   │   ├── event-service.js    # Event management
│   │   └── storage-service.js  # Local storage
│   │
│   ├── api/                    # API endpoints
│   │   ├── routes.js           # Route definitions
│   │   └── controllers/        # Request handlers
│   │
│   ├── graph/                  # Microsoft Graph integration
│   │   ├── graph-client.js     # Graph client factory
│   │   ├── mail-service.js     # Mail API operations
│   │   ├── calendar-service.js # Calendar API operations
│   │   └── files-service.js    # Files API operations
│   │
│   ├── modules/                # Functional modules
│   │   ├── module-registry.js  # Module management
│   │   ├── mail/               # Mail module
│   │   ├── calendar/           # Calendar module
│   │   └── files/              # Files module
│   │
│   ├── nlu/                    # Natural language understanding
│   │   ├── nlu-agent.js        # NLU coordination
│   │   └── llm-service.js      # External LLM integration
│   │
│   └── renderer/               # Electron renderer (UI)
│       ├── index.html          # Main HTML file
│       └── components/         # UI components
│
└── test/                       # Tests
    ├── unit/                   # Unit tests
    ├── integration/            # Integration tests
    └── e2e/                    # End-to-end tests
```

## Getting Started

### Prerequisites
- Node.js (v16+)
- npm or yarn
- Microsoft 365 account
- Microsoft Azure App Registration (for Graph API)
- LLM API key (Claude or OpenAI)

### Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/mcp.git
cd mcp
```

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file with your configuration:
```
MICROSOFT_CLIENT_ID=your_client_id
MICROSOFT_TENANT_ID=your_tenant_id
LLM_PROVIDER=claude  # or openai
CLAUDE_API_KEY=your_claude_api_key
# OPENAI_API_KEY=your_openai_api_key  # if using OpenAI
```

4. Start the application in development mode:
```bash
npm run dev
```

## Testing

MCP uses Jest for all testing. There are three main types of tests:

- **Unit Tests:** Test isolated modules and functions.
- **Integration Tests:** Test API endpoints and backend module interactions using Jest + supertest.
- **End-to-End (E2E) Tests:** Simulate real user workflows across the backend API, chaining endpoints as a user would (e.g., query → mail → calendar). Electron UI E2E is skipped for now.

### Running Tests

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests (API/module)
npm run test:integration

# Run backend E2E tests (API workflows)
npm run test:e2e
```

> **Note:** Electron/Spectron E2E tests are skipped due to maintenance issues. All E2E testing is currently focused on backend API workflows using Jest + supertest. Example scenarios include chaining a query, mail, and calendar API call to simulate a real user session.

## Building for Production

```bash
# Build for current platform
npm run build

# Build for specific platforms
npm run build:win
npm run build:mac
npm run build:linux
```

## Contributing

We welcome contributions! Please see our [Contribution Guidelines](CONTRIBUTING.md) for more information.

## Documentation

- [Architecture Documentation](docs/ARCHITECTURE.md)
- [Implementation Guidelines](docs/IMPLEMENTATION.md)
- [Phase 1 Checklist](docs/PHASE1.md)
- [Phase 2 Checklist](docs/PHASE2.md)
- [Phase 3 Checklist](docs/PHASE3.md)

## License

[MIT](LICENSE)