import io from 'socket.io-client';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
let authToken, secondUserToken, secondUserId;
let socket, secondSocket, testServerId;
const receivedEvents = [];
const testResults = [];

// Helper function for API requests
async function apiRequest(endpoint, options = {}, token = authToken) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`API Error ${response.status}: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// Helper function for tracking test results
function addTestResult(testName, passed, details) {
  testResults.push({ testName, passed, details, timestamp: new Date().toISOString() });
  console.log(`${passed ? '✅' : '❌'} ${testName} - ${details}`);
}

// Wait for events
async function waitForEvents(expectedCount, timeout = 3000) {
  const startTime = Date.now();
  const initialCount = receivedEvents.length;
  
  while (receivedEvents.length < initialCount + expectedCount && Date.now() - startTime < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return receivedEvents.length - initialCount;
}

async function setupAuth() {
  console.log('\\n🔐 Setting up authentication...');
  
  const timestamp = Date.now();
  const user1Email = `sockettest1_${timestamp}@example.com`;
  const user2Email = `sockettest2_${timestamp}@example.com`;
  const password = 'TestPassword123!';
  
  // Register and get token for user 1
  const register1Response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user1Email,
      password: password,
      name: 'Socket Test User 1'
    })
  });
  
  const register1Data = await register1Response.json();
  authToken = register1Data.data.token;
  
  // Register and get token for user 2
  const register2Response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user2Email,
      password: password,
      name: 'Socket Test User 2'
    })
  });
  
  const register2Data = await register2Response.json();
  secondUserToken = register2Data.data.token;
  secondUserId = register2Data.data.user.id;
  
  console.log('    ✅ Both users authenticated');
  addTestResult('User Authentication', true, 'Both users registered and authenticated');
}

async function setupSockets() {
  console.log('\\n🔌 Setting up Socket.IO connections...');
  
  return new Promise((resolve) => {
    let connectionsReady = 0;
    
    // User 1 socket
    socket = io(BASE_URL, {
      auth: { token: authToken },
      query: { token: authToken }
    });
    
    // User 2 socket
    secondSocket = io(BASE_URL, {
      auth: { token: secondUserToken },
      query: { token: secondUserToken }
    });
    
    // Listen for all server-related events on both sockets
    const events = [
      'serverCreated', 'serverUpdated', 'serverDeleted',
      'memberJoined', 'memberLeft', 'memberKicked', 'memberBanned', 'memberUnbanned',
      'inviteCreated', 'inviteDeleted', 'inviteUsed'
    ];
    
    events.forEach(eventType => {
      socket.on(eventType, (data) => {
        console.log(`📡 ✅ Event: ${eventType} (User1)`, data);
        receivedEvents.push({ type: eventType, data, timestamp: Date.now(), user: 'user1' });
      });
      
      secondSocket.on(eventType, (data) => {
        console.log(`📡 ✅ Event: ${eventType} (User2)`, data);
        receivedEvents.push({ type: `${eventType} (User2)`, data, timestamp: Date.now(), user: 'user2' });
      });
    });
    
    function checkConnections() {
      connectionsReady++;
      if (connectionsReady === 2) {
        console.log('    ✅ Both Socket.IO connections established');
        addTestResult('Socket Connection Setup', true, 'Both users connected via Socket.IO');
        resolve();
      }
    }
    
    socket.on('connect', () => {
      console.log('    ✅ User 1 socket connected');
      checkConnections();
    });
    
    secondSocket.on('connect', () => {
      console.log('    ✅ User 2 socket connected');
      checkConnections();
    });
  });
}

async function testServerEvents() {
  console.log('\\n🏢 Testing Server Management Socket.IO Events...');
  
  const initialEvents = receivedEvents.length;
  
  // 1. Create server
  console.log('  📝 Creating server...');
  const server = await apiRequest('/api/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Socket Test Server',
      description: 'Testing comprehensive Socket.IO events'
    })
  });
  testServerId = server._id;
  
  await waitForEvents(1, 2000);
  
  // Check serverCreated event
  const createEvent = receivedEvents.find(e => e.type === 'serverCreated');
  addTestResult('Server Created Event', !!createEvent, createEvent ? 'Event received' : 'Event not received');
  
  // 2. Join server rooms
  console.log('  🔗 Joining server rooms...');
  socket.emit('joinServer', { serverId: testServerId });
  secondSocket.emit('joinServer', { serverId: testServerId });
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // 3. Update server
  console.log('  ✏️  Updating server...');
  await apiRequest(`/api/servers/${testServerId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'Updated Socket Test Server',
      description: 'Updated description for Socket.IO testing'
    })
  });
  
  await waitForEvents(2, 2000);
  
  const updateEvents = receivedEvents.filter(e => e.type === 'serverUpdated' || e.type === 'serverUpdated (User2)');
  addTestResult('Server Updated Events', updateEvents.length >= 1, `Received ${updateEvents.length} update events`);
  
  // 4. Add second user to server
  console.log('  👥 Adding second user to server...');
  await apiRequest(`/api/servers/${testServerId}/join`, {
    method: 'POST'
  }, secondUserToken);
  
  await waitForEvents(2, 2000);
  
  const joinEvents = receivedEvents.filter(e => e.type === 'memberJoined' || e.type === 'memberJoined (User2)');
  addTestResult('Member Joined Events', joinEvents.length >= 1, `Received ${joinEvents.length} join events`);
  
  return receivedEvents.length - initialEvents;
}

