/**
 * @fileoverview Database fix script for MCP Microsoft Office
 * This script creates the user_logs table directly to fix the migration issue
 */

// Load environment variables from .env file
require('dotenv').config();

const fs = require('fs');
const path = require('path');
const sqlite3 = require('sqlite3').verbose();

// Database path
const DB_PATH = './data/mcp.sqlite';

// Ensure data directory exists
const dataDir = path.dirname(DB_PATH);
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
  console.log(`✅ Created data directory: ${dataDir}`);
}

console.log('🔄 MCP Database Fix Script');
console.log('==============================');

// Connect to the database
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) {
    console.error(`❌ Failed to connect to database: ${err.message}`);
    process.exit(1);
  }
  console.log(`✅ Connected to the database: ${DB_PATH}`);
});

// Run all operations in a transaction
db.serialize(() => {
  // Begin transaction
  db.run('BEGIN TRANSACTION');

  // Check if user_logs table exists
  db.get("SELECT name FROM sqlite_master WHERE type='table' AND name='user_logs'", (err, row) => {
    if (err) {
      console.error(`❌ Error checking for user_logs table: ${err.message}`);
      db.run('ROLLBACK');
      db.close();
      process.exit(1);
    }

    if (row) {
      console.log('✅ user_logs table already exists');
      finishTransaction();
    } else {
      console.log('🔄 Creating user_logs table...');
      
      // Create the user_logs table
      db.run(`
        CREATE TABLE IF NOT EXISTS user_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_id TEXT NOT NULL,
          level TEXT NOT NULL,
          message TEXT NOT NULL,
          category TEXT,
          context TEXT,
          timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
          trace_id TEXT,
          device_id TEXT
        )
      `, (err) => {
        if (err) {
          console.error(`❌ Failed to create user_logs table: ${err.message}`);
          db.run('ROLLBACK');
          db.close();
          process.exit(1);
        }
        
        console.log('✅ Created user_logs table');
        
        // Create indices for the user_logs table
        const indices = [
          { name: 'idx_user_logs_user_id', columns: 'user_id' },
          { name: 'idx_user_logs_timestamp', columns: 'timestamp' },
          { name: 'idx_user_logs_category', columns: 'category' },
          { name: 'idx_user_logs_level', columns: 'level' }
        ];
        
        let indexCount = 0;
        indices.forEach(index => {
          db.run(`CREATE INDEX IF NOT EXISTS ${index.name} ON user_logs(${index.columns})`, (err) => {
            if (err) {
              console.error(`❌ Failed to create index ${index.name}: ${err.message}`);
            } else {
              indexCount++;
              if (indexCount === indices.length) {
                console.log(`✅ Created ${indexCount} indices for user_logs table`);
                
                // Update migration_history to record this migration
                db.get("SELECT MAX(version) as max_version FROM migration_history", (err, row) => {
                  if (err) {
                    console.error(`❌ Error checking migration history: ${err.message}`);
                    db.run('ROLLBACK');
                    db.close();
                    process.exit(1);
                  }
                  
                  const currentVersion = row ? row.max_version : 0;
                  const newVersion = currentVersion + 1;
                  
                  db.run(
                    'INSERT INTO migration_history (version, name) VALUES (?, ?)',
                    [newVersion, 'user_logs'],
                    (err) => {
                      if (err) {
                        console.error(`❌ Failed to update migration history: ${err.message}`);
                        db.run('ROLLBACK');
                        db.close();
                        process.exit(1);
                      }
                      
                      console.log(`✅ Updated migration history to version ${newVersion}`);
                      finishTransaction();
                    }
                  );
                });
              }
            }
          });
        });
      });
    }
  });

  function finishTransaction() {
    // Commit transaction
    db.run('COMMIT', (err) => {
      if (err) {
        console.error(`❌ Failed to commit transaction: ${err.message}`);
        db.run('ROLLBACK');
        db.close();
        process.exit(1);
      }
      
      console.log('\n✅ Database fix completed successfully!');
      console.log('\nNext steps:');
      console.log('1. Run "npm run dev:web" to start the development server');
      console.log('2. The user_logs table should now be available for log storage');
      
      // Close the database connection
      db.close((err) => {
        if (err) {
          console.error(`❌ Error closing database: ${err.message}`);
          process.exit(1);
        }
      });
    });
  }
});
