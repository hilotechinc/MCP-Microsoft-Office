#!/usr/bin/env node

/**
 * Test script to verify that logging is working correctly and not showing [object Object]
 */

const path = require('path');

// Add src to module path
require('module').globalPaths.push(path.join(__dirname, 'src'));

const MonitoringService = require('./src/core/monitoring-service.cjs');

console.log('Testing logging with objects...\n');

// Test 1: Simple object logging
console.log('=== Test 1: Simple object logging ===');
MonitoringService.info('Test message with object', { key: 'value', number: 42 }, 'test');

// Test 2: Complex object logging
console.log('\n=== Test 2: Complex object logging ===');
MonitoringService.info('Test with complex object', {
    user: 'test@example.com',
    data: {
        nested: true,
        array: [1, 2, 3],
        timestamp: new Date().toISOString()
    }
}, 'test');

// Test 3: Error logging
console.log('\n=== Test 3: Error logging ===');
MonitoringService.error('Test error message', { 
    error: 'Something went wrong',
    code: 500,
    details: { reason: 'test error' }
}, 'test');

// Test 4: Warning with metadata
console.log('\n=== Test 4: Warning with metadata ===');
MonitoringService.warn('Test warning', {
    warning: 'This is a test warning',
    metadata: { source: 'test-script' }
}, 'test');

console.log('\n=== Test completed ===');
console.log('If you see [object Object] in any of the above logs, the issue is not fixed.');
console.log('If you see properly formatted JSON objects, the issue is resolved.');

// Exit after a short delay to allow logs to flush
setTimeout(() => {
    process.exit(0);
}, 1000);
