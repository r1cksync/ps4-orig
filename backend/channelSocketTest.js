import io from 'socket.io-client';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
let authToken, secondUserToken, secondUserId;
let socket, secondSocket, testServerId, testChannelId;
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
  const user1Email = `channeltest1_${timestamp}@example.com`;
  const user2Email = `channeltest2_${timestamp}@example.com`;
  const password = 'TestPassword123!';
  
  // Register and get token for user 1 (server owner)
  const register1Response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user1Email,
      password: password,
      name: 'Channel Test User 1 (Owner)'
    })
  });
  
  const register1Data = await register1Response.json();
  authToken = register1Data.data.token;
  
  // Register and get token for user 2 (member)
  const register2Response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user2Email,
      password: password,
      name: 'Channel Test User 2 (Member)'
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
    
    // User 1 socket (server owner)
    socket = io(BASE_URL, {
      auth: { token: authToken },
      query: { token: authToken }
    });
    
    // User 2 socket (server member)
    secondSocket = io(BASE_URL, {
      auth: { token: secondUserToken },
      query: { token: secondUserToken }
    });
    
    // Listen for all channel-related events on both sockets
    const events = [
      'channelCreated', 'channelUpdated', 'channelDeleted',
      'message', 'typing', 'voiceStateUpdate'
    ];
    
    events.forEach(eventType => {
      socket.on(eventType, (data) => {
        console.log(`📡 ✅ Event: ${eventType} (Owner)`, data);
        receivedEvents.push({ type: eventType, data, timestamp: Date.now(), user: 'owner' });
      });
      
      secondSocket.on(eventType, (data) => {
        console.log(`📡 ✅ Event: ${eventType} (Member)`, data);
        receivedEvents.push({ type: `${eventType} (Member)`, data, timestamp: Date.now(), user: 'member' });
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
      console.log('    ✅ Owner socket connected');
      checkConnections();
    });
    
    secondSocket.on('connect', () => {
      console.log('    ✅ Member socket connected');
      checkConnections();
    });
  });
}

async function setupServer() {
  console.log('\\n🏢 Setting up test server...');
  
  // Create server
  const server = await apiRequest('/api/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Channel Test Server',
      description: 'Testing channel Socket.IO events'
    })
  });
  testServerId = server._id;
  
  // Join server rooms for both users
  socket.emit('joinServer', { serverId: testServerId });
  secondSocket.emit('joinServer', { serverId: testServerId });
  
  // Add second user to server
  await apiRequest(`/api/servers/${testServerId}/join`, {
    method: 'POST'
  }, secondUserToken);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('    ✅ Test server created and users added');
  addTestResult('Test Server Setup', true, 'Server created and both users added');
}

async function testChannelCreation() {
  console.log('\\n📝 Testing Channel Creation Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create text channel
  console.log('  📝 Creating text channel...');
  const channel = await apiRequest('/api/channels', {
    method: 'POST',
    body: JSON.stringify({
      name: 'socket-test-channel',
      type: 'TEXT',
      serverId: testServerId,
      topic: 'Testing Socket.IO channel events'
    })
  });
  testChannelId = channel._id;
  
  await waitForEvents(2, 3000); // Should get events for both users
  
  const createEvents = receivedEvents.filter(e => 
    e.type === 'channelCreated' || e.type === 'channelCreated (Member)'
  );
  
  addTestResult('Channel Created Events', createEvents.length >= 1, 
    `Received ${createEvents.length} channel creation events`);
  
  // Verify event data structure
  if (createEvents.length > 0) {
    const eventData = createEvents[0].data;
    const hasRequiredFields = eventData.serverId && eventData.channel && eventData.createdBy;
    addTestResult('Channel Created Event Data', hasRequiredFields, 
      hasRequiredFields ? 'Event contains required fields' : 'Missing required fields');
  }
  
  return receivedEvents.length - initialEvents;
}

async function testChannelUpdate() {
  console.log('\\n✏️  Testing Channel Update Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Update channel properties
  console.log('  ✏️  Updating channel properties...');
  await apiRequest(`/api/channels/${testChannelId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'updated-socket-channel',
      topic: 'Updated topic for Socket.IO testing',
      slowMode: 5
    })
  });
  
  await waitForEvents(2, 3000); // Should get events for both users
  
  const updateEvents = receivedEvents.filter(e => 
    e.type === 'channelUpdated' || e.type === 'channelUpdated (Member)'
  );
  
  addTestResult('Channel Updated Events', updateEvents.length >= 1, 
    `Received ${updateEvents.length} channel update events`);
  
  // Verify event data structure
  if (updateEvents.length > 0) {
    const eventData = updateEvents[0].data;
    const hasRequiredFields = eventData.serverId && eventData.channel && eventData.updatedBy && eventData.changes;
    addTestResult('Channel Updated Event Data', hasRequiredFields, 
      hasRequiredFields ? 'Event contains required fields and changes' : 'Missing required fields');
  }
  
  return receivedEvents.length - initialEvents;
}

async function testChannelMessaging() {
  console.log('\\n💬 Testing Channel Message Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Join channel for both users
  socket.emit('joinChannel', { channelId: testChannelId });
  secondSocket.emit('joinChannel', { channelId: testChannelId });
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Send message
  console.log('  💬 Sending channel message...');
  await apiRequest(`/api/channels/${testChannelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: 'Test message for Socket.IO events'
    })
  });
  
  await waitForEvents(2, 3000);
  
  const messageEvents = receivedEvents.filter(e => 
    e.type === 'message' || e.type === 'message (Member)'
  );
  
  addTestResult('Channel Message Events', messageEvents.length >= 1, 
    `Received ${messageEvents.length} message events`);
  
  // Test typing indicator
  console.log('  ⌨️  Testing typing indicator...');
  await apiRequest(`/api/channels/${testChannelId}/typing`, {
    method: 'POST'
  });
  
  await waitForEvents(1, 2000);
  
  const typingEvents = receivedEvents.filter(e => 
    e.type === 'typing' || e.type === 'typing (Member)'
  );
  
  addTestResult('Channel Typing Events', typingEvents.length >= 1, 
    `Received ${typingEvents.length} typing events`);
  
  return receivedEvents.length - initialEvents;
}

