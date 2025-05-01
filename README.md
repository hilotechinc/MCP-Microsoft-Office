# Microsoft 365 MCP Gateway

Microsoft 365 MCP Gateway is a bridge that connects Claude to your Microsoft 365 data through the Model Context Protocol (MCP). It enables natural language access to emails, calendar events, files, and contacts with proper authentication and security.

## Architecture Overview

The system consists of three main components:

1. **MCP Adapter (`mcp-adapter.cjs`)**: Implements the Model Context Protocol to allow Claude to communicate with Microsoft 365 services.
2. **Backend Server (`dev-server.cjs`)**: Express server that handles authentication, API endpoints, and Microsoft Graph integration.
3. **Database (`mcp.sqlite`)**: Local SQLite database for storing authentication tokens and session data.

```
┌────────────────┐      ┌───────────────────┐     ┌─────────────────────┐
│                │      │                   │     │                     │
│  Claude LLM    │◄────►│  MCP Adapter      │◄───►│  Backend Server     │
│                │      │  (mcp-adapter.cjs)│     │  (dev-server.cjs)   │
│                │      │                   │     │                     │
└────────────────┘      └───────────────────┘     └──────────┬──────────┘
                                                             │
                                                             ▼
┌────────────────────────────┐                     ┌─────────────────────┐
│                            │                     │                     │
│  Microsoft Graph Services  │◄────────────────────┤  Auth & Storage     │
│  (src/graph/*)             │                     │  Services           │
│                            │                     │                     │
└────────────────────────────┘                     └─────────────────────┘
```

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