import io from 'socket.io-client';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
let authToken, testServerId, testRoleId;

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

  const responseText = await response.text();
  console.log(`API Response (${response.status}):`, responseText);

  if (!response.ok) {
    throw new Error(`API Error ${response.status}: ${responseText}`);
  }

  return JSON.parse(responseText);
}

async function setupAuth() {
  console.log('🔐 Setting up authentication...');
  
  const timestamp = Date.now();
  
  // Register and login first user (owner)
  const user1 = await apiRequest('/api/auth/register', {
    method: 'POST',
    body: JSON.stringify({
      email: `debugowner${timestamp}@test.com`,
      password: 'password123',
      displayName: `Debug Owner`,
      username: `debugowner${timestamp}`
    })
  });
  
  const login1 = await apiRequest('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({
      email: `debugowner${timestamp}@test.com`,
      password: 'password123'
    })
  });
  
  authToken = login1.token;
  console.log('✅ User authenticated');
}

async function setupServer() {
  console.log('🏢 Setting up test server...');
  
  const server = await apiRequest('/api/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Debug Server',
      description: 'Server for debugging role reordering'
    })
  });
  
  testServerId = server._id;
  console.log('✅ Test server created:', testServerId);
}

async function testRoleReordering() {
  console.log('\\n🔄 Testing Role Reordering...');
  
  // Create first role
  console.log('👑 Creating first role...');
  const role1 = await apiRequest(`/api/servers/${testServerId}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'First Test Role',
      color: '#FF6633',
      permissions: ['SEND_MESSAGES', 'READ_MESSAGE_HISTORY']
    })
  });
  testRoleId = role1._id;
  console.log('✅ First role created:', role1._id);
  
  // Create second role
  console.log('👑 Creating second role...');
  const role2 = await apiRequest(`/api/servers/${testServerId}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Second Test Role',
      color: '#3366FF',
      permissions: ['VIEW_CHANNEL']
    })
  });
  console.log('✅ Second role created:', role2._id);
  
  // Try to reorder roles
  console.log('🔄 Attempting to reorder roles...');
  console.log('Request payload:', JSON.stringify({
    roles: [
      { id: role2._id, position: 10 },
      { id: role1._id, position: 5 }
    ]
  }, null, 2));
  
  try {
    const result = await apiRequest(`/api/servers/${testServerId}/roles/reorder`, {
      method: 'PATCH',
      body: JSON.stringify({
        roles: [
          { id: role2._id, position: 10 },
          { id: role1._id, position: 5 }
        ]
      })
    });
    console.log('✅ Reordering successful:', result);
  } catch (error) {
    console.error('❌ Reordering failed:', error.message);
  }
}

async function cleanup() {
  console.log('\\n🧹 Cleaning up...');
  try {
    await apiRequest(`/api/servers/${testServerId}`, { method: 'DELETE' });
    console.log('✅ Test server cleaned up');
  } catch (error) {
    console.log('⚠️ Cleanup error:', error.message);
  }
}

async function main() {
  try {
    await setupAuth();
    await setupServer();
    await testRoleReordering();
    await cleanup();
  } catch (error) {
    console.error('❌ Debug test failed:', error.message);
  }
}

main();
