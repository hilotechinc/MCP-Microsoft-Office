#!/bin/bash

# Run the Electron app with additional error handling
echo "Starting MCP Desktop Electron app..."

# Kill any existing node processes on port 3000
echo "Checking for existing processes on port 3000..."
PID=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$PID" ]; then
  echo "Killing existing process on port 3000 (PID: $PID)"
  kill -9 $PID
fi

# Run the Electron app
echo "Launching Electron app..."
npm run start

# Exit status
EXIT_CODE=$?
if [ $EXIT_CODE -ne 0 ]; then
  echo "Error: Electron app exited with code $EXIT_CODE"
else
  echo "Electron app exited normally"
fi