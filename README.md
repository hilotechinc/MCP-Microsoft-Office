# Microsoft 365 MCP Gateway

Microsoft 365 MCP Gateway is a bridge that connects Claude to your Microsoft 365 data through the Model Context Protocol (MCP). It enables natural language access to emails, calendar events, files, and contacts with proper authentication and security.

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
- Node.js (v16+)
- npm or yarn
- Microsoft 365 account
- Microsoft Azure App Registration (for Graph API)

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
     MICROSOFT_CLIENT_ID=your-client-id
     MICROSOFT_TENANT_ID=your-tenant-id
     MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/callback
     ```

4. **Start the server**
   ```bash
   npm run dev
   ```

5. **Open in browser and authenticate**
   - Visit `http://localhost:3000`
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
├── data/
│   └── mcp.sqlite            # SQLite database for authentication
├── src/
│   ├── api/                  # API endpoints
│   │   ├── controllers/      # Request handlers
│   │   └── routes.cjs        # Route definitions
│   ├── core/                 # Core services
│   │   ├── auth-service.cjs  # Authentication
│   │   ├── storage-service.cjs # Data storage
│   │   └── tools-service.cjs # Tool definitions
│   ├── graph/                # Microsoft Graph integration
│   │   ├── graph-client.cjs  # Graph API client
│   │   ├── mail-service.cjs  # Mail operations
│   │   ├── calendar-service.cjs # Calendar operations
│   │   ├── files-service.cjs # Files operations
│   │   ├── people-service.cjs # People/contacts operations
│   │   └── normalizers.cjs   # Data normalization
│   └── modules/              # Functional modules
│       ├── module-registry.cjs # Module management
│       ├── mail/             # Mail module
│       ├── calendar/         # Calendar module
│       ├── files/            # Files module
│       └── people/           # People module
└── test/                     # Tests
    ├── unit/                 # Unit tests
    └── integration/          # Integration tests
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

## Contributing

We welcome contributions! Please see our [ProductRoadmap.md](ProductRoadmap.md) for planned features and enhancement ideas.

## License

[MIT](LICENSE)