/**
 * @fileoverview Fix for the metrics logging loop in MCP Microsoft Office
 * This script creates a patch for the monitoring-service.cjs file to prevent
 * recursive metric tracking when storing logs.
 */

const fs = require('fs');
const path = require('path');

// Path to the monitoring service file
const monitoringServicePath = path.join(__dirname, '../src/core/monitoring-service.cjs');

console.log('🔄 MCP Metrics Loop Fix Script');
console.log('==============================');

// Check if the file exists
if (!fs.existsSync(monitoringServicePath)) {
  console.error(`❌ File not found: ${monitoringServicePath}`);
  process.exit(1);
}

// Read the file content
let content = fs.readFileSync(monitoringServicePath, 'utf8');
console.log(`✅ Read monitoring service file: ${monitoringServicePath}`);

// Find the trackMetric function and modify it to prevent recursive calls
const trackMetricRegex = /async function trackMetric\(name, value, context = {}, userId = null, deviceId = null\) {[\s\S]*?}/;
const trackMetricMatch = content.match(trackMetricRegex);

if (!trackMetricMatch) {
  console.error('❌ Could not find trackMetric function in the file');
  process.exit(1);
}

// Original function
const originalFunction = trackMetricMatch[0];

// Create a modified version that prevents recursive metrics
const modifiedFunction = `async function trackMetric(name, value, context = {}, userId = null, deviceId = null) {
    // Skip metrics about storage operations to prevent recursive loops
    if (name.startsWith('storage_') || context.category === 'storage') {
        // Just log to console instead of persisting to prevent recursion
        if (logger) {
            logger.debug(\`[METRIC] \${name}: \${value}\`, { 
                metricName: name, 
                metricValue: value,
                ...context
            });
        }
        return;
    }

    // Emergency memory protection
    if (emergencyLoggingDisabled) return;
    
    // Check memory periodically during metric tracking
    if (Date.now() - lastMemoryCheck > MEMORY_CHECK_INTERVAL_MS) {
        checkMemoryForEmergency();
    }
    
    // Add to circular buffer
    const logData = {
        type: 'metric',
        name,
        value,
        context,
        timestamp: new Date().toISOString(),
        userId,
        deviceId
    };
    
    logBuffer.add(logData);
    
    // Log to Winston
    if (logger) {
        logger.debug(\`[METRIC] \${name}: \${value}\`, { 
            metricName: name, 
            metricValue: value,
            ...context
        });
    }
    
    // Emit metric event if event service is available
    if (eventService) {
        try {
            await eventService.publish(eventTypes.METRIC, logData);
        } catch (error) {
            // Don't log this error to avoid potential recursion
            console.error(\`[MCP MONITORING] Failed to publish metric event: \${error.message}\`);
        }
    }
    
    // Store user-specific metrics in database if storage service is available
    // and we have a user ID
    if (userId && name !== 'storage_add_user_log_success') {
        try {
            const storage = getStorageService();
            if (storage && typeof storage.addUserLog === 'function') {
                storage.addUserLog(userId, 'info', \`Metric: \${name}\`, 'metrics', {
                    metricName: name,
                    metricValue: value,
                    ...context
                }, null, deviceId)
                    .catch(err => {
                        console.error(\`[MCP METRIC] Failed to persist user log: \${err.message}\`);
                    });
            }
        } catch (storageError) {
            console.error(\`[MCP METRIC] Error accessing storage for user log: \${storageError.message}\`);
        }
    }
}`;

// Replace the function in the content
content = content.replace(originalFunction, modifiedFunction);

// Create a backup of the original file
const backupPath = `${monitoringServicePath}.bak`;
fs.writeFileSync(backupPath, fs.readFileSync(monitoringServicePath));
console.log(`✅ Created backup at: ${backupPath}`);

// Write the modified content back to the file
fs.writeFileSync(monitoringServicePath, content);
console.log(`✅ Updated monitoring service file with metrics loop fix`);

// Also fix the storage-service.cjs file to prevent metrics about metrics
const storageServicePath = path.join(__dirname, '../src/core/storage-service.cjs');

if (fs.existsSync(storageServicePath)) {
  let storageContent = fs.readFileSync(storageServicePath, 'utf8');
  console.log(`✅ Read storage service file: ${storageServicePath}`);
  
  // Find the addUserLog function
  const addUserLogRegex = /async function addUserLog\(userId, level, message, category = null, context = null, traceId = null, deviceId = null\) {[\s\S]*?return {[\s\S]*?};/;
  const addUserLogMatch = storageContent.match(addUserLogRegex);
  
  if (addUserLogMatch) {
    const originalAddUserLog = addUserLogMatch[0];
    
    // Modify the function to prevent tracking metrics about storage operations
    const modifiedAddUserLog = originalAddUserLog.replace(
      /MonitoringService\.trackMetric\('storage_add_user_log_success',.*?\);/s,
      `// Skip metrics for storage operations to prevent recursive loops
    if (category !== 'metrics' && level !== 'metric') {
      MonitoringService.trackMetric('storage_add_user_log_success', executionTime, {
        userId: userId,
        level: level,
        category: category || 'unknown',
        timestamp: new Date().toISOString()
      }, 'storage');
    }`
    );
    
    // Replace the function in the content
    storageContent = storageContent.replace(originalAddUserLog, modifiedAddUserLog);
    
    // Create a backup of the original file
    const storageBackupPath = `${storageServicePath}.bak`;
    fs.writeFileSync(storageBackupPath, fs.readFileSync(storageServicePath));
    console.log(`✅ Created backup at: ${storageBackupPath}`);
    
    // Write the modified content back to the file
    fs.writeFileSync(storageServicePath, storageContent);
    console.log(`✅ Updated storage service file with metrics loop fix`);
  } else {
    console.error('❌ Could not find addUserLog function in the storage service file');
  }
}

console.log('\n✅ Metrics loop fix completed successfully!');
console.log('\nNext steps:');
console.log('1. Restart the server with "npm run dev:web"');
console.log('2. The metrics logging loop should now be fixed');
