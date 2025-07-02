#!/usr/bin/env node

/**
 * Debug script to check user ID consistency between session and JWT tokens
 */

const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'mcp.sqlite');

console.log('🔍 Checking user ID consistency in logs...\n');

const db = new sqlite3.Database(dbPath, (err) => {
    if (err) {
        console.error('❌ Error opening database:', err.message);
        return;
    }
    
    console.log('✅ Connected to SQLite database\n');
    
    // Get all unique user IDs from user logs
    db.all(`
        SELECT DISTINCT user_id, COUNT(*) as log_count 
        FROM user_logs 
        WHERE timestamp > datetime('now', '-1 hour')
        ORDER BY log_count DESC
    `, (err, rows) => {
        if (err) {
            console.error('❌ Error querying user logs:', err.message);
            return;
        }
        
        console.log('📊 User IDs found in recent logs (last hour):');
        console.log('================================================');
        
        rows.forEach((row, index) => {
            console.log(`${index + 1}. ${row.user_id} (${row.log_count} logs)`);
        });
        
        if (rows.length > 1) {
            console.log('\n⚠️  ISSUE DETECTED: Multiple user IDs found!');
            console.log('   This explains why frontend logs don\'t show API activity.');
            console.log('   All logs should use the same user ID for consistency.\n');
            
            // Show recent logs for each user ID
            rows.forEach((row) => {
                console.log(`\n📝 Recent logs for ${row.user_id}:`);
                console.log('─'.repeat(60));
                
                db.all(`
                    SELECT message, category, timestamp 
                    FROM user_logs 
                    WHERE user_id = ? AND timestamp > datetime('now', '-30 minutes')
                    ORDER BY timestamp DESC 
                    LIMIT 5
                `, [row.user_id], (err, logs) => {
                    if (err) {
                        console.error('Error:', err.message);
                        return;
                    }
                    
                    logs.forEach(log => {
                        const time = new Date(log.timestamp).toLocaleTimeString();
                        console.log(`   ${time} [${log.category}] ${log.message}`);
                    });
                });
            });
            
        } else if (rows.length === 1) {
            console.log('\n✅ GOOD: Only one user ID found - logs are consistent!');
        } else {
            console.log('\n📭 No recent logs found.');
        }
        
        // Close database after a delay to let async queries complete
        setTimeout(() => {
            db.close((err) => {
                if (err) {
                    console.error('Error closing database:', err.message);
                } else {
                    console.log('\n🔒 Database connection closed.');
                }
            });
        }, 2000);
    });
});
