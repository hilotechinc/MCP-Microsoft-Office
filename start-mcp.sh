#!/bin/bash

# MCP Desktop launcher with improved startup sequence
# This script ensures proper startup of the MCP Desktop application

# Change to the project directory
cd "$(dirname "$0")"

# Set environment variables
export NODE_ENV=development
export ELECTRON_ENABLE_LOGGING=1
export ELECTRON_ENABLE_STACK_DUMPING=1

# Kill any existing processes on port 3000
echo "Checking for existing processes on port 3000..."
PID=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$PID" ]; then
  echo "Killing existing process on port 3000 (PID: $PID)"
  kill -9 $PID
  # Wait to ensure the port is fully released
  sleep 2
fi

# Start the combined server first and wait for it to initialize
echo "Starting MCP server..."
node src/main/combined-server.cjs > /tmp/mcp-server.log 2>&1 &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to initialize..."
ATTEMPTS=0
MAX_ATTEMPTS=10
SUCCESS=0

while [ $ATTEMPTS -lt $MAX_ATTEMPTS ]; do
  ATTEMPTS=$((ATTEMPTS+1))
  echo "Checking server (attempt $ATTEMPTS/$MAX_ATTEMPTS)..."
  
  if curl -s http://localhost:3000/api/health > /dev/null; then
    echo "Server is running!"
    SUCCESS=1
    break
  fi
  
  # Check if server process is still running
  if ! kill -0 $SERVER_PID 2>/dev/null; then
    echo "Error: Server process died unexpectedly"
    cat /tmp/mcp-server.log
    exit 1
  fi
  
  sleep 1
done

if [ $SUCCESS -eq 0 ]; then
  echo "Error: Server did not start properly after $MAX_ATTEMPTS attempts"
  kill -9 $SERVER_PID 2>/dev/null
  cat /tmp/mcp-server.log
  exit 1
fi

# Set environment variable to let Electron know server is already running
export MCP_SERVER_STARTED="true"

# Now start Electron
echo "Starting Electron app..."
npx electron . 

# Cleanup server when Electron exits
echo "Electron app exited, cleaning up server process..."
kill -9 $SERVER_PID 2>/dev/null

echo "Done!"