import io from 'socket.io-client';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
let authToken, secondUserToken, secondUserId;
let socket, secondSocket, testServerId, testRoleId;
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
  const user1Email = `roletest1_${timestamp}@example.com`;
  const user2Email = `roletest2_${timestamp}@example.com`;
  const password = 'TestPassword123!';
  
  // Register and get token for user 1 (server owner)
  const register1Response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user1Email,
      password: password,
      name: 'Role Test User 1 (Owner)'
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
      name: 'Role Test User 2 (Member)'
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
    
    // Listen for all role-related events on both sockets
    const events = [
      'roleCreated', 'roleUpdated', 'roleDeleted', 'rolesReordered',
      'roleAssigned', 'roleRemoved', 'memberUpdated'
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
      name: 'Role Test Server',
      description: 'Testing role and permission Socket.IO events'
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

async function testPermissionsAPI() {
  console.log('\\n📋 Testing Permissions API...');
  
  // Get available permissions
  console.log('  📋 Fetching available permissions...');
  const permissions = await apiRequest('/api/roles/permissions');
  
  const hasPermissions = permissions.permissions && Array.isArray(permissions.permissions) && permissions.permissions.length > 0;
  addTestResult('Permissions API', hasPermissions, 
    hasPermissions ? `Retrieved ${permissions.permissions.length} permissions` : 'No permissions returned');
  
  return permissions.permissions || [];
}

async function testRoleCreation() {
  console.log('\\n👑 Testing Role Creation Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create role with permissions
  console.log('  👑 Creating role with permissions...');
  const role = await apiRequest(`/api/servers/${testServerId}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Socket Test Role',
      color: '#FF5733',
      permissions: ['SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'USE_EXTERNAL_EMOJIS'],
      mentionable: true,
      hoist: true
    })
  });
  testRoleId = role._id;
  
  await waitForEvents(2, 3000); // Should get events for both users
  
  const createEvents = receivedEvents.filter(e => 
    e.type === 'roleCreated' || e.type === 'roleCreated (Member)'
  );
  
  addTestResult('Role Created Events', createEvents.length >= 1, 
    `Received ${createEvents.length} role creation events`);
  
  // Verify event data structure
  if (createEvents.length > 0) {
    const eventData = createEvents[0].data;
    const hasRequiredFields = eventData.serverId && eventData.role && eventData.createdBy;
    addTestResult('Role Created Event Data', hasRequiredFields, 
      hasRequiredFields ? 'Event contains required fields' : 'Missing required fields');
  }
  
  return receivedEvents.length - initialEvents;
}

async function testRoleUpdate() {
  console.log('\\n✏️  Testing Role Update Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Update role properties
  console.log('  ✏️  Updating role properties...');
  await apiRequest(`/api/servers/${testServerId}/roles/${testRoleId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Updated Socket Test Role',
      color: '#33FF57',
      permissions: ['SEND_MESSAGES', 'READ_MESSAGE_HISTORY', 'MANAGE_MESSAGES'],
      mentionable: false,
      hoist: false
    })
  });
  
  await waitForEvents(2, 3000); // Should get events for both users
  
  const updateEvents = receivedEvents.filter(e => 
    e.type === 'roleUpdated' || e.type === 'roleUpdated (Member)'
  );
  
  addTestResult('Role Updated Events', updateEvents.length >= 1, 
    `Received ${updateEvents.length} role update events`);
  
  // Verify event data structure
  if (updateEvents.length > 0) {
    const eventData = updateEvents[0].data;
    const hasRequiredFields = eventData.serverId && eventData.role && eventData.updatedBy && eventData.changes;
    addTestResult('Role Updated Event Data', hasRequiredFields, 
      hasRequiredFields ? 'Event contains required fields and changes' : 'Missing required fields');
  }
  
  return receivedEvents.length - initialEvents;
}

