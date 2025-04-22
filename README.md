# MCP Project

The Microsoft Cloud Platform (MCP) Server is a cross-platform desktop application that enables natural language interaction with Microsoft 365 services (Mail, Calendar, OneDrive) via Large Language Models (LLMs). MCP unifies the Microsoft 365 experience, letting users chat with an AI assistant to manage emails, meetings, and documents—all with contextual insights and automation.

---

## Vision & Value Proposition
- **Conversational Productivity:** Natural language is the interface for all Microsoft 365 data and actions.
- **Unified Context:** Brings together mail, calendar, and files with cross-app insights.
- **Privacy by Design:** Data is processed locally where possible.
- **Test-Driven, Modular, and Async:** Every component is independently testable, non-blocking, and replaceable.

---

## Architecture Overview

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

---

## How MCP Works
1. **User Query:** User enters a natural language request in the UI.
2. **NLU & Intent Routing:** Hybrid NLU (pattern matching + LLM) extracts intent and entities.
3. **Module Handling:** Intent is routed to the appropriate module (Mail, Calendar, Files).
4. **Graph API Access:** Module uses async, dependency-injected GraphClient for secure Microsoft 365 access.
5. **Normalization:** Data is normalized for consistency and privacy before returning to the UI.
6. **Response:** UI displays results and possible next actions.

---

## Design Principles
- **Modular:** Each service (mail, calendar, files) is an independent, injectable module. Modules expose only normalized, well-defined APIs.
- **Async/Non-blocking:** All operations are async/await, never blocking the event loop. Promises are always handled.
- **Test-Driven:** Every module and function has comprehensive unit tests. Tests cover core logic, error, and throttling scenarios.
- **Error Handling:** Centralized, standardized error creation and logging. All errors are caught and reported with context.
- **Validation:** Joi schemas validate all API inputs and outputs.
- **Caching:** In-memory cache for Graph API calls, with TTL and invalidation.
- **Security:** MSAL public client flow for authentication, no secrets in code, tokens stored securely.

---

## Directory Structure
- `src/`
  - `main/` — Electron main process
  - `core/` — Core services (auth, cache, error, monitoring, storage)
  - `api/` — Local API server (Express)
  - `graph/` — Microsoft Graph integration (modular, test-driven)
  - `modules/` — Functional modules (mail, calendar, files)
  - `nlu/` — Natural language understanding
  - `utils/` — Utilities and validation schemas
  - `renderer/` — Electron renderer (UI)
- `test/` — Unit, integration, and E2E tests (Jest)
- `config/` — Build and tooling configuration

---

## Getting Started
1. Clone the repository
2. Install dependencies: `npm install`
3. Start the app: `npm run dev`

---

## Example: Test-Driven, Modular, Async Code
```js
// src/graph/mail-service.js (excerpt)
/**
 * Retrieves inbox emails (normalized, async, robust to throttling).
 */
async function getInbox(options = {}) {
  const client = await graphClientFactory.createClient();
  const res = await client.api('/me/mailFolders/inbox/messages?$top=10').get();
  return (res.value || []).map(normalizeEmail);
}
```
```js
// test/unit/graph/mail-service.test.js (excerpt)
it('should retrieve inbox emails', async () => {
  const emails = await mailService.getInbox({ top: 1 });
  expect(Array.isArray(emails)).toBe(true);
  expect(emails[0]).toHaveProperty('id');
});
```

---

## Success Criteria
- All modules are async, modular, and test-driven
- UI responds to natural language queries with Microsoft 365 data
- Data is normalized and privacy-preserving
- Error handling and validation are robust and standardized
- System is easily extensible for future modules (e.g., People, Teams)

---

## License
TBD
