import { io } from 'socket.io-client';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
let authToken = '';
let socket = null;
let testServerId = '';
let testChannelId = '';
let testRoleId = '';
let receivedEvents = [];

console.log('🚀 Starting Real-Time Socket.IO Event Test Suite\n');

// Helper function to make authenticated API requests
async function apiRequest(endpoint, options = {}) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${authToken}`,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }
  
  return response.json();
}

// Setup user authentication
async function authenticate() {
  console.log('📝 Setting up test user...');
  
  // Register test user
  try {
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'realtimetest',
        email: 'realtime@test.com',
        password: 'TestPassword123!'
      })
    });
  } catch (error) {
    // User might already exist
  }
  
  // Login
  const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'realtime@test.com',
      password: 'TestPassword123!'
    })
  });
  
  const loginData = await loginResponse.json();
  authToken = loginData.token;
  console.log('✅ Authentication successful');
}

// Setup Socket.IO connection
function setupSocket() {
  console.log('🔌 Connecting to Socket.IO server...');
  
  socket = io(BASE_URL, {
    auth: {
      token: authToken
    },
    query: { token: authToken },
    extraHeaders: {
      'Authorization': `Bearer ${authToken}`
    }
  });
  
  // Track all received events
  const eventTypes = [
    'serverCreated', 'serverUpdated', 'serverDeleted',
    'memberJoined', 'memberLeft', 'memberKicked', 'memberBanned', 'memberUnbanned', 'memberUpdated',
    'roleCreated', 'roleUpdated', 'roleDeleted', 'rolesReordered',
    'channelCreated', 'channelUpdated', 'channelDeleted',
    'inviteCreated',
    'kickedFromServer', 'bannedFromServer', 'unbannedFromServer'
  ];
  
  eventTypes.forEach(eventType => {
    socket.on(eventType, (data) => {
      console.log(`📡 Received ${eventType}:`, JSON.stringify(data, null, 2));
      receivedEvents.push({ type: eventType, data, timestamp: new Date().toISOString() });
    });
  });
  
  socket.on('connect', () => {
    console.log('✅ Socket.IO connected successfully');
  });
  
  socket.on('disconnect', () => {
    console.log('🔌 Socket.IO disconnected');
  });
  
  socket.on('error', (error) => {
    console.error('❌ Socket.IO error:', error);
  });
  
  return new Promise((resolve) => {
    socket.on('connect', resolve);
  });
}

// Test server management real-time events
async function testServerEvents() {
  console.log('\\n🏢 Testing Server Management Events...');
  
  const initialEventCount = receivedEvents.length;
  
  // Create server
  console.log('Creating server...');
  const server = await apiRequest('/api/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Real-Time Test Server',
      description: 'Testing real-time events'
    })
  });
  testServerId = server._id;
  
  // Join server room
  socket.emit('joinServer', testServerId);
  
  // Wait for events
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update server
  console.log('Updating server...');
  await apiRequest(`/api/servers/${testServerId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'Updated Real-Time Test Server',
      description: 'Updated description'
    })
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const serverEventsReceived = receivedEvents.slice(initialEventCount);
  console.log(`✅ Server events test completed. Received ${serverEventsReceived.length} events.`);
  
  return serverEventsReceived;
}

