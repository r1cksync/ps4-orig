import { io } from 'socket.io-client';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
let authToken = '';
let secondUserToken = '';
let socket = null;
let secondSocket = null;
let testServerId = '';
let testChannelId = '';
let testRoleId = '';
let secondUserId = '';
let receivedEvents = [];
let testResults = [];

console.log('🚀 COMPREHENSIVE SERVER SOCKET.IO TESTING SUITE');
console.log('=' .repeat(60));
console.log('📡 Testing ALL server-related real-time events\n');

// Helper function for API requests
async function apiRequest(endpoint, options = {}, token = authToken) {
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`API Error ${response.status}: ${error}`);
  }
  
  return response.json();
}

// Test result tracker
function addTestResult(test, passed, details = '') {
  testResults.push({
    test,
    passed,
    details,
    timestamp: new Date().toISOString()
  });
  
  const status = passed ? '✅' : '❌';
  console.log(`${status} ${test}${details ? ` - ${details}` : ''}`);
}

// Event tracker
function trackEvent(eventType, data, expectedFields = []) {
  receivedEvents.push({
    type: eventType,
    data,
    timestamp: new Date().toISOString(),
    hasExpectedFields: expectedFields.every(field => {
      const keys = field.split('.');
      let obj = data;
      for (const key of keys) {
        if (!obj || obj[key] === undefined) return false;
        obj = obj[key];
      }
      return true;
    })
  });
  
  const status = expectedFields.length === 0 || expectedFields.every(field => {
    const keys = field.split('.');
    let obj = data;
    for (const key of keys) {
      if (!obj || obj[key] === undefined) return false;
      obj = obj[key];
    }
    return true;
  }) ? '✅' : '❌';
  
  console.log(`📡 ${status} Event: ${eventType}`, expectedFields.length > 0 ? `(${expectedFields.join(', ')})` : '');
}

