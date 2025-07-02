#!/usr/bin/env node

/**
 * Database Reset Script for MCP Microsoft Office
 * This script safely removes the database and allows it to be regenerated on next startup
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/mcp.sqlite');
const DATA_DIR = path.join(__dirname, '../data');

console.log('🔄 MCP Database Reset Script');
console.log('==============================');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('✅ Created data directory');
}

// Remove existing database if it exists
if (fs.existsSync(DB_PATH)) {
  try {
    fs.unlinkSync(DB_PATH);
    console.log('✅ Removed existing database file');
  } catch (error) {
    console.error('❌ Failed to remove database file:', error.message);
    process.exit(1);
  }
} else {
  console.log('ℹ️  No existing database file found (this is normal for fresh setups)');
}

console.log('');
console.log('✅ Database reset complete!');
console.log('');
console.log('Next steps:');
console.log('1. Make sure your .env file has the correct configuration (see .env.example)');
console.log('2. Run "npm run dev" to start the server');
console.log('3. The database will be automatically created with the latest schema');
console.log('');