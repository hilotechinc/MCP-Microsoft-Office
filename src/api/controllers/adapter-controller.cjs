/**
 * @fileoverview MCP Adapter Controller
 * Handles generating and serving configured MCP adapters for devices
 */

const fs = require('fs').promises;
const path = require('path');
const ErrorService = require('../../core/error-service.cjs');
const MonitoringService = require('../../core/monitoring-service.cjs');
const { getConfig } = require('../../config/index.cjs');

/**
 * Generate and download MCP adapter for a specific device
 * GET /api/adapter/download/:deviceId
 */
async function downloadAdapter(req, res) {
    try {
        // 1. DEVELOPMENT DEBUG - Console only in development
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('MCP adapter download requested', { 
                deviceId: req.params.deviceId, 
                userAgent: req.get('User-Agent') 
            }, 'adapter');
        }

        const { deviceId } = req.params;
        
        if (!deviceId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Device ID is required'
            });
        }

        // Get server configuration
        const config = await getConfig();
        const serverUrl = config.SERVER_URL || `http://localhost:${config.PORT}`;

        // Read the adapter template
        const templatePath = path.join(__dirname, '../../../dist/mcp-adapter-template.cjs');
        let adapterTemplate = await fs.readFile(templatePath, 'utf8');

        // Replace placeholder with actual server URL
        const configuredAdapter = adapterTemplate.replace(
            'const SERVER_URL = \'{{SERVER_URL}}\';',
            `const SERVER_URL = '${serverUrl}';`
        );

        // Set appropriate headers for file download
        res.setHeader('Content-Type', 'application/javascript');
        res.setHeader('Content-Disposition', `attachment; filename="mcp-microsoft-office-${deviceId}.cjs"`);
        res.setHeader('Cache-Control', 'no-cache');

        MonitoringService.info('MCP adapter downloaded', {
            deviceId,
            serverUrl,
            timestamp: new Date().toISOString()
        }, 'adapter');

        // 2. USER ACTIVITY - Always logged to database, user-specific
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.userActivity(userId, 'Downloaded MCP adapter', {
                deviceId,
                timestamp: new Date().toISOString()
            });
        }

        res.send(configuredAdapter);

    } catch (error) {
        // 3. INFRASTRUCTURE ERRORS - Always to console for server ops
        const mcpError = ErrorService.createError(
            'api',
            'Failed to generate MCP adapter',
            'error',
            { 
                endpoint: '/api/adapter/download',
                deviceId: req.params.deviceId,
                error: error.message 
            }
        );
        MonitoringService.logError(mcpError);
        
        // 4. USER ERROR TRACKING - To database for user visibility
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.userActivity(userId, 'MCP adapter download failed', {
                deviceId: req.params.deviceId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to generate adapter'
        });
    }
}

/**
 * Generate package.json for MCP adapter
 * GET /api/adapter/package/:deviceId
 */
async function downloadPackageJson(req, res) {
    try {
        // 1. DEVELOPMENT DEBUG - Console only in development
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Package.json download requested', { 
                deviceId: req.params.deviceId,
                userAgent: req.get('User-Agent')
            }, 'adapter');
        }

        const { deviceId } = req.params;
        
        if (!deviceId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Device ID is required'
            });
        }

        const packageJson = {
            "name": `mcp-microsoft-office-${deviceId}`,
            "version": "1.0.0",
            "description": "MCP adapter for Microsoft Office integration",
            "main": `mcp-microsoft-office-${deviceId}.cjs`,
            "type": "commonjs",
            "dependencies": {
                "@modelcontextprotocol/sdk": "^0.5.0"
            },
            "scripts": {
                "start": `node mcp-microsoft-office-${deviceId}.cjs`
            },
            "keywords": ["mcp", "microsoft", "office", "claude"],
            "author": "MCP Microsoft Office",
            "license": "MIT"
        };

        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', 'attachment; filename="package.json"');
        res.setHeader('Cache-Control', 'no-cache');

        MonitoringService.info('Package.json downloaded', {
            deviceId,
            timestamp: new Date().toISOString()
        }, 'adapter');

        // 2. USER ACTIVITY - Always logged to database, user-specific
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.userActivity(userId, 'Downloaded package.json for MCP adapter', {
                deviceId,
                timestamp: new Date().toISOString()
            });
        }

        res.json(packageJson);

    } catch (error) {
        // 3. INFRASTRUCTURE ERRORS - Always to console for server ops
        const mcpError = ErrorService.createError(
            'api',
            'Failed to generate package.json',
            'error',
            { 
                endpoint: '/api/adapter/package',
                deviceId: req.params.deviceId,
                error: error.message 
            }
        );
        MonitoringService.logError(mcpError);

        // 4. USER ERROR TRACKING - To database for user visibility
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.userActivity(userId, 'Package.json download failed', {
                deviceId: req.params.deviceId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to generate package.json'
        });
    }
}