async function testChannelDeletion() {
  console.log('\\n🗑️  Testing Channel Deletion Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Delete channel
  console.log('  🗑️  Deleting channel...');
  await apiRequest(`/api/channels/${testChannelId}`, {
    method: 'DELETE'
  });
  
  await waitForEvents(2, 3000); // Should get events for both users
  
  const deleteEvents = receivedEvents.filter(e => 
    e.type === 'channelDeleted' || e.type === 'channelDeleted (Member)'
  );
  
  addTestResult('Channel Deleted Events', deleteEvents.length >= 1, 
    `Received ${deleteEvents.length} channel deletion events`);
  
  // Verify event data structure
  if (deleteEvents.length > 0) {
    const eventData = deleteEvents[0].data;
    const hasRequiredFields = eventData.serverId && eventData.channelId && eventData.deletedBy;
    addTestResult('Channel Deleted Event Data', hasRequiredFields, 
      hasRequiredFields ? 'Event contains required fields' : 'Missing required fields');
  }
  
  return receivedEvents.length - initialEvents;
}

async function cleanup() {
  console.log('\\n🧹 Cleaning up test data...');
  
  if (testServerId) {
    try {
      await apiRequest(`/api/servers/${testServerId}`, { method: 'DELETE' });
      await waitForEvents(2, 2000);
      console.log('    ✅ Test server cleaned up');
    } catch (error) {
      console.log('    ❌ Cleanup error:', error.message);
    }
  }
  
  if (socket) {
    socket.disconnect();
    console.log('    ✅ Owner socket disconnected');
  }
  
  if (secondSocket) {
    secondSocket.disconnect();
    console.log('    ✅ Member socket disconnected');
  }
}

function generateReport() {
  console.log('\\n📊 CHANNEL SOCKET.IO TEST RESULTS');
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
  
  console.log('\\n📡 Channel Socket.IO Events Summary:');
  const eventTypes = [...new Set(receivedEvents.map(e => e.type.replace(' (Member)', '')))];
  eventTypes.forEach(eventType => {
    const count = receivedEvents.filter(e => e.type.includes(eventType)).length;
    console.log(`  📨 ${eventType}: ${count} events received`);
  });
  
  console.log(`\\n🎯 Total Events Received: ${receivedEvents.length}`);
  
  // Channel-specific validation
  const channelEvents = ['channelCreated', 'channelUpdated', 'channelDeleted', 'message', 'typing'];
  const workingChannelEvents = channelEvents.filter(event => 
    receivedEvents.some(e => e.type.includes(event))
  );
  
  console.log(`\\n📊 Channel Events Working: ${workingChannelEvents.length}/${channelEvents.length}`);
  console.log(`  ✅ Working: ${workingChannelEvents.join(', ')}`);
  
  if (successRate >= 90) {
    console.log('\\n🎉 EXCELLENT! All channel Socket.IO events are working perfectly!');
  } else if (successRate >= 75) {
    console.log('\\n👍 GOOD! Most channel Socket.IO events are working.');
  } else {
    console.log('\\n⚠️  WARNING! Channel Socket.IO events need attention.');
  }
}

async function runChannelTest() {
  console.log('🚀 COMPREHENSIVE CHANNEL SOCKET.IO TESTING SUITE');
  console.log('='.repeat(60));
  console.log('📡 Testing ALL channel creation, modification & deletion events\\n');
  
  try {
    await setupAuth();
    await setupSockets();
    await setupServer();
    
    console.log('\\n🧪 STARTING CHANNEL SOCKET.IO TESTS...');
    console.log('-'.repeat(60));
    
    const createEvents = await testChannelCreation();
    const updateEvents = await testChannelUpdate();
    const messageEvents = await testChannelMessaging();
    const deleteEvents = await testChannelDeletion();
    
    await cleanup();
    
    // Final wait for any delayed events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    generateReport();
    
  } catch (error) {
    console.error('❌ Channel test suite failed:', error.message);
    await cleanup();
  }
}

runChannelTest();