// Test role management real-time events
async function testRoleEvents() {
  console.log('\\n👑 Testing Role Management Events...');
  
  const initialEventCount = receivedEvents.length;
  
  // Create role
  console.log('Creating role...');
  const role = await apiRequest(`/api/roles/${testServerId}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Test Role',
      color: '#FF5733',
      permissions: ['sendMessages', 'readMessageHistory']
    })
  });
  testRoleId = role._id;
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update role
  console.log('Updating role...');
  await apiRequest(`/api/roles/${testServerId}/roles/${testRoleId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Updated Test Role',
      color: '#33FF57'
    })
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Delete role
  console.log('Deleting role...');
  await apiRequest(`/api/roles/${testServerId}/roles/${testRoleId}`, {
    method: 'DELETE'
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const roleEventsReceived = receivedEvents.slice(initialEventCount);
  console.log(`✅ Role events test completed. Received ${roleEventsReceived.length} events.`);
  
  return roleEventsReceived;
}

// Test channel management real-time events
async function testChannelEvents() {
  console.log('\\n📺 Testing Channel Management Events...');
  
  const initialEventCount = receivedEvents.length;
  
  // Create channel
  console.log('Creating channel...');
  const channel = await apiRequest('/api/channels', {
    method: 'POST',
    body: JSON.stringify({
      name: 'test-channel',
      type: 'text',
      serverId: testServerId,
      topic: 'Testing real-time events'
    })
  });
  testChannelId = channel._id;
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update channel
  console.log('Updating channel...');
  await apiRequest(`/api/channels/${testChannelId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'updated-test-channel',
      topic: 'Updated topic'
    })
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Delete channel
  console.log('Deleting channel...');
  await apiRequest(`/api/channels/${testChannelId}`, {
    method: 'DELETE'
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const channelEventsReceived = receivedEvents.slice(initialEventCount);
  console.log(`✅ Channel events test completed. Received ${channelEventsReceived.length} events.`);
  
  return channelEventsReceived;
}

// Test invite management real-time events
async function testInviteEvents() {
  console.log('\\n📨 Testing Invite Management Events...');
  
  const initialEventCount = receivedEvents.length;
  
  // Create invite
  console.log('Creating invite...');
  await apiRequest(`/api/servers/${testServerId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      maxUses: 10,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    })
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const inviteEventsReceived = receivedEvents.slice(initialEventCount);
  console.log(`✅ Invite events test completed. Received ${inviteEventsReceived.length} events.`);
  
  return inviteEventsReceived;
}

// Test member management events (create second user)
async function testMemberEvents() {
  console.log('\\n👥 Testing Member Management Events...');
  
  const initialEventCount = receivedEvents.length;
  
  // Register second test user
  try {
    await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'testmember',
        email: 'member@test.com',
        password: 'TestPassword123!'
      })
    });
  } catch (error) {
    // User might already exist
  }
  
  // Login as second user
  const memberLoginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'member@test.com',
      password: 'TestPassword123!'
    })
  });
  
  const memberLoginData = await memberLoginResponse.json();
  const memberToken = memberLoginData.token;
  
  // Second user joins server
  console.log('Member joining server...');
  await fetch(`${BASE_URL}/api/servers/${testServerId}/join`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${memberToken}`
    }
  });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  const memberEventsReceived = receivedEvents.slice(initialEventCount);
  console.log(`✅ Member events test completed. Received ${memberEventsReceived.length} events.`);
  
  return memberEventsReceived;
}

// Cleanup test data
async function cleanup() {
  console.log('\\n🧹 Cleaning up test data...');
  
  try {
    // Delete test server
    if (testServerId) {
      await apiRequest(`/api/servers/${testServerId}`, { method: 'DELETE' });
    }
  } catch (error) {
    console.log('Cleanup error (expected):', error.message);
  }
  
  if (socket) {
    socket.disconnect();
  }
  
  console.log('✅ Cleanup completed');
}

// Generate test report
function generateReport(allEvents) {
  console.log('\\n📊 REAL-TIME EVENT TEST REPORT');
  console.log('='.repeat(50));
  
  const eventCounts = {};
  allEvents.forEach(event => {
    eventCounts[event.type] = (eventCounts[event.type] || 0) + 1;
  });
  
  console.log(`Total events received: ${allEvents.length}`);
  console.log('\\nEvent breakdown:');
  Object.entries(eventCounts).forEach(([event, count]) => {
    console.log(`  ${event}: ${count}`);
  });
  
  // Check for expected events
  const expectedEvents = [
    'serverCreated', 'serverUpdated', 'serverDeleted',
    'roleCreated', 'roleUpdated', 'roleDeleted',
    'channelCreated', 'channelUpdated', 'channelDeleted',
    'inviteCreated', 'memberJoined'
  ];
  
  console.log('\\nEvent Coverage:');
  expectedEvents.forEach(event => {
    const received = eventCounts[event] || 0;
    const status = received > 0 ? '✅' : '❌';
    console.log(`  ${status} ${event}: ${received}`);
  });
  
  const coveragePercent = (Object.keys(eventCounts).length / expectedEvents.length * 100).toFixed(1);
  console.log(`\\nOverall Coverage: ${coveragePercent}%`);
  
  if (coveragePercent >= 90) {
    console.log('🎉 EXCELLENT! Real-time events are working perfectly!');
  } else if (coveragePercent >= 70) {
    console.log('🟡 GOOD! Most real-time events are working.');
  } else {
    console.log('🔴 NEEDS IMPROVEMENT! Many real-time events are missing.');
  }
}

// Main test execution
async function runTests() {
  try {
    await authenticate();
    await setupSocket();
    
    const serverEvents = await testServerEvents();
    const roleEvents = await testRoleEvents();
    const channelEvents = await testChannelEvents();
    const inviteEvents = await testInviteEvents();
    const memberEvents = await testMemberEvents();
    
    // Wait for any final events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    await cleanup();
    
    generateReport(receivedEvents);
    
    console.log('\\n🏁 Real-time event testing completed!');
    console.log(`📝 Full event log: ${receivedEvents.length} events received`);
    
  } catch (error) {
    console.error('❌ Test failed:', error);
    await cleanup();
    process.exit(1);
  }
  
  process.exit(0);
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\\n⚠️ Test interrupted, cleaning up...');
  await cleanup();
  process.exit(0);
});

runTests();