/**
 * Generate setup instructions for MCP adapter
 * GET /api/adapter/setup/:deviceId
 */
async function downloadSetupInstructions(req, res) {
    try {
        // 1. DEVELOPMENT DEBUG - Console only in development
        if (process.env.NODE_ENV === 'development') {
            MonitoringService.debug('Setup instructions download requested', { 
                deviceId: req.params.deviceId,
                userAgent: req.get('User-Agent')
            }, 'adapter');
        }

        const { deviceId } = req.params;
        
        if (!deviceId) {
            return res.status(400).json({
                error: 'invalid_request',
                error_description: 'Device ID is required'
            });
        }

        const config = await getConfig();
        const serverUrl = config.SERVER_URL || `http://localhost:${config.PORT}`;

        const setupInstructions = `# MCP Microsoft Office Adapter Setup

## Device ID: ${deviceId}
## Server: ${serverUrl}

### Installation Steps

1. **Create a directory for your MCP adapter:**
   \`\`\`bash
   mkdir mcp-microsoft-office-${deviceId}
   cd mcp-microsoft-office-${deviceId}
   \`\`\`

2. **Download the required files:**
   - Download \`mcp-microsoft-office-${deviceId}.cjs\`
   - Download \`package.json\`
   - Place both files in the directory created above

3. **Install dependencies:**
   \`\`\`bash
   npm install
   \`\`\`

4. **Configure Claude Desktop:**
   
   Edit your Claude Desktop configuration file:
   - **macOS**: \`~/Library/Application Support/Claude/claude_desktop_config.json\`
   - **Windows**: \`%APPDATA%\\Claude\\claude_desktop_config.json\`

   Add this configuration:
   \`\`\`json
   {
     "mcpServers": {
       "microsoft-office": {
         "command": "node",
         "args": ["/absolute/path/to/mcp-microsoft-office-${deviceId}.cjs"],
         "env": {}
       }
     }
   }
   \`\`\`

   **Important**: Replace \`/absolute/path/to/\` with the actual absolute path to your adapter file.

5. **Restart Claude Desktop** to load the new configuration.

6. **Device Authorization:**
   - The adapter will automatically start the device authorization flow when Claude first tries to use Microsoft Office tools
   - Follow the prompts to authorize your device with Microsoft 365
   - You can also manage devices at: ${serverUrl}

### Troubleshooting

- **Tools not available**: Check Claude Desktop logs and verify the absolute path in your configuration
- **Authorization issues**: Visit ${serverUrl} to manage your authorized devices
- **Connection problems**: Ensure the server at ${serverUrl} is accessible

### Available Tools

Once authorized, you can use these Microsoft 365 tools in Claude:
- Email management (read, search, send)
- Calendar operations (view, create, update events)
- File operations (search, read OneDrive/SharePoint files)
- Contact management (search, view contacts)

For more help, visit: ${serverUrl}
`;

        res.setHeader('Content-Type', 'text/markdown');
        res.setHeader('Content-Disposition', 'attachment; filename="SETUP.md"');
        res.setHeader('Cache-Control', 'no-cache');

        MonitoringService.info('Setup instructions downloaded', {
            deviceId,
            serverUrl,
            timestamp: new Date().toISOString()
        }, 'adapter');

        // 2. USER ACTIVITY - Always logged to database, user-specific
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.userActivity(userId, 'Downloaded MCP adapter setup instructions', {
                deviceId,
                timestamp: new Date().toISOString()
            });
        }

        res.send(setupInstructions);

    } catch (error) {
        // 3. INFRASTRUCTURE ERRORS - Always to console for server ops
        const mcpError = ErrorService.createError(
            'api',
            'Failed to generate setup instructions',
            'error',
            { 
                endpoint: '/api/adapter/setup',
                deviceId: req.params.deviceId,
                error: error.message 
            }
        );
        MonitoringService.logError(mcpError);

        // 4. USER ERROR TRACKING - To database for user visibility
        const userId = req?.user?.userId;
        if (userId) {
            MonitoringService.userActivity(userId, 'Setup instructions download failed', {
                deviceId: req.params.deviceId,
                error: error.message,
                timestamp: new Date().toISOString()
            });
        }

        res.status(500).json({
            error: 'server_error',
            error_description: 'Failed to generate setup instructions'
        });
    }
}

module.exports = {
    downloadAdapter,
    downloadPackageJson,
    downloadSetupInstructions
};
