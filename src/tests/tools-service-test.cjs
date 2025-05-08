/**
 * @fileoverview Tests for the tools-service.cjs module
 * This file contains tests for the parameter transformation logic in the tools service,
 * focusing on the getAvailability function.
 */

const createToolsService = require('../core/tools-service.cjs');

// Mock logger to capture logs
const mockLogger = {
    logs: [],
    debug: function(...args) { this.logs.push({ level: 'debug', args }); },
    info: function(...args) { this.logs.push({ level: 'info', args }); },
    warn: function(...args) { this.logs.push({ level: 'warn', args }); },
    error: function(...args) { this.logs.push({ level: 'error', args }); },
    clearLogs: function() { this.logs = []; }
};

// Mock module registry
const mockModuleRegistry = {
    getAllModules: () => [
        {
            id: 'calendar',
            capabilities: ['getAvailability']
        }
    ],
    getModule: (name) => name === 'calendar' ? {
        id: 'calendar',
        capabilities: ['getAvailability']
    } : null
};

// Create tools service with mocks
const toolsService = createToolsService({
    moduleRegistry: mockModuleRegistry,
    logger: mockLogger
});

/**
 * Test the getAvailability parameter transformation with timeSlots format
 */
function testGetAvailabilityWithTimeSlots() {
    console.log('\n=== Testing getAvailability with timeSlots format ===');
    mockLogger.clearLogs();
    
    // Test input with timeSlots array format (from Claude)
    const input = {
        users: [
            'AdeleV@M365x28827508.OnMicrosoft.com',
            'ChristieC@M365x28827508.OnMicrosoft.com'
        ],
        timeSlots: [
            {
                end: '2025-05-08T21:00:00Z',
                start: '2025-05-08T18:00:00Z'
            },
            {
                end: '2025-05-09T21:00:00Z',
                start: '2025-05-09T18:00:00Z'
            },
            {
                end: '2025-05-10T21:00:00Z',
                start: '2025-05-10T18:00:00Z'
            },
            {
                end: '2025-05-11T21:00:00Z',
                start: '2025-05-11T18:00:00Z'
            }
        ]
    };
    
    // Transform parameters
    const { mapping, params } = toolsService.transformToolParameters('calendar.getAvailability', input);
    
    // Print results
    console.log('Input:', JSON.stringify(input, null, 2));
    console.log('\nTransformed output:', JSON.stringify(params, null, 2));
    console.log('\nMapping:', mapping);
    
    // Validate the transformation
    if (!params.timeSlots || !Array.isArray(params.timeSlots)) {
        console.error('FAILED: timeSlots should be an array');
        return false;
    }
    
    if (params.timeSlots.length !== input.timeSlots.length) {
        console.error(`FAILED: Expected ${input.timeSlots.length} timeSlots, got ${params.timeSlots.length}`);
        return false;
    }
    
    // Check that users array is properly transformed
    if (!params.users || !Array.isArray(params.users) || params.users.length !== input.users.length) {
        console.error(`FAILED: Users array not properly transformed`);
        return false;
    }
    
    // Validate each time slot
    for (let i = 0; i < params.timeSlots.length; i++) {
        const slot = params.timeSlots[i];
        const inputSlot = input.timeSlots[i];
        
        // Check start time
        if (!slot.start || !slot.start.dateTime) {
            console.error(`FAILED: Time slot ${i} is missing start.dateTime property`);
            return false;
        }
        
        // Check end time
        if (!slot.end || !slot.end.dateTime) {
            console.error(`FAILED: Time slot ${i} is missing end.dateTime property`);
            return false;
        }
        
        // Check that the values match the input (allowing for different formats)
        const startMatches = slot.start.dateTime === inputSlot.start || 
                          (typeof inputSlot.start === 'object' && slot.start.dateTime === inputSlot.start.dateTime);
        
        const endMatches = slot.end.dateTime === inputSlot.end || 
                        (typeof inputSlot.end === 'object' && slot.end.dateTime === inputSlot.end.dateTime);
        
        if (!startMatches) {
            console.error(`FAILED: Time slot ${i} start time doesn't match input`);
            console.error(`  Expected: ${inputSlot.start}, Got: ${slot.start.dateTime}`);
            return false;
        }
        
        if (!endMatches) {
            console.error(`FAILED: Time slot ${i} end time doesn't match input`);
            console.error(`  Expected: ${inputSlot.end}, Got: ${slot.end.dateTime}`);
            return false;
        }
    }
    
    console.log('PASSED: timeSlots format transformation');
    return true;
}

