# MCP Microsoft 365 API: LLM Integration Guide

This project exposes Microsoft 365 mail, calendar, and files via a modular HTTP API, with support for LLM plugin protocols (OpenAPI, Claude MCP, etc).

## API Endpoints

- All endpoints are under `/api/v1/`
- See [`openapi.yaml`](./openapi.yaml) for full schema and parameters.
- Tool manifest available at `/api/tools`.

### Main Endpoints
| Endpoint               | Method | Purpose                       |
|------------------------|--------|-------------------------------|
| `/query`               | POST   | Natural language query        |
| `/mail`                | GET    | List inbox mail               |
| `/mail/send`           | POST   | Send an email                 |
| `/calendar`            | GET    | List calendar events          |
| `/calendar/create`     | POST   | Create a calendar event       |
| `/files`               | GET    | List files                    |
| `/files/upload`        | POST   | Upload a file                 |

## LLM/Agent Integration

### 1. **OpenAI, Google, Most LLMs**
- Use the HTTP API directly.
- Import [`openapi.yaml`](./openapi.yaml) or `/api/tools` for auto-discovery.
- Each endpoint is single-responsibility and fully documented.

### 2. **Claude Desktop Plugin (MCP Protocol)**
- Use the `mcp-adapter.js` script as your MCP entrypoint.
- Update your Claude config:
  ```json
  {
    "mcpServers": {
      "m365": {
        "command": "node",
        "args": ["/path/to/mcp-adapter.js"],
        "restrictions": {}
      }
    }
  }
  ```
- The adapter translates MCP JSON-RPC calls to HTTP requests to your API.
- **Logs go to stderr only.**

### 3. **Authentication**
- Microsoft OAuth (PKCE) is required for all protected endpoints.
- If not authenticated, the API returns a login URL (`/api/login`).
- User must complete login in their browser.

## Extending for New LLMs
- Keep the HTTP API modular and documented.
- Add new adapters/wrappers for other plugin protocols as needed.
- Contribute OpenAPI/manifest updates for new endpoints.

## References
- [openapi.yaml](./openapi.yaml)
- [MCP Adapter](./mcp-adapter.js)
- [Claude Plugin Protocol](https://modelcontextprotocol.io/docs/tools/quickstart)
- [OpenAI Plugin Docs](https://platform.openai.com/docs/plugins)

---

**Contact:** For questions or contributions, open an issue or email the maintainer.
