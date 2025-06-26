#!/bin/bash

# Simple MCP Setup Script
# This script helps you set up the simple MCP adapter with bearer token authentication

echo "🔧 MCP Microsoft 365 Simple Setup"
echo "=================================="
echo ""

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed. Please install Node.js first."
    exit 1
fi

echo "✅ Node.js is installed"

# Get the current directory
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ADAPTER_PATH="$SCRIPT_DIR/mcp-adapter.cjs"

# Check if the adapter exists
if [ ! -f "$ADAPTER_PATH" ]; then
    echo "❌ MCP adapter not found at: $ADAPTER_PATH"
    exit 1
fi

echo "✅ MCP adapter found"

# Make the adapter executable
chmod +x "$ADAPTER_PATH"

echo "📋 Setup Instructions:"
echo "====================="
echo ""
echo "1. Start the MCP server:"
echo "   npm start"
echo ""
echo "2. Open your browser and go to:"
echo "   http://localhost:3000"
echo ""
echo "3. Click 'Connect to Microsoft 365' and authenticate"
echo ""
echo "4. Click 'Generate MCP Token' and copy the token"
echo ""
echo "5. Update your Claude Desktop config with:"
echo ""
echo "{"
echo "  \"mcpServers\": {"
echo "    \"microsoft365\": {"
echo "      \"command\": \"node\","
echo "      \"args\": [\"$ADAPTER_PATH\"],"
echo "      \"env\": {"
echo "        \"MCP_SERVER_URL\": \"http://localhost:3000\","
echo "        \"MCP_BEARER_TOKEN\": \"YOUR_GENERATED_TOKEN_HERE\""
echo "      }"
echo "    }"
echo "  }"
echo "}"
echo ""
echo "6. Restart Claude Desktop"
echo ""
echo "🎉 You're all set! Claude can now access your Microsoft 365 data."
echo ""
echo "📁 Claude Desktop config location:"
echo "   macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
echo "   Windows: %APPDATA%\\Claude\\claude_desktop_config.json"
echo "   Linux: ~/.config/Claude/claude_desktop_config.json"
