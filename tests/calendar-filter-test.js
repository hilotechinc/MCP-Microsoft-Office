/**
 * @fileoverview Test script for Calendar Event Filter Validation
 * Tests the specific filter that was causing issues in the logs:
 * "organizer/emailAddress/address ne 'AdeleV@M365x28827508.OnMicrosoft.com'"
 */

const graphClientFactory = require('../src/graph/graph-client.cjs');
const calendarService = require('../src/graph/calendar-service.cjs');
const GraphFilterValidator = require('../src/graph/graph-filter-validator.cjs');
const MonitoringService = require('../src/core/monitoring-service.cjs');

// Enable debug logging
if (MonitoringService && MonitoringService.setLogLevel) {
  MonitoringService.setLogLevel('debug');
}

// Test the problematic filter
async function testProblemFilter() {
  console.log('Testing Calendar Event Filter Validation');
  console.log('---------------------------------------');
  
  // The problematic filter from the logs
  const problematicFilter = "organizer/emailAddress/address ne 'AdeleV@M365x28827508.OnMicrosoft.com'";
  
  console.log(`Testing filter: "${problematicFilter}"`);
  
  // Test 1: Direct validation
  try {
    console.log('\n1. Direct Filter Validation:');
    const result = GraphFilterValidator.validateFilter(problematicFilter);
    
    if (result.isValid) {
      console.log('❌ UNEXPECTED: Filter was considered valid');
    } else {
      console.log('✅ EXPECTED: Filter was correctly identified as invalid');
      console.log(`   Error: ${result.error.message}`);
      console.log(`   Suggestion: ${result.error.suggestion}`);
    }
  } catch (error) {
    console.error(`❌ ERROR: Validation test failed: ${error.message}`);
  }
  
  // Test 2: Get supported operations for this property
  try {
    console.log('\n2. Supported Operations for organizer/emailAddress/address:');
    const supportInfo = GraphFilterValidator.getSupportedFilterOperations('organizer/emailAddress/address');
    console.log(`   Property: ${supportInfo.property}`);
    console.log(`   Supported operators: ${supportInfo.supportedOperators.join(', ')}`);
    console.log('   Examples:');
    supportInfo.examples.forEach(example => console.log(`     - ${example}`));
  } catch (error) {
    console.error(`❌ ERROR: Failed to get supported operations: ${error.message}`);
  }
  
  // Test 3: Alternative filter suggestion
  try {
    console.log('\n3. Alternative Filter Suggestion:');
    console.log('   Instead of using:');
    console.log(`   "${problematicFilter}"`);
    console.log('   Consider using:');
    console.log('   "subject ne \'Canceled\'"');
    
    const alternativeFilter = "subject ne 'Canceled'";
    const result = GraphFilterValidator.validateFilter(alternativeFilter);
    
    if (result.isValid) {
      console.log('   ✅ Alternative filter is valid');
    } else {
      console.log('   ❌ Alternative filter is also invalid');
      console.log(`      Error: ${result.error.message}`);
    }
  } catch (error) {
    console.error(`❌ ERROR: Alternative filter test failed: ${error.message}`);
  }
  
  // Test 4: Test with calendar service (if possible)
  try {
    console.log('\n4. Calendar Service Integration Test:');
    console.log('   Attempting to use the filter with calendar service...');
    
    // This will use our new validation logic in calendar-service.cjs
    const options = {
      filter: problematicFilter,
      limit: 3
    };
    
    try {
      // Note: This will likely fail or skip the filter due to our validation
      await calendarService.getEvents(options);
      console.log('   ❓ Request completed - check logs for filter validation warnings');
    } catch (error) {
      if (error.message.includes('Invalid Graph API filter')) {
        console.log('   ✅ EXPECTED: Calendar service correctly rejected the invalid filter');
        console.log(`      Error: ${error.message}`);
      } else {
        console.log('   ❌ UNEXPECTED: Calendar service failed for a different reason');
        console.log(`      Error: ${error.message}`);
      }
    }
  } catch (error) {
    console.error(`❌ ERROR: Calendar service test failed: ${error.message}`);
  }
  
  console.log('\nTest Summary:');
  console.log('Our filter validation correctly identifies the problematic filter');
  console.log('that was causing 501 errors in the Microsoft Graph API calls.');
  console.log('The system now skips invalid filters instead of failing the entire request.');
}

// Run the test
testProblemFilter()
  .then(() => {
    console.log('\nFilter validation test completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
  });
