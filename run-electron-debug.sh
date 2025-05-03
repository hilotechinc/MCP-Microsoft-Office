#!/bin/bash

# Kill any existing processes on port 3000
echo "Checking for existing processes on port 3000..."
PID=$(lsof -t -i:3000 2>/dev/null)
if [ ! -z "$PID" ]; then
  echo "Killing existing process on port 3000 (PID: $PID)"
  kill -9 $PID
fi

# Clear any previous logs
if [ -f electron-debug.log ]; then
  echo "Removing previous debug log"
  rm electron-debug.log
fi

# Run the electron debugging script
echo "Starting Electron diagnostic tool..."
npx electron electron-debugger.js

# Show the log after it runs
if [ -f electron-debug.log ]; then
  echo "----------------------"
  echo "Diagnostic log output:"
  echo "----------------------"
  cat electron-debug.log
  echo "----------------------"
  echo "Diagnostic log saved to electron-debug.log"
fi