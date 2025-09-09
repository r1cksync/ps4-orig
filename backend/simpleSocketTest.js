import io from 'socket.io-client';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
let authToken, socket, secondSocket, testServerId;
const receivedEvents = [];

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

async function setupAuth() {
  console.log('🔐 Setting up authentication...');
  
  const timestamp = Date.now();
  const user1Email = `sockettest1_${timestamp}@example.com`;
  const password = 'TestPassword123!';
  
  const registerResponse = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user1Email,
      password: password,
      name: 'Socket Test User'
    })
  });
  
  const registerData = await registerResponse.json();
  authToken = registerData.data.token;
  console.log('✅ User authenticated');
}

async function setupSocket() {
  console.log('🔌 Setting up Socket.IO connection...');
  
  return new Promise((resolve) => {
    socket = io(BASE_URL, {
      auth: { token: authToken },
      query: { token: authToken }
    });
    
    socket.on('connect', () => {
      console.log('✅ Socket connected');
      
      // Listen for all server-related events
      const events = ['serverCreated', 'serverUpdated', 'serverDeleted', 'memberJoined', 'memberLeft'];
      
      events.forEach(eventType => {
        socket.on(eventType, (data) => {
          console.log(`📡 Received: ${eventType}`, data);
          receivedEvents.push({ type: eventType, data, timestamp: Date.now() });
        });
      });
      
      resolve();
    });
  });
}

async function testBasicEvents() {
  console.log('\\n🧪 Testing basic server Socket.IO events...');
  
  // Create server
  console.log('  📝 Creating server...');
  const server = await apiRequest('/api/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Socket Test Server',
      description: 'Testing Socket.IO events'
    })
  });
  testServerId = server._id;
  
  // Join server room
  socket.emit('joinServer', { serverId: testServerId });
  
  // Wait for serverCreated event
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Update server
  console.log('  ✏️  Updating server...');
  await apiRequest(`/api/servers/${testServerId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'Updated Socket Test Server',
      description: 'Updated description'
    })
  });
  
  // Wait for events
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Check results
  const serverCreated = receivedEvents.find(e => e.type === 'serverCreated');
  const serverUpdated = receivedEvents.find(e => e.type === 'serverUpdated');
  
  console.log(`\\n📊 RESULTS:`);
  console.log(`  Server Created Event: ${serverCreated ? '✅' : '❌'}`);
  console.log(`  Server Updated Event: ${serverUpdated ? '✅' : '❌'}`);
  console.log(`  Total Events Received: ${receivedEvents.length}`);
  
  if (receivedEvents.length > 0) {
    console.log(`\\n📡 All Events Received:`);
    receivedEvents.forEach(event => {
      console.log(`    - ${event.type} at ${new Date(event.timestamp).toISOString()}`);
    });
  }
}

async function cleanup() {
  if (testServerId) {
    try {
      await apiRequest(`/api/servers/${testServerId}`, { method: 'DELETE' });
      console.log('🧹 Test server cleaned up');
    } catch (error) {
      console.log('❌ Cleanup error:', error.message);
    }
  }
  
  if (socket) {
    socket.disconnect();
    console.log('🔌 Socket disconnected');
  }
}

async function runSimpleTest() {
  try {
    await setupAuth();
    await setupSocket();
    await testBasicEvents();
  } catch (error) {
    console.error('❌ Test failed:', error.message);
  } finally {
    await cleanup();
  }
}

runSimpleTest();