async function testInviteEvents() {
  console.log('\\n🔗 Testing Invite Management Socket.IO Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create invite
  console.log('  📨 Creating server invite...');
  const invite = await apiRequest(`/api/servers/${testServerId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      maxUses: 10
    })
  });
  
  await waitForEvents(2, 2000);
  
  const inviteCreateEvents = receivedEvents.filter(e => e.type === 'inviteCreated' || e.type === 'inviteCreated (User2)');
  addTestResult('Invite Created Events', inviteCreateEvents.length >= 1, `Received ${inviteCreateEvents.length} invite creation events`);
  
  return receivedEvents.length - initialEvents;
}

async function cleanup() {
  console.log('\\n🧹 Cleaning up test data...');
  
  if (testServerId) {
    try {
      await apiRequest(`/api/servers/${testServerId}`, { method: 'DELETE' });
      await waitForEvents(2, 2000);
      
      const deleteEvents = receivedEvents.filter(e => e.type === 'serverDeleted' || e.type === 'serverDeleted (User2)');
      addTestResult('Server Deleted Events', deleteEvents.length >= 1, `Received ${deleteEvents.length} deletion events`);
    } catch (error) {
      console.log('    ❌ Cleanup error:', error.message);
    }
  }
  
  if (socket) {
    socket.disconnect();
    console.log('    ✅ User 1 socket disconnected');
  }
  
  if (secondSocket) {
    secondSocket.disconnect();
    console.log('    ✅ User 2 socket disconnected');
  }
}

function generateReport() {
  console.log('\\n📊 COMPREHENSIVE SOCKET.IO TEST RESULTS');
  console.log('='.repeat(60));
  
  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  const successRate = ((passed / total) * 100).toFixed(1);
  
  console.log(`\\n📈 Overall Success Rate: ${successRate}% (${passed}/${total} tests passed)`);
  
  console.log('\\n📋 Detailed Results:');
  testResults.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} | ${result.testName}: ${result.details}`);
  });
  
  console.log('\\n📡 Socket.IO Events Summary:');
  const eventTypes = [...new Set(receivedEvents.map(e => e.type.replace(' (User2)', '')))];
  eventTypes.forEach(eventType => {
    const count = receivedEvents.filter(e => e.type.includes(eventType)).length;
    console.log(`  📨 ${eventType}: ${count} events received`);
  });
  
  console.log(`\\n🎯 Total Events Received: ${receivedEvents.length}`);
  
  if (successRate >= 80) {
    console.log('\\n🎉 EXCELLENT! Socket.IO real-time events are working correctly!');
  } else if (successRate >= 60) {
    console.log('\\n👍 GOOD! Most Socket.IO events are working with some issues to address.');
  } else {
    console.log('\\n⚠️  WARNING! Multiple Socket.IO event issues detected.');
  }
}

async function runComprehensiveTest() {
  console.log('🚀 COMPREHENSIVE SOCKET.IO EVENT TESTING SUITE');
  console.log('='.repeat(60));
  console.log('📡 Testing ALL working server-related real-time events\\n');
  
  try {
    await setupAuth();
    await setupSockets();
    
    console.log('\\n🧪 STARTING SOCKET.IO EVENT TESTS...');
    console.log('-'.repeat(60));
    
    const serverEvents = await testServerEvents();
    const inviteEvents = await testInviteEvents();
    
    await cleanup();
    
    // Final wait for any delayed events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    generateReport();
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    await cleanup();
  }
}

runComprehensiveTest();
