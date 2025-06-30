/**
 * @fileoverview Test script for Graph API filter validation
 * Tests the filter validation functionality to ensure it properly identifies
 * unsupported filter expressions before sending them to Microsoft Graph API.
 */

const GraphFilterValidator = require('../src/graph/graph-filter-validator.cjs');
const assert = require('assert');

// Test suite for filter validation
async function runTests() {
  console.log('Running Graph API Filter Validation Tests');
  console.log('----------------------------------------');
  
  let passCount = 0;
  let failCount = 0;
  
  // Test 1: Valid filter expressions should pass validation
  try {
    const validFilters = [
      "subject eq 'Meeting'",
      "start/dateTime ge '2025-06-01T00:00:00Z'",
      "contains(subject, 'important')",
      "isAllDay eq true",
      "organizer/emailAddress/address eq 'user@example.com'",
      "attendees/any(a: a/emailAddress/address eq 'user@example.com')"
    ];
    
    for (const filter of validFilters) {
      const result = GraphFilterValidator.validateFilter(filter);
      assert.strictEqual(result.isValid, true, `Filter should be valid: ${filter}`);
      console.log(`✅ PASS: Valid filter accepted: ${filter}`);
      passCount++;
    }
  } catch (error) {
    console.error(`❌ FAIL: Valid filter test failed: ${error.message}`);
    failCount++;
  }
  
  // Test 2: Known unsupported filter expressions should fail validation
  try {
    const invalidFilters = [
      "organizer/emailAddress/address ne 'user@example.com'",
      "attendees/emailAddress/address ne 'user@example.com'",
      "attendees/any(a: a/emailAddress/address ne 'user@example.com')"
    ];
    
    for (const filter of invalidFilters) {
      const result = GraphFilterValidator.validateFilter(filter);
      assert.strictEqual(result.isValid, false, `Filter should be invalid: ${filter}`);
      assert.ok(result.error instanceof Error, 'Should return an error object');
      console.log(`✅ PASS: Invalid filter rejected: ${filter}`);
      console.log(`   Error: ${result.error.message}`);
      console.log(`   Suggestion: ${result.error.suggestion}`);
      passCount++;
    }
  } catch (error) {
    console.error(`❌ FAIL: Invalid filter test failed: ${error.message}`);
    failCount++;
  }
  
  // Test 3: validateFilterOrThrow should throw for invalid filters
  try {
    try {
      GraphFilterValidator.validateFilterOrThrow("organizer/emailAddress/address ne 'user@example.com'");
      assert.fail('Should have thrown an error');
    } catch (error) {
      assert.strictEqual(error.name, 'GraphFilterError', 'Should throw GraphFilterError');
      console.log(`✅ PASS: validateFilterOrThrow correctly threw error`);
      console.log(`   Error: ${error.message}`);
      passCount++;
    }
  } catch (error) {
    console.error(`❌ FAIL: validateFilterOrThrow test failed: ${error.message}`);
    failCount++;
  }
  
  // Test 4: getSupportedFilterOperations should return documentation
  try {
    const generalDocs = GraphFilterValidator.getSupportedFilterOperations();
    assert.ok(generalDocs.supportedProperties.length > 0, 'Should return supported properties');
    assert.ok(generalDocs.generalGuidelines.length > 0, 'Should return guidelines');
    
    const specificDocs = GraphFilterValidator.getSupportedFilterOperations('subject');
    assert.strictEqual(specificDocs.property, 'subject', 'Should return info for specific property');
    assert.ok(specificDocs.supportedOperators.length > 0, 'Should return supported operators');
    assert.ok(specificDocs.examples.length > 0, 'Should return examples');
    
    console.log(`✅ PASS: getSupportedFilterOperations returns documentation`);
    passCount++;
  } catch (error) {
    console.error(`❌ FAIL: getSupportedFilterOperations test failed: ${error.message}`);
    failCount++;
  }
  
  // Summary
  console.log('\nTest Summary:');
  console.log(`✅ Passed: ${passCount}`);
  console.log(`❌ Failed: ${failCount}`);
  console.log('----------------------------------------');
  
  return failCount === 0;
}

// Run the tests
runTests()
  .then(success => {
    if (success) {
      console.log('All tests passed! 🎉');
      process.exit(0);
    } else {
      console.error('Some tests failed! 😢');
      process.exit(1);
    }
  })
  .catch(error => {
    console.error('Test execution error:', error);
    process.exit(1);
  });
