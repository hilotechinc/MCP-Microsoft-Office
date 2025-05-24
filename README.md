# MCP Desktop - Microsoft Cloud Platform Desktop Client

MCP Desktop is an Electron-based desktop application that connects Claude to your Microsoft 365 data through the Model Context Protocol (MCP). It enables natural language access to emails, calendar events, files, and contacts with proper authentication and security, all from a native desktop experience.

## Architecture Overview

The system follows a modular, layered architecture with clear separation of concerns:

1. **MCP Adapter (`mcp-adapter.cjs`)**: Implements the Model Context Protocol to allow Claude to communicate with Microsoft 365 services.
2. **Backend Server (`dev-server.cjs`)**: Express server that handles API endpoints, routing, and orchestration.
3. **API Controllers**: Handle request validation, module invocation, and response formatting.
4. **Functional Modules**: Implement domain-specific logic for mail, calendar, files, and people.
5. **Graph Services**: Interact directly with Microsoft Graph API, handling authentication and data transformation.
6. **MSAL Authentication**: Manages Microsoft identity tokens and authentication flows.
7. **Database (`mcp.sqlite`)**: Local SQLite database for storing authentication tokens and session data.

### Detailed Architecture Diagram

```
┌────────────────┐      ┌───────────────────────────────────┐     ┌─────────────────────────────────────┐
│                │      │                                   │     │                                     │
│  Claude LLM    │◄────►│  MCP Adapter (mcp-adapter.cjs)    │◄───►│  Backend Server (dev-server.cjs)    │
│  Tool Calls    │      │  • JSON-RPC handling              │     │  • Express server                   │
│                │      │  • Tool mapping                   │     │  • Route registration               │
└────────────────┘      │  • Parameter transformation       │     │  • Middleware                       │
                        │  • HTTP client                    │     │                                     │
                        └───────────────────────────────────┘     └─────────────────┬───────────────────┘
                                                                                    │
                                                                                    ▼
┌────────────────────────────────┐     ┌───────────────────────────────────┐     ┌─────────────────────────────────────┐
│                                │     │                                   │     │                                     │
│  Microsoft Graph API           │◄───►│  Graph Services (src/graph/*)     │◄───►│  API Controllers (src/api/controllers)│
│  • Microsoft 365 Services      │     │  • Graph client                   │     │  • Request validation               │
│  • OAuth 2.0 endpoints         │     │  • API operations                 │     │  • Parameter processing             │
│                                │     │  • Data normalization             │     │  • Response formatting              │
└────────────────────────────────┘     │  • Error handling                 │     │  • Error handling                   │
                                        └─────────────────┬─────────────────┘     └─────────────────┬───────────────────┘
                                                          │                                         │
                                                          │                                         │
                                                          ▼                                         ▼
                                        ┌─────────────────────────────────┐     ┌─────────────────────────────────────┐
                                        │                                 │     │                                     │
                                        │  MSAL Authentication            │     │  Functional Modules (src/modules/*) │
                                        │  • Token acquisition            │     │  • Domain logic                     │
                                        │  • Token refresh                │     │  • Capability registration          │
                                        │  • Secure storage               │     │  • Intent handling                  │
                                        │  • Login flows                  │     │  • Caching                          │
                                        └─────────────────────────────────┘     └─────────────────────────────────────┘
```

### End-to-End Flow Description

The following describes the complete flow of a request from Claude through the system to Microsoft Graph API and back, using the files module as an example:

1. **Claude Tool Call**
   - Claude issues a tool call (e.g., `listFiles`, `uploadFile`, `getFileMetadata`)
   - Tool parameters are passed as JSON-RPC to the MCP adapter

2. **MCP Adapter Processing**
   - `handleRequest()` receives the JSON-RPC request
   - `handleToolCall()` maps the tool name to a module and method
   - `executeModuleMethod()` transforms parameters if needed (e.g., formatting dates)
   - The adapter constructs an HTTP request to the backend server