/**
 * Test the getAvailability parameter transformation with legacy format
 */
function testGetAvailabilityWithLegacyFormat() {
    console.log('\n=== Testing getAvailability with legacy format ===');
    mockLogger.clearLogs();
    
    // Test input with legacy format (start/end at top level)
    const input = {
        users: [
            'AdeleV@M365x28827508.OnMicrosoft.com',
            'ChristieC@M365x28827508.OnMicrosoft.com'
        ],
        start: '2025-05-08T18:00:00Z',
        end: '2025-05-08T21:00:00Z'
    };
    
    // Transform parameters
    const { mapping, params } = toolsService.transformToolParameters('calendar.getAvailability', input);
    
    // Print results
    console.log('Input:', JSON.stringify(input, null, 2));
    console.log('\nTransformed output:', JSON.stringify(params, null, 2));
    console.log('\nMapping:', mapping);
    
    // Validate the transformation
    if (!params.timeSlots || !Array.isArray(params.timeSlots) || params.timeSlots.length !== 1) {
        console.error('FAILED: Should have exactly one timeSlot');
        console.error('Got:', JSON.stringify(params, null, 2));
        return false;
    }
    
    // Check that users array is properly transformed
    if (!params.users || !Array.isArray(params.users) || params.users.length !== input.users.length) {
        console.error(`FAILED: Users array not properly transformed`);
        console.error('Expected:', input.users);
        console.error('Got:', params.users);
        return false;
    }
    
    const slot = params.timeSlots[0];
    
    // Check start time
    if (!slot.start || !slot.start.dateTime) {
        console.error('FAILED: Time slot is missing start.dateTime property');
        console.error('Got:', JSON.stringify(slot, null, 2));
        return false;
    }
    
    // Check end time
    if (!slot.end || !slot.end.dateTime) {
        console.error('FAILED: Time slot is missing end.dateTime property');
        console.error('Got:', JSON.stringify(slot, null, 2));
        return false;
    }
    
    // Check that the values match the input
    if (slot.start.dateTime !== input.start) {
        console.error('FAILED: Start time not properly transformed');
        console.error(`Expected: ${input.start}, Got: ${slot.start.dateTime}`);
        return false;
    }
    
    if (slot.end.dateTime !== input.end) {
        console.error('FAILED: End time not properly transformed');
        console.error(`Expected: ${input.end}, Got: ${slot.end.dateTime}`);
        return false;
    }
    
    console.log('PASSED: Legacy format transformation');
    return true;
}

/**
 * Test error handling for missing required parameters
 */
function testGetAvailabilityErrorHandling() {
    console.log('\n=== Testing getAvailability error handling ===');
    mockLogger.clearLogs();
    
    // Test input with missing start time
    const input = {
        users: ['AdeleV@M365x28827508.OnMicrosoft.com'],
        end: '2025-05-08T21:00:00Z'
        // start is missing
    };
    
    try {
        const { mapping, params } = toolsService.transformToolParameters('calendar.getAvailability', input);
        console.error('FAILED: Should have thrown an error for missing start time');
        return false;
    } catch (error) {
        if (error.message.includes('Start time is required')) {
            console.log('PASSED: Correctly threw error for missing start time');
            return true;
        } else {
            console.error('FAILED: Unexpected error message:', error.message);
            return false;
        }
    }
}

/**
 * Run all tests
 */
function runTests() {
    console.log('Starting tools-service tests for getAvailability...');
    
    const results = [
        testGetAvailabilityWithTimeSlots(),
        testGetAvailabilityWithLegacyFormat(),
        testGetAvailabilityErrorHandling()
    ];
    
    const passed = results.filter(Boolean).length;
    const total = results.length;
    
    console.log(`\nTest results: ${passed}/${total} tests passed`);
    
    if (passed === total) {
        console.log('\nALL TESTS PASSED! The getAvailability parameter transformation is working correctly.');
    } else {
        console.log('\nSome tests failed. Please check the logs above for details.');
    }
}

// Run the tests
runTests();
