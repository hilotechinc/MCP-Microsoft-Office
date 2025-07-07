#!/usr/bin/env node

/**
 * Project Setup Script for MCP Microsoft Office
 * This script automatically initializes the project after npm install
 */

const fs = require('fs');
const path = require('path');

const DB_PATH = path.join(__dirname, '../data/mcp.sqlite');
const DATA_DIR = path.join(__dirname, '../data');
const ENV_PATH = path.join(__dirname, '../.env');
const ENV_EXAMPLE_PATH = path.join(__dirname, '../.env.example');

console.log('🚀 MCP Microsoft Office - Project Setup');
console.log('=====================================');

// Create data directory if it doesn't exist
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  console.log('✅ Created data directory');
}

// Initialize database (remove existing if present)
if (fs.existsSync(DB_PATH)) {
  try {
    fs.unlinkSync(DB_PATH);
    console.log('✅ Removed existing database file');
  } catch (error) {
    console.error('❌ Failed to remove database file:', error.message);
    process.exit(1);
  }
} else {
  console.log('ℹ️  No existing database found (this is normal for fresh setups)');
}

// Check for .env file and create from example if needed
if (!fs.existsSync(ENV_PATH)) {
  if (fs.existsSync(ENV_EXAMPLE_PATH)) {
    try {
      fs.copyFileSync(ENV_EXAMPLE_PATH, ENV_PATH);
      console.log('✅ Created .env file from .env.example');
      console.log('⚠️  Please edit .env file with your Microsoft 365 credentials');
    } catch (error) {
      console.error('❌ Failed to create .env file:', error.message);
    }
  } else {
    // Create a basic .env file
    const basicEnvContent = `# Microsoft 365 Configuration
# Get these values from Azure App Registration
MICROSOFT_CLIENT_ID=your_client_id_here
MICROSOFT_TENANT_ID=your_tenant_id_here

# Optional: Database Configuration
# DATABASE_TYPE=sqlite
# DATABASE_PATH=./data/mcp.sqlite

# Optional: Server Configuration
# PORT=3000
# NODE_ENV=development

# Optional: LLM Configuration (for natural language processing)
# OPENAI_API_KEY=your_openai_key_here
# CLAUDE_API_KEY=your_claude_key_here
`;
    
    try {
      fs.writeFileSync(ENV_PATH, basicEnvContent);
      console.log('✅ Created basic .env file');
      console.log('⚠️  Please edit .env file with your Microsoft 365 credentials');
    } catch (error) {
      console.error('❌ Failed to create .env file:', error.message);
    }
  }
} else {
  console.log('ℹ️  .env file already exists');
}

console.log('');
console.log('✅ Project setup complete!');
console.log('');
console.log('🎯 Next steps:');
console.log('1. Edit .env file with your Microsoft 365 app credentials');
console.log('   - Get these from Azure App Registration Portal');
console.log('   - Set MICROSOFT_CLIENT_ID and MICROSOFT_TENANT_ID');
console.log('');
console.log('2. Start the development server:');
console.log('   npm run dev:web');
console.log('');
console.log('3. The database will be automatically created with the latest schema');
console.log('   when the server starts for the first time');
console.log('');
console.log('📚 For detailed setup instructions, see README.md');
console.log('');