3. **Backend Routing**
   - Express routes the request to the appropriate controller (e.g., `/api/v1/files` → `filesController.listFiles`)
   - The controller validates input parameters using Joi schemas

4. **Controller to Module**
   - The controller calls the appropriate files module method
   - The module checks cache for applicable operations
   - For cache misses, the module delegates to the Graph service

5. **Graph Service to Microsoft Graph**
   - The Graph service constructs the appropriate Graph API request
   - MSAL authentication is handled at this layer (token acquisition/refresh)
   - The request is sent to Microsoft Graph API
   - The response is received and initial error handling occurs

6. **Response Processing**
   - Graph service returns data to the files module
   - The module uses normalizers to transform the data to a consistent format
   - Normalized data is cached where appropriate
   - The controller formats the final HTTP response

7. **Return to Claude**
   - MCP adapter receives the HTTP response
   - The adapter formats it as a JSON-RPC response
   - Claude receives the structured data and presents it to the user

This flow ensures clean separation of concerns, consistent error handling, and proper data normalization at each layer.

## Getting Started

### Prerequisites
- Node.js (v18+)
- npm (v7+)
- Microsoft 365 account
- Microsoft Azure App Registration (for Graph API)
- OpenAI API key (for LLM integration)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/mcp-microsoft-office.git
   cd mcp-microsoft-office
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up Microsoft Authentication**
   - Register a new app in the [Azure Portal](https://portal.azure.com/#blade/Microsoft_AAD_RegisteredApps/ApplicationsListBlade)
   - Set the redirect URI to `http://localhost:3000/api/auth/callback`
   - Grant the following API permissions: `User.Read`, `Mail.Read`, `Mail.Send`, `Calendars.Read`, `Calendars.ReadWrite`, `Files.Read`
   - Create a `.env` file with your app registration details:
     ```
     CLIENT_ID=your-client-id
     TENANT_ID=your-tenant-id
     REDIRECT_URI=http://localhost:3000/api/auth/callback
     LLM_PROVIDER=openai
     OPENAI_API_KEY=your-openai-api-key
     ```

4. **Development Options**

   Start the combined server (API + frontend):
   ```bash
   npm run dev
   ```

   Start the Electron app with hot reloading:
   ```bash
   npm run dev:electron
   ```

   Start just the web version:
   ```bash
   npm run dev:web
   ```

5. **Open and authenticate**
   - For web version: Visit `http://localhost:3000`
   - For Electron: The app will open automatically
   - Click "Login with Microsoft" and complete the authentication flow

## Claude Integration

### Setting Up Claude Integration

1. **Configure Claude Desktop**:
   - Edit your Claude Desktop configuration file (typically at `~/Library/Application Support/Claude/claude_desktop_config.json`)
   - Add the MCP server configuration:
     ```json
     {
       "mcpServers": {
         "m365": {
           "command": "node",
           "args": [
             "/path/to/mcp-adapter.cjs"
           ],
           "restrictions": {}
         }
       }
     }
     ```
   - Replace `/path/to/mcp-adapter.cjs` with the absolute path to your adapter file

2. **Start Your MCP Server**:
   - Ensure your MCP server is running (`npm run dev`)
   - Authenticate with Microsoft in your browser

3. **Use with Claude**:
   - Open Claude Desktop
   - Claude will automatically connect to your MCP server
   - Ask questions about your Microsoft 365 data

### Available Tools

The MCP Gateway exposes these Microsoft 365 capabilities to Claude:

#### Mail
- `getMail` - Read emails from your inbox
- `sendMail` - Send emails on your behalf
- `searchMail` - Search for specific emails
- `flagMail` - Flag/unflag emails

#### Calendar
- `getCalendar` - Check your calendar events
- `createEvent` - Create new calendar events
- `updateEvent` - Modify existing events
- `getAvailability` - Check free/busy times
- `findMeetingTimes` - Find suitable meeting slots
- `scheduleMeeting` - Schedule meetings with smart time selection

> **Note on timezone handling**: When creating or updating calendar events, Claude may use the IANA format timezone (e.g., `Europe/Oslo`) while Microsoft's API expects Windows format (e.g., `W. Europe Standard Time`). The gateway handles this conversion automatically, but in some cases, especially for regions with multiple timezones, Claude might override the host user's or signed-in user's timezone preferences. For the most accurate results, always specify the desired timezone explicitly when scheduling events.

#### Files
- `listFiles` - Browse your OneDrive/SharePoint files
- `uploadFile` - Upload files to your storage
- `downloadFile` - Download file content
- `getFileMetadata` - Get file information

#### People
- `findPeople` - Find and resolve people by name or email
- `searchPeople` - Search across your organization
- `getRelevantPeople` - Get people most relevant to you

#### General
- `query` - Natural language queries to your Microsoft data

## Project Structure

```
/
├── mcp-adapter.cjs           # MCP adapter implementation
├── dev-server.cjs            # Express server for backend
├── data/                     # Data storage
│   └── mcp.sqlite            # SQLite database for authentication
├── logs/                     # Application logs
│   └── mcp.log               # Main log file
├── src/
│   ├── api/                  # API endpoints
│   │   ├── controllers/      # Request handlers
│   │   └── routes.cjs        # Route definitions
│   ├── auth/                 # Authentication services
│   │   └── msal-service.cjs  # Microsoft authentication
│   ├── core/                 # Core services
│   │   ├── auth-service.cjs  # Authentication
│   │   ├── monitoring-service.cjs # Logging and monitoring
│   │   ├── storage-service.cjs # Data storage
│   │   └── tools-service.cjs # Tool definitions
│   ├── graph/                # Microsoft Graph integration
│   │   ├── graph-client.cjs  # Graph API client
│   │   ├── mail-service.cjs  # Mail operations
│   │   ├── calendar-service.cjs # Calendar operations
│   │   ├── files-service.cjs # Files operations
│   │   ├── people-service.cjs # People/contacts operations
│   │   └── normalizers.cjs   # Data normalization
│   ├── llm/                  # LLM integration
│   │   └── llm-service.cjs   # Language model service
│   ├── main/                 # Electron main process
│   │   ├── index.cjs         # Entry point
│   │   ├── combined-server.cjs # Combined server for Electron
│   │   ├── menu.cjs          # Application menu
│   │   └── tray.cjs          # System tray integration
│   ├── modules/              # Functional modules
│   │   ├── module-registry.cjs # Module management
│   │   ├── mail/             # Mail module
│   │   ├── calendar/         # Calendar module
│   │   ├── files/            # Files module
│   │   └── people/           # People module
│   ├── nlu/                  # Natural language understanding
│   │   └── intent-router.cjs # Intent routing
│   └── renderer/             # Electron renderer process
│       ├── app.js            # Main application
│       ├── components/       # UI components
│       ├── index.html        # Main HTML
│       └── index.js          # Renderer entry point
└── test/                     # Tests
    ├── unit/                 # Unit tests
    ├── integration/          # Integration tests
    └── e2e/                  # End-to-end tests
```

## Development

### Adding New Capabilities

To add a new Microsoft Graph capability:

1. **Implement Graph Service**: Create/update a service in `src/graph/`
2. **Add Data Normalizer**: Add normalizer in `src/graph/normalizers.cjs`
3. **Implement Module**: Add capability to appropriate module
4. **Create API Endpoint**: Implement controller in `src/api/controllers/`
5. **Register Route**: Update routes in `src/api/routes.cjs`
6. **Define Tool**: Add tool definition in `src/core/tools-service.cjs`
7. **Add to MCP Adapter**: Update capability mapping in `mcp-adapter.cjs`

See [ProductRoadmap.md](ProductRoadmap.md) for more details on implementing new capabilities and the project's future direction.

### Testing

```bash
# Run all tests
npm test

# Run unit tests only
npm run test:unit

# Run integration tests
npm run test:integration
```

## Design Principles

- **Asynchronous Operations**: All operations use async/await with proper Promise handling
- **Error Handling**: Consistent error creation, logging, and recovery
- **Modular Architecture**: Independent modules with clear interfaces
- **Data Normalization**: Standardized response formats for all Graph data
- **Secure Authentication**: Proper token management and refresh
- **Centralized Logging**: All components log to a central service with consistent formatting
- **Electron Integration**: Proper desktop application experience with tray and menu support

## Event-Based Logging System

MCP Desktop uses a sophisticated event-based logging architecture designed for transparency in development and minimal noise in production. The system was rebuilt to eliminate memory leaks and provide comprehensive monitoring capabilities.

### Architecture Overview

The logging system consists of three core components:

1. **Event Service** (`src/core/event-service.cjs`): Pub/sub event system for decoupled communication
2. **Monitoring Service** (`src/core/monitoring-service.cjs`): Central logging with circular buffer for memory safety
3. **Error Service** (`src/core/error-service.cjs`): Standardized error creation and emission

### Key Features

- **Event-Based Architecture**: Components emit log events instead of calling monitoring directly
- **Memory Safety**: Circular buffer (100 entries max) prevents unbounded memory growth
- **Development Transparency**: Full logging in `npm run dev` mode for 100% visibility
- **Production Minimal**: Only errors logged in production (`npm run`) for end-user experience
- **Memory Monitoring**: Active monitoring with 85% warning, 95% emergency thresholds
- **Error Throttling**: Max 10 errors/second/category prevents log storms
- **Trace Correlation**: UUID-based tracing for request correlation
- **Auto-Recovery**: Emergency logging disable at critical memory usage

### Environment-Based Logging Behavior

#### Development Mode (`npm run dev`)
- **Full Transparency**: All log levels (debug, info, warn, error) are captured and displayed
- **Console Output**: Formatted logs with category prefixes: `[MCP CATEGORY] Message`
- **File Logging**: Detailed JSON logs written to `logs/mcp{date}.log`
- **UI Integration**: Real-time log viewer in the application interface
- **Memory Warnings**: Visible memory usage warnings and garbage collection triggers

#### Production Mode (`npm run`)
- **Errors Only**: Only error-level logs are captured and stored
- **Minimal Console**: No verbose output to avoid cluttering end-user experience
- **Essential File Logging**: Critical errors still logged to file for debugging
- **Silent Operation**: Normal operations produce no console output

### Component Registration and Logging

All components in the system self-register with the monitoring system using consistent patterns:

#### API Controllers (`src/api/controllers/`)

Controllers import monitoring and error services directly:

```javascript
const MonitoringService = require('../../core/monitoring-service.cjs');
const ErrorService = require('../../core/error-service.cjs');

// Request logging
MonitoringService.info(`Processing ${req.method} ${req.path}`, {
    requestId: req.requestId,
    method: req.method,
    path: req.path,
    query: req.query,
    ip: req.ip
}, 'api');

// Error handling
const error = ErrorService.createError(
    'api', 
    'Calendar validation error', 
    'warning', 
    { details: validationError.details, endpoint: '/api/v1/calendar' }
);
```

**Categories used**: `api`, `api-request`, `validation`

#### Functional Modules (`src/modules/`)

Modules register capabilities and log their operations:

```javascript
// Module initialization
MonitoringService.info('CalendarModule initialized successfully', {
    capabilities: CALENDAR_CAPABILITIES,
    moduleId: 'calendar'
}, 'calendar');

// Intent handling
MonitoringService.debug(`Handling intent: ${intent}`, {
    intent,
    parameters: intentParams,
    traceId
}, 'calendar');

// Error scenarios
MonitoringService.error('Failed to get calendars', {
    error: error.message,
    traceId,
    capability: 'getCalendars'
}, 'calendar');
```

**Categories used**: `calendar`, `mail`, `files`, `people`, `module`, `intent`

#### Graph Services (`src/graph/`)

Graph services log Microsoft Graph API interactions:

```javascript
// API requests
MonitoringService.debug('Making Graph API request', {
    method: 'GET',
    endpoint: '/me/events',
    traceId
}, 'graph');

// API responses
MonitoringService.info('Graph API response received', {
    statusCode: response.status,
    responseTime: `${Date.now() - startTime}ms`,
    traceId
}, 'graph');

// Error handling
MonitoringService.error('Graph API request failed', {
    statusCode: error.code,
    message: error.message,
    endpoint,
    traceId
}, 'graph');
```

**Categories used**: `graph`, `auth`, `normalizer`

#### Core Services (`src/core/`)

Core services handle fundamental operations:

```javascript
// Authentication events
MonitoringService.info('MSAL token acquired', {
    scopes: tokenResponse.scopes,
    expiresIn: tokenResponse.expiresOn,
    account: tokenResponse.account?.username
}, 'auth');

// Storage operations
MonitoringService.debug('Cache entry updated', {
    key: cacheKey,
    ttl: ttlSeconds,
    size: JSON.stringify(data).length
}, 'storage');
```

**Categories used**: `auth`, `storage`, `cache`, `system`

### Log Entry Structure

Each log entry follows a standardized format:

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "timestamp": "2025-01-24T12:00:00.000Z",
  "level": "info",
  "category": "calendar",
  "message": "Event created successfully",
  "context": {
    "eventId": "AAMkADA...",
    "subject": "Team Meeting",
    "attendeeCount": 5,
    "traceId": "req_123456",
    "duration": "45ms"
  },
  "pid": 1234,
  "hostname": "computer-name",
  "version": "0.1.0"
}
```

### Memory Management

The system includes sophisticated memory management:

- **Circular Buffer**: Fixed 100-entry buffer prevents unbounded growth
- **Memory Monitoring**: Checks every 30 seconds, warns at 85% usage
- **Emergency Protection**: Disables logging at 95% memory usage
- **Garbage Collection**: Forces GC when memory warnings occur
- **Error Throttling**: Prevents log storms (10 errors/second/category max)

### Event Flow

1. **Component Action**: API controller, module, or service performs an operation
2. **Log Creation**: Component calls monitoring service with appropriate level and category
3. **Buffer Storage**: Log is added to circular buffer (replacing oldest if full)
4. **File Writing**: Winston writes structured JSON to log file
5. **Console Output**: Formatted console output (development only)
6. **UI Update**: Real-time log viewer updates (if enabled)

### Troubleshooting and Monitoring

#### Viewing Logs

- **Real-time UI**: Use the built-in log viewer in the application
- **Log Files**: Check `logs/mcp{YYYYMMDD}.log` for historical data
- **Console**: Run `npm run dev` for live console output
- **Memory Usage**: Monitor for memory warnings in console

#### Common Categories

| Category | Purpose | Components |
|----------|---------|------------|
| `api` | HTTP request/response logging | Controllers |
| `calendar` | Calendar operations | Calendar module, controller |
| `mail` | Email operations | Mail module, controller |
| `files` | File operations | Files module, controller |
| `people` | People/contacts operations | People module, controller |
| `graph` | Microsoft Graph API calls | Graph services |
| `auth` | Authentication flows | MSAL service, auth service |
| `module` | Module lifecycle events | Module registry |
| `system` | System-level events | Core services |
| `error` | Error creation and handling | Error service |

#### Performance Monitoring

The system automatically tracks:
- Request duration and response times
- Memory usage and garbage collection
- API call success/failure rates
- Error frequency and throttling
- Cache hit/miss ratios

This comprehensive logging system ensures complete transparency during development while maintaining a clean, minimal experience for end users.

## Contributing

We welcome contributions! Please see our [ProductRoadmap.md](ProductRoadmap.md) for planned features and enhancement ideas.

## License

[MIT](LICENSE)