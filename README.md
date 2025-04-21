# MCP Project

The Microsoft Cloud Platform (MCP) Server is a cross-platform desktop application that enables natural language interaction with Microsoft 365 services through Large Language Models (LLMs). Users can chat naturally with an AI assistant about their emails, calendar events, documents, and other Microsoft services, receiving contextual insights and taking actions through conversation rather than switching between multiple applications.

## Key Features (Phase 1)
- Support for Mail, Calendar, and OneDrive modules
- Basic natural language query capabilities
- Desktop app with conversational UI
- Microsoft authentication via MSAL
- In-memory caching for performance
- Local data storage via SQLite
- Hybrid NLU (pattern matching + external LLM)

## Directory Structure
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

## Getting Started
1. Clone the repository
2. Install dependencies: `npm install`
3. Start the app: `npm run dev`

## License
TBD