async function testRoleAssignment() {
  console.log('\\n🎯 Testing Role Assignment Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Assign role to second user
  console.log('  🎯 Assigning role to member...');
  await apiRequest(`/api/servers/${testServerId}/roles/${testRoleId}/assign/${secondUserId}`, {
    method: 'POST'
  });
  
  await waitForEvents(2, 3000);
  
  const assignEvents = receivedEvents.filter(e => 
    e.type === 'roleAssigned' || e.type === 'roleAssigned (Member)'
  );
  
  addTestResult('Role Assigned Events', assignEvents.length >= 1, 
    `Received ${assignEvents.length} role assignment events`);
  
  // Test role removal
  console.log('  🎯 Removing role from member...');
  await apiRequest(`/api/servers/${testServerId}/roles/${testRoleId}/assign/${secondUserId}`, {
    method: 'DELETE'
  });
  
  await waitForEvents(2, 3000);
  
  const removeEvents = receivedEvents.filter(e => 
    e.type === 'roleRemoved' || e.type === 'roleRemoved (Member)'
  );
  
  addTestResult('Role Removed Events', removeEvents.length >= 1, 
    `Received ${removeEvents.length} role removal events`);
  
  return receivedEvents.length - initialEvents;
}

async function testRoleReordering() {
  console.log('\\n🔄 Testing Role Reordering Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create a second role first
  console.log('  👑 Creating second role for reordering...');
  const role2 = await apiRequest(`/api/servers/${testServerId}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Second Test Role',
      color: '#3366FF',
      permissions: ['VIEW_CHANNEL']
    })
  });
  
  await waitForEvents(2, 2000);
  
  // Reorder roles
  console.log('  🔄 Reordering roles...');
  await apiRequest(`/api/servers/${testServerId}/roles/reorder`, {
    method: 'PATCH',
    body: JSON.stringify({
      roles: [
        { id: role2._id, position: 10 },
        { id: testRoleId, position: 5 }
      ]
    })
  });
  
  await waitForEvents(2, 3000);
  
  const reorderEvents = receivedEvents.filter(e => 
    e.type === 'rolesReordered' || e.type === 'rolesReordered (Member)'
  );
  
  addTestResult('Role Reordering Events', reorderEvents.length >= 1, 
    `Received ${reorderEvents.length} role reordering events`);
  
  return receivedEvents.length - initialEvents;
}

async function testRoleDeletion() {
  console.log('\\n🗑️  Testing Role Deletion Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Delete role
  console.log('  🗑️  Deleting role...');
  await apiRequest(`/api/servers/${testServerId}/roles/${testRoleId}`, {
    method: 'DELETE'
  });
  
  await waitForEvents(2, 3000); // Should get events for both users
  
  const deleteEvents = receivedEvents.filter(e => 
    e.type === 'roleDeleted' || e.type === 'roleDeleted (Member)'
  );
  
  addTestResult('Role Deleted Events', deleteEvents.length >= 1, 
    `Received ${deleteEvents.length} role deletion events`);
  
  // Verify event data structure
  if (deleteEvents.length > 0) {
    const eventData = deleteEvents[0].data;
    const hasRequiredFields = eventData.serverId && eventData.roleId && eventData.deletedBy;
    addTestResult('Role Deleted Event Data', hasRequiredFields, 
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
  console.log('\\n📊 ROLE & PERMISSION SOCKET.IO TEST RESULTS');
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
  
  console.log('\\n📡 Role Socket.IO Events Summary:');
  const eventTypes = [...new Set(receivedEvents.map(e => e.type.replace(' (Member)', '')))];
  eventTypes.forEach(eventType => {
    const count = receivedEvents.filter(e => e.type.includes(eventType)).length;
    console.log(`  📨 ${eventType}: ${count} events received`);
  });
  
  console.log(`\\n🎯 Total Events Received: ${receivedEvents.length}`);
  
  // Role-specific validation
  const roleEvents = ['roleCreated', 'roleUpdated', 'roleDeleted', 'rolesReordered', 'roleAssigned', 'roleRemoved'];
  const workingRoleEvents = roleEvents.filter(event => 
    receivedEvents.some(e => e.type.includes(event))
  );
  
  console.log(`\\n📊 Role Events Working: ${workingRoleEvents.length}/${roleEvents.length}`);
  console.log(`  ✅ Working: ${workingRoleEvents.join(', ')}`);
  
  if (successRate >= 90) {
    console.log('\\n🎉 EXCELLENT! All role & permission Socket.IO events are working perfectly!');
  } else if (successRate >= 75) {
    console.log('\\n👍 GOOD! Most role & permission Socket.IO events are working.');
  } else {
    console.log('\\n⚠️  WARNING! Role & permission Socket.IO events need attention.');
  }
}

async function runRolePermissionTest() {
  console.log('🚀 COMPREHENSIVE ROLE & PERMISSION SOCKET.IO TESTING SUITE');
  console.log('='.repeat(65));
  console.log('📡 Testing ALL role management & permission events\\n');
  
  try {
    await setupAuth();
    await setupSockets();
    await setupServer();
    
    console.log('\\n🧪 STARTING ROLE & PERMISSION SOCKET.IO TESTS...');
    console.log('-'.repeat(60));
    
    const permissions = await testPermissionsAPI();
    const createEvents = await testRoleCreation();
    const updateEvents = await testRoleUpdate();
    const assignEvents = await testRoleAssignment();
    const reorderEvents = await testRoleReordering();
    const deleteEvents = await testRoleDeletion();
    
    await cleanup();
    
    // Final wait for any delayed events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    generateReport();
    
  } catch (error) {
    console.error('❌ Role & Permission test suite failed:', error.message);
    await cleanup();
  }
}

runRolePermissionTest();