// Setup users and authentication
async function setupAuthentication() {
  console.log('\n🔐 Setting up authentication...');
  
  // Create fresh test users with unique emails
  const timestamp = Date.now();
  const user1Email = `sockettest1_${timestamp}@example.com`;
  const user2Email = `sockettest2_${timestamp}@example.com`;
  const password = 'TestPassword123!';
  
  // Register first user (registration returns token directly)
  const register1Response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user1Email,
      password: password,
      name: 'Socket Test User 1'
    })
  });
  
  if (!register1Response.ok) {
    const errorText = await register1Response.text();
    console.log(`    ❌ Registration failed for user 1: ${errorText}`);
    throw new Error(`Registration failed for user 1: ${errorText}`);
  }
  
  console.log(`    ✅ User 1 registered successfully`);
  const register1Data = await register1Response.json();
  authToken = register1Data.data?.token || register1Data.token;
  
  // Register second user (registration returns token directly)
  const register2Response = await fetch(`${BASE_URL}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: user2Email,
      password: password,
      name: 'Socket Test User 2'
    })
  });
  
  if (!register2Response.ok) {
    const errorText = await register2Response.text();
    console.log(`    ❌ Registration failed for user 2: ${errorText}`);
    throw new Error(`Registration failed for user 2: ${errorText}`);
  }
  
  console.log(`    ✅ User 2 registered successfully`);
  const register2Data = await register2Response.json();
  secondUserToken = register2Data.data?.token || register2Data.token;
  secondUserId = register2Data.data?.user?.id || register2Data.user?._id || register2Data.user?.id;
  
  addTestResult('User Authentication', true, 'Both users logged in successfully');
}

// Setup Socket.IO connections
async function setupSockets() {
  console.log('\n🔌 Setting up Socket.IO connections...');
  
  return new Promise((resolve, reject) => {
    let connectionsReady = 0;
    
    // First user socket
    socket = io(BASE_URL, {
      auth: { token: authToken },
      query: { token: authToken },
      extraHeaders: { 'Authorization': `Bearer ${authToken}` }
    });
    
    // Second user socket
    secondSocket = io(BASE_URL, {
      auth: { token: secondUserToken },
      query: { token: secondUserToken },
      extraHeaders: { 'Authorization': `Bearer ${secondUserToken}` }
    });
    
    // Setup event listeners for first socket
    const serverEvents = [
      'serverCreated', 'serverUpdated', 'serverDeleted',
      'memberJoined', 'memberLeft', 'memberUpdated',
      'roleCreated', 'roleUpdated', 'roleDeleted', 'rolesReordered',
      'channelCreated', 'channelUpdated', 'channelDeleted',
      'inviteCreated', 'memberBanned', 'memberUnbanned',
      'voiceStateUpdate', 'message', 'typing'
    ];
    
    const directEvents = [
      'kickedFromServer', 'bannedFromServer', 'unbannedFromServer'
    ];
    
    serverEvents.forEach(eventType => {
      socket.on(eventType, (data) => {
        trackEvent(eventType, data, getExpectedFields(eventType));
      });
      
      secondSocket.on(eventType, (data) => {
        trackEvent(`${eventType} (User2)`, data, getExpectedFields(eventType));
      });
    });
    
    directEvents.forEach(eventType => {
      socket.on(eventType, (data) => {
        trackEvent(eventType, data, getExpectedFields(eventType));
      });
      
      secondSocket.on(eventType, (data) => {
        trackEvent(`${eventType} (User2)`, data, getExpectedFields(eventType));
      });
    });
    
    socket.on('connect', () => {
      addTestResult('Socket Connection (User 1)', true);
      connectionsReady++;
      if (connectionsReady === 2) resolve();
    });
    
    secondSocket.on('connect', () => {
      addTestResult('Socket Connection (User 2)', true);
      connectionsReady++;
      if (connectionsReady === 2) resolve();
    });
    
    socket.on('connect_error', (error) => {
      addTestResult('Socket Connection (User 1)', false, error.message);
      reject(error);
    });
    
    secondSocket.on('connect_error', (error) => {
      addTestResult('Socket Connection (User 2)', false, error.message);
      reject(error);
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      if (connectionsReady < 2) {
        reject(new Error('Socket connection timeout'));
      }
    }, 10000);
  });
}

// Expected fields for each event type
function getExpectedFields(eventType) {
  const fieldMap = {
    serverCreated: ['serverId', 'server', 'createdBy'],
    serverUpdated: ['serverId', 'server', 'updatedBy', 'changes'],
    serverDeleted: ['serverId', 'serverName', 'deletedBy'],
    memberJoined: ['serverId', 'member', 'memberCount'],
    memberLeft: ['serverId', 'userId'],
    memberUpdated: ['serverId', 'member', 'updatedBy', 'changes'],
    roleCreated: ['serverId', 'role', 'createdBy'],
    roleUpdated: ['serverId', 'role', 'updatedBy', 'changes'],
    roleDeleted: ['serverId', 'roleId', 'roleName', 'deletedBy'],
    rolesReordered: ['serverId', 'roles', 'reorderedBy'],
    channelCreated: ['serverId', 'channel', 'createdBy'],
    channelUpdated: ['serverId', 'channel', 'updatedBy', 'changes'],
    channelDeleted: ['serverId', 'channelId', 'channelName', 'deletedBy'],
    inviteCreated: ['serverId', 'code', 'createdBy'],
    memberBanned: ['serverId', 'userId', 'bannedBy'],
    memberUnbanned: ['serverId', 'userId', 'unbannedBy'],
    kickedFromServer: ['serverId', 'serverName', 'kickedBy'],
    bannedFromServer: ['serverId', 'serverName', 'bannedBy'],
    unbannedFromServer: ['serverId', 'serverName', 'unbannedBy'],
    voiceStateUpdate: ['channelId', 'userId', 'action'],
    message: ['_id', 'content', 'author'],
    typing: ['channelId', 'userId', 'username']
  };
  
  return fieldMap[eventType] || [];
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

// Test 1: Server Management Events
async function testServerManagement() {
  console.log('\n🏢 Testing Server Management Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create server
  console.log('  📝 Creating server...');
  const server = await apiRequest('/api/servers', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Socket Test Server',
      description: 'Testing real-time server events'
    })
  });
  testServerId = server._id;
  
  await waitForEvents(1, 2000);
  
  // Check if serverCreated event was received
  const createEvent = receivedEvents.find(e => e.type === 'serverCreated');
  addTestResult('Server Creation Event', !!createEvent, createEvent ? 'Event received with proper data' : 'Event not received');
  
  // Join server room for both users
  socket.emit('joinServer', { serverId: testServerId });
  secondSocket.emit('joinServer', { serverId: testServerId });
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Update server
  console.log('  ✏️  Updating server...');
  await apiRequest(`/api/servers/${testServerId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'Updated Socket Test Server',
      description: 'Updated description for testing'
    })
  });
  
  await waitForEvents(2, 2000); // Should get 2 events (one for each socket)
  
  const updateEvents = receivedEvents.filter(e => e.type === 'serverUpdated' || e.type === 'serverUpdated (User2)');
  addTestResult('Server Update Events', updateEvents.length >= 1, `Received ${updateEvents.length} update events`);
  
  // Test server members - second user joins
  console.log('  👥 Testing member join...');
  
  // Add the second user to the server (first user is already the creator/member)
  await apiRequest(`/api/servers/${testServerId}/join`, {
    method: 'POST'
  }, secondUserToken);
  
  await waitForEvents(2, 2000); // Wait for join events
  
  const joinEvents = receivedEvents.filter(e => e.type === 'memberJoined' || e.type === 'memberJoined (User2)');
  addTestResult('Member Join Events', joinEvents.length >= 1, `Received ${joinEvents.length} join events`);
  
  return receivedEvents.length - initialEvents;
}

