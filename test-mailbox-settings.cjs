/**
 * Test script to verify mailbox settings API call
 * Run with: node test-mailbox-settings.cjs
 */

// Import required modules
const msalService = require('./src/auth/msal-service.cjs');
const fetch = require('node-fetch');

// Configuration
const GRAPH_API_BASE_URL = 'https://graph.microsoft.com/v1.0';

/**
 * Makes a direct fetch call to the Graph API
 */
async function fetchGraphAPI(endpoint, token) {
  console.log(`[TEST] Making direct fetch call to: ${endpoint}`);
  
  try {
    const response = await fetch(`${GRAPH_API_BASE_URL}${endpoint}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });
    
    console.log(`[TEST] Response status: ${response.status}`);
    
    if (response.ok) {
      const data = await response.json();
      console.log('[TEST] Response data:', JSON.stringify(data, null, 2));
      return data;
    } else {
      const errorText = await response.text();
      console.error(`[TEST] Error response: ${errorText}`);
      return null;
    }
  } catch (error) {
    console.error(`[TEST] Fetch error:`, error);
    return null;
  }
}

/**
 * Main test function
 */
async function runTest() {
  try {
    console.log('[TEST] Starting mailbox settings test');
    
    // Get token
    console.log('[TEST] Getting most recent token...');
    const token = await msalService.getMostRecentToken();
    
    if (!token) {
      console.error('[TEST] No token available. Please run the server and authenticate first.');
      return;
    }
    
    console.log('[TEST] Token acquired successfully');
    
    // Test 1: Get /me endpoint (basic test)
    console.log('\n[TEST] Test 1: Basic /me endpoint');
    await fetchGraphAPI('/me', token);
    
    // Test 2: Get mailbox settings
    console.log('\n[TEST] Test 2: Full mailbox settings');
    await fetchGraphAPI('/me/mailboxSettings', token);
    
    // Test 3: Get specific timezone setting
    console.log('\n[TEST] Test 3: Specific timezone setting');
    await fetchGraphAPI('/me/mailboxSettings/timeZone', token);
    
    console.log('\n[TEST] All tests completed');
  } catch (error) {
    console.error('[TEST] Test failed with error:', error);
  }
}

// Run the test
runTest();
