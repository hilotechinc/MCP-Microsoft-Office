/**
 * Test script to verify the updateEvent user context fix
 */

const axios = require('axios');

// Bearer token provided by user
const BEARER_TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJkZXZpY2VJZCI6Im1jcC10b2tlbi0xNzUwNzY3Nzk0NDQxLWxueTg2Nm44eSIsInVzZXJJZCI6InVzZXI6S1lRN0RNRV9fNWlIbFplYTROemNYVWtoYk1KSU1LeHMiLCJ0eXBlIjoiYWNjZXNzIiwiaWF0IjoxNzUwNzY3Nzk0LCJzZXNzaW9uSWQiOiJLWVE3RE1FX181aUhsWmVhNE56Y1hVa2hiTUpJTUt4cyIsImV4cCI6MTc1MDg1NDE5NCwiYXVkIjoibWNwLWNsaWVudCIsImlzcyI6Im1jcC1yZW1vdGUtc2VydmljZSIsInN1YiI6Im1jcC10b2tlbi0xNzUwNzY3Nzk0NDQxLWxueTg2Nm44eSJ9.GlntQM_MdRNtevQfss0mX50VkHDC9egitX9tzfY2WyY';

async function testUpdateEventFix() {
    console.log('🧪 Testing updateEvent user context fix with authentication...\n');
    
    const headers = {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${BEARER_TOKEN}`
    };
    
    try {
        // Step 1: Get calendar events to find one to update
        console.log('📅 Step 1: Getting calendar events...');
        const eventsResponse = await axios.get('http://localhost:3000/api/v1/calendar/', {
            headers
        });
        
        console.log('✅ Calendar API Response Status:', eventsResponse.status);
        
        if (!eventsResponse.data || !eventsResponse.data.events || eventsResponse.data.events.length === 0) {
            console.log('❌ No calendar events found to test with');
            console.log('Response data:', JSON.stringify(eventsResponse.data, null, 2));
            return;
        }
        
        // Find a test event (look for one with "test" or "important" in the subject)
        const testEvent = eventsResponse.data.events.find(event => 
            event.subject && (
                event.subject.toLowerCase().includes('test') || 
                event.subject.toLowerCase().includes('important') ||
                event.subject.toLowerCase().includes('meeting')
            )
        );
        
        if (!testEvent) {
            console.log('❌ No suitable test event found');
            console.log('Available events:', eventsResponse.data.events.map(e => e.subject));
            return;
        }
        
        console.log(`✅ Found test event: "${testEvent.subject}" (ID: ${testEvent.id})`);
        
        // Step 2: Test updateEvent with the fix
        console.log('\n🔧 Step 2: Testing updateEvent with user context fix...');
        
        const updateData = {
            subject: `Updated Test Event - ${new Date().toISOString()}`,
            body: {
                content: 'This event has been updated to test the user context fix.',
                contentType: 'text'
            },
            location: {
                displayName: 'Test Location - Updated'
            }
        };
        
        console.log('📤 Sending update request...');
        const updateResponse = await axios.put(
            `http://localhost:3000/api/v1/calendar/events/${testEvent.id}`,
            updateData,
            { headers }
        );
        
        console.log('✅ Update Response Status:', updateResponse.status);
        console.log('✅ Update Response Data:', JSON.stringify(updateResponse.data, null, 2));
        
        // Check if the response indicates success (no mock data)
        if (updateResponse.data.isMock) {
            console.log('⚠️  Response contains mock data - may indicate authentication/permission issues');
        } else {
            console.log('🎉 SUCCESS: Real data returned - user context fix appears to be working!');
        }
        
        // Step 3: Verify the update worked by checking if subject changed
        if (updateResponse.data.subject && updateResponse.data.subject.includes('Updated Test Event')) {
            console.log('🎯 VERIFICATION: Event subject was successfully updated!');
        }
        
    } catch (error) {
        console.error('❌ Error during test:', error.message);
        
        if (error.response) {
            console.error('Response Status:', error.response.status);
            console.error('Response Data:', JSON.stringify(error.response.data, null, 2));
            
            // Check if this is the specific user context error we were trying to fix
            if (error.response?.data?.message?.includes('User context not available')) {
                console.log('❌ STILL FAILING: User context error persists - fix may need adjustment');
            } else if (error.response?.data?.message?.includes('permission check')) {
                console.log('❌ STILL FAILING: Permission check error persists');
            } else if (error.response?.status === 401) {
                console.log('❌ AUTHENTICATION ERROR: Bearer token may be invalid or expired');
            } else {
                console.log('ℹ️  Different error - may be unrelated to user context fix');
            }
        }
    }
}

// Run the test
testUpdateEventFix().then(() => {
    console.log('\n🏁 Test completed');
    process.exit(0);
}).catch(error => {
    console.error('💥 Test failed with error:', error);
    process.exit(1);
});