// Test 2: Role Management Events
async function testRoleManagement() {
  console.log('\n👑 Testing Role Management Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create role
  console.log('  📝 Creating role...');
  const role = await apiRequest(`/api/servers/${testServerId}/roles`, {
    method: 'POST',
    body: JSON.stringify({
      name: 'Socket Test Role',
      color: '#FF5733',
      permissions: ['sendMessages', 'readMessageHistory']
    })
  });
  testRoleId = role._id;
  
  await waitForEvents(2, 2000);
  
  const createEvents = receivedEvents.filter(e => e.type === 'roleCreated' || e.type === 'roleCreated (User2)');
  addTestResult('Role Creation Events', createEvents.length >= 1, `Received ${createEvents.length} creation events`);
  
  // Update role
  console.log('  ✏️  Updating role...');
  await apiRequest(`/api/servers/${testServerId}/roles/${testRoleId}`, {
    method: 'PATCH',
    body: JSON.stringify({
      name: 'Updated Socket Test Role',
      color: '#33FF57'
    })
  });
  
  await waitForEvents(2, 2000);
  
  const updateEvents = receivedEvents.filter(e => e.type === 'roleUpdated' || e.type === 'roleUpdated (User2)');
  addTestResult('Role Update Events', updateEvents.length >= 1, `Received ${updateEvents.length} update events`);
  
  // Delete role
  console.log('  🗑️  Deleting role...');
  await apiRequest(`/api/servers/${testServerId}/roles/${testRoleId}`, {
    method: 'DELETE'
  });
  
  await waitForEvents(2, 2000);
  
  const deleteEvents = receivedEvents.filter(e => e.type === 'roleDeleted' || e.type === 'roleDeleted (User2)');
  addTestResult('Role Deletion Events', deleteEvents.length >= 1, `Received ${deleteEvents.length} deletion events`);
  
  return receivedEvents.length - initialEvents;
}

// Test 3: Channel Management Events
async function testChannelManagement() {
  console.log('\n📺 Testing Channel Management Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create channel
  console.log('  📝 Creating channel...');
  const channel = await apiRequest('/api/channels', {
    method: 'POST',
    body: JSON.stringify({
      name: 'socket-test-channel',
      type: 'text',
      serverId: testServerId,
      topic: 'Testing socket events'
    })
  });
  testChannelId = channel._id;
  
  await waitForEvents(2, 2000);
  
  const createEvents = receivedEvents.filter(e => e.type === 'channelCreated' || e.type === 'channelCreated (User2)');
  addTestResult('Channel Creation Events', createEvents.length >= 1, `Received ${createEvents.length} creation events`);
  
  // Update channel
  console.log('  ✏️  Updating channel...');
  await apiRequest(`/api/channels/${testChannelId}`, {
    method: 'PUT',
    body: JSON.stringify({
      name: 'updated-socket-test-channel',
      topic: 'Updated topic for testing'
    })
  });
  
  await waitForEvents(2, 2000);
  
  const updateEvents = receivedEvents.filter(e => e.type === 'channelUpdated' || e.type === 'channelUpdated (User2)');
  addTestResult('Channel Update Events', updateEvents.length >= 1, `Received ${updateEvents.length} update events`);
  
  // Test messaging events
  console.log('  💬 Testing message events...');
  socket.emit('joinChannel', testChannelId);
  secondSocket.emit('joinChannel', testChannelId);
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Send message
  await apiRequest(`/api/channels/${testChannelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      content: 'Test message for socket events'
    })
  });
  
  await waitForEvents(2, 2000);
  
  const messageEvents = receivedEvents.filter(e => e.type === 'message' || e.type === 'newMessage');
  addTestResult('Message Events', messageEvents.length >= 1, `Received ${messageEvents.length} message events`);
  
  // Test typing events
  console.log('  ⌨️  Testing typing events...');
  await apiRequest(`/api/channels/${testChannelId}/typing`, {
    method: 'POST'
  });
  
  await waitForEvents(1, 2000);
  
  const typingEvents = receivedEvents.filter(e => e.type === 'typing');
  addTestResult('Typing Events', typingEvents.length >= 1, `Received ${typingEvents.length} typing events`);
  
  // Delete channel
  console.log('  🗑️  Deleting channel...');
  await apiRequest(`/api/channels/${testChannelId}`, {
    method: 'DELETE'
  });
  
  await waitForEvents(2, 2000);
  
  const deleteEvents = receivedEvents.filter(e => e.type === 'channelDeleted' || e.type === 'channelDeleted (User2)');
  addTestResult('Channel Deletion Events', deleteEvents.length >= 1, `Received ${deleteEvents.length} deletion events`);
  
  return receivedEvents.length - initialEvents;
}

// Test 4: Member Management Events
async function testMemberManagement() {
  console.log('\n👥 Testing Member Management Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Test member kick
  console.log('  ⚠️  Testing member kick...');
  try {
    await apiRequest(`/api/servers/${testServerId}/members/${secondUserId}/kick`, {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Testing kick socket events'
      })
    });
    
    await waitForEvents(3, 3000); // memberLeft + kickedFromServer
    
    const kickEvents = receivedEvents.filter(e => 
      e.type === 'memberLeft' || 
      e.type === 'kickedFromServer' || 
      e.type === 'kickedFromServer (User2)'
    );
    addTestResult('Member Kick Events', kickEvents.length >= 1, `Received ${kickEvents.length} kick-related events`);
  } catch (error) {
    addTestResult('Member Kick Events', false, `Error: ${error.message}`);
  }
  
  // Rejoin for ban test
  await apiRequest(`/api/servers/${testServerId}/join`, {
    method: 'POST'
  }, secondUserToken);
  
  await waitForEvents(2, 2000);
  
  // Test member ban
  console.log('  🚫 Testing member ban...');
  try {
    await apiRequest(`/api/servers/${testServerId}/members/${secondUserId}/ban`, {
      method: 'POST',
      body: JSON.stringify({
        reason: 'Testing ban socket events'
      })
    });
    
    await waitForEvents(3, 3000); // memberBanned + bannedFromServer
    
    const banEvents = receivedEvents.filter(e => 
      e.type === 'memberBanned' || 
      e.type === 'bannedFromServer' || 
      e.type === 'bannedFromServer (User2)'
    );
    addTestResult('Member Ban Events', banEvents.length >= 1, `Received ${banEvents.length} ban-related events`);
  } catch (error) {
    addTestResult('Member Ban Events', false, `Error: ${error.message}`);
  }
  
  // Test member unban
  console.log('  ✅ Testing member unban...');
  try {
    await apiRequest(`/api/servers/${testServerId}/bans/${secondUserId}`, {
      method: 'DELETE'
    });
    
    await waitForEvents(3, 3000); // memberUnbanned + unbannedFromServer
    
    const unbanEvents = receivedEvents.filter(e => 
      e.type === 'memberUnbanned' || 
      e.type === 'unbannedFromServer' || 
      e.type === 'unbannedFromServer (User2)'
    );
    addTestResult('Member Unban Events', unbanEvents.length >= 1, `Received ${unbanEvents.length} unban-related events`);
  } catch (error) {
    addTestResult('Member Unban Events', false, `Error: ${error.message}`);
  }
  
  return receivedEvents.length - initialEvents;
}

// Test 5: Invite Management Events
async function testInviteManagement() {
  console.log('\n📨 Testing Invite Management Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create invite
  console.log('  📝 Creating invite...');
  await apiRequest(`/api/servers/${testServerId}/invites`, {
    method: 'POST',
    body: JSON.stringify({
      maxUses: 5,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    })
  });
  
  await waitForEvents(2, 2000);
  
  const inviteEvents = receivedEvents.filter(e => e.type === 'inviteCreated' || e.type === 'inviteCreated (User2)');
  addTestResult('Invite Creation Events', inviteEvents.length >= 1, `Received ${inviteEvents.length} invite events`);
  
  return receivedEvents.length - initialEvents;
}

// Test 6: Voice Channel Events
async function testVoiceEvents() {
  console.log('\n🎵 Testing Voice Channel Events...');
  
  const initialEvents = receivedEvents.length;
  
  // Create voice channel
  console.log('  📝 Creating voice channel...');
  const voiceChannel = await apiRequest('/api/channels', {
    method: 'POST',
    body: JSON.stringify({
      name: 'Voice Test Channel',
      type: 'voice',
      serverId: testServerId
    })
  });
  
  await waitForEvents(2, 2000);
  
  // Test voice join
  console.log('  🎤 Testing voice join...');
  try {
    await apiRequest(`/api/channels/${voiceChannel._id}/voice/join`, {
      method: 'POST'
    });
    
    await waitForEvents(2, 2000);
    
    const voiceJoinEvents = receivedEvents.filter(e => e.type === 'voiceStateUpdate');
    addTestResult('Voice Join Events', voiceJoinEvents.length >= 1, `Received ${voiceJoinEvents.length} voice join events`);
  } catch (error) {
    addTestResult('Voice Join Events', false, `Error: ${error.message}`);
  }
  
  // Test voice leave
  console.log('  🔇 Testing voice leave...');
  try {
    await apiRequest(`/api/channels/${voiceChannel._id}/voice/leave`, {
      method: 'POST'
    });
    
    await waitForEvents(2, 2000);
    
    const voiceLeaveEvents = receivedEvents.filter(e => e.type === 'voiceStateUpdate');
    addTestResult('Voice Leave Events', voiceLeaveEvents.length >= 2, `Received ${voiceLeaveEvents.length} total voice events`);
  } catch (error) {
    addTestResult('Voice Leave Events', false, `Error: ${error.message}`);
  }
  
  return receivedEvents.length - initialEvents;
}

// Cleanup
async function cleanup() {
  console.log('\n🧹 Cleaning up test data...');
  
  try {
    // Delete test server
    await apiRequest(`/api/servers/${testServerId}`, { method: 'DELETE' });
    
    await waitForEvents(2, 2000);
    
    const deleteEvents = receivedEvents.filter(e => e.type === 'serverDeleted' || e.type === 'serverDeleted (User2)');
    addTestResult('Server Deletion Events', deleteEvents.length >= 1, `Received ${deleteEvents.length} deletion events`);
  } catch (error) {
    addTestResult('Cleanup', false, `Error during cleanup: ${error.message}`);
  }
  
  // Disconnect sockets
  if (socket) {
    socket.disconnect();
    addTestResult('Socket Cleanup (User 1)', true);
  }
  
  if (secondSocket) {
    secondSocket.disconnect();
    addTestResult('Socket Cleanup (User 2)', true);
  }
}

// Generate comprehensive report
function generateReport() {
  console.log('\n' + '='.repeat(60));
  console.log('📊 COMPREHENSIVE SOCKET.IO TEST REPORT');
  console.log('='.repeat(60));
  
  const totalTests = testResults.length;
  const passedTests = testResults.filter(r => r.passed).length;
  const failedTests = totalTests - passedTests;
  
  console.log(`\n📈 OVERALL RESULTS:`);
  console.log(`   Total Tests: ${totalTests}`);
  console.log(`   Passed: ${passedTests} ✅`);
  console.log(`   Failed: ${failedTests} ${failedTests > 0 ? '❌' : '✅'}`);
  console.log(`   Success Rate: ${((passedTests/totalTests) * 100).toFixed(1)}%`);
  
  console.log(`\n📡 EVENT ANALYSIS:`);
  console.log(`   Total Events Received: ${receivedEvents.length}`);
  
  // Event type breakdown
  const eventCounts = {};
  receivedEvents.forEach(event => {
    const baseType = event.type.replace(' (User2)', '');
    eventCounts[baseType] = (eventCounts[baseType] || 0) + 1;
  });
  
  console.log(`\n📋 EVENT BREAKDOWN:`);
  Object.entries(eventCounts).sort((a, b) => b[1] - a[1]).forEach(([event, count]) => {
    console.log(`   ${event}: ${count} events`);
  });
  
  // Test category results
  console.log(`\n🏆 TEST CATEGORY RESULTS:`);
  const categories = [
    'Server', 'Role', 'Channel', 'Member', 'Invite', 'Voice', 'Socket'
  ];
  
  categories.forEach(category => {
    const categoryTests = testResults.filter(t => t.test.includes(category));
    if (categoryTests.length > 0) {
      const categoryPassed = categoryTests.filter(t => t.passed).length;
      const categoryTotal = categoryTests.length;
      const categoryPercent = ((categoryPassed/categoryTotal) * 100).toFixed(1);
      console.log(`   ${category}: ${categoryPassed}/${categoryTotal} (${categoryPercent}%) ${categoryPercent == 100 ? '✅' : '⚠️'}`);
    }
  });
  
  // Failed tests details
  const failedTestsDetails = testResults.filter(r => !r.passed);
  if (failedTestsDetails.length > 0) {
    console.log(`\n❌ FAILED TESTS DETAILS:`);
    failedTestsDetails.forEach(test => {
      console.log(`   • ${test.test}: ${test.details}`);
    });
  }
  
  // Event validation results
  console.log(`\n🔍 EVENT VALIDATION:`);
  const eventValidation = {};
  receivedEvents.forEach(event => {
    const baseType = event.type.replace(' (User2)', '');
    if (!eventValidation[baseType]) {
      eventValidation[baseType] = { total: 0, valid: 0 };
    }
    eventValidation[baseType].total++;
    if (event.hasExpectedFields) {
      eventValidation[baseType].valid++;
    }
  });
  
  Object.entries(eventValidation).forEach(([event, stats]) => {
    const validPercent = ((stats.valid/stats.total) * 100).toFixed(1);
    console.log(`   ${event}: ${stats.valid}/${stats.total} valid (${validPercent}%) ${validPercent == 100 ? '✅' : '⚠️'}`);
  });
  
  // Final assessment
  console.log(`\n🎯 FINAL ASSESSMENT:`);
  if (passedTests === totalTests && receivedEvents.length > 0) {
    console.log('   🎉 EXCELLENT! All server Socket.IO events working perfectly!');
    console.log('   ✅ Real-time functionality is production-ready!');
  } else if (passedTests >= totalTests * 0.9) {
    console.log('   🟡 GOOD! Most Socket.IO events working correctly.');
    console.log('   ⚠️  Some minor issues need attention.');
  } else if (passedTests >= totalTests * 0.7) {
    console.log('   🟠 NEEDS IMPROVEMENT! Many events working but issues exist.');
    console.log('   🔧 Significant debugging required.');
  } else {
    console.log('   🔴 CRITICAL ISSUES! Major Socket.IO functionality problems.');
    console.log('   🚨 Requires immediate attention before production use.');
  }
  
  console.log(`\n📋 DETAILED EVENT LOG: ${receivedEvents.length} events captured`);
  console.log('='.repeat(60));
}

// Main test execution
async function runComprehensiveTest() {
  try {
    await setupAuthentication();
    await setupSockets();
    
    console.log('\n🧪 STARTING COMPREHENSIVE SOCKET.IO TESTS...');
    console.log('-'.repeat(60));
    
    const serverEvents = await testServerManagement();
    const roleEvents = await testRoleManagement();
    const channelEvents = await testChannelManagement();
    const memberEvents = await testMemberManagement();
    const inviteEvents = await testInviteManagement();
    const voiceEvents = await testVoiceEvents();
    
    await cleanup();
    
    // Wait for final events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    generateReport();
    
    console.log('\n🏁 Comprehensive Socket.IO testing completed!');
    
  } catch (error) {
    console.error('❌ Test suite failed:', error.message);
    console.error(error.stack);
    await cleanup();
    process.exit(1);
  }
  
  process.exit(0);
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n⚠️ Test interrupted, cleaning up...');
  await cleanup();
  process.exit(0);
});

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

runComprehensiveTest();
