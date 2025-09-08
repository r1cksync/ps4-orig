import axios from 'axios';
import { io } from 'socket.io-client';
import colors from 'colors';

// Test configuration
const BASE_URL = 'http://localhost:3001';
const API_BASE = `${BASE_URL}/api`;

// Test users data
let testUsers = {
  user1: {
    email: `testuser1_${Date.now()}@example.com`,
    password: 'TestPass123!',
    name: 'Test User One',
    username: `testuser1_${Math.random().toString(36).substring(7)}`
  },
  user2: {
    email: `testuser2_${Date.now()}@example.com`,
    password: 'TestPass123!',
    name: 'Test User Two', 
    username: `testuser2_${Math.random().toString(36).substring(7)}`
  },
  user3: {
    email: `testuser3_${Date.now()}@example.com`,
    password: 'TestPass123!',
    name: 'Test User Three',
    username: `testuser3_${Math.random().toString(36).substring(7)}`
  }
};

// Store auth tokens and user IDs
let authTokens = {};
let userIds = {};
let registeredUsers = {}; // Store full user data for discriminators
let sockets = {};
let socketEvents = {
  user1: [],
  user2: [],
  user3: []
};

// Test statistics
let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

// Helper functions
function log(message, color = 'white') {
  console.log(colors[color](message));
}

function logSuccess(message) {
  log(`✅ ${message}`, 'green');
  passedTests++;
}

function logError(message) {
  log(`❌ ${message}`, 'red');
  failedTests++;
}

function logInfo(message) {
  log(`ℹ️  ${message}`, 'cyan');
}

function logWarning(message) {
  log(`⚠️  ${message}`, 'yellow');
}

// API helper function
async function makeRequest(method, endpoint, data = null, userKey = 'user1') {
  totalTests++;
  try {
    const config = {
      method,
      url: `${API_BASE}${endpoint}`,
      headers: {}
    };

    if (authTokens[userKey]) {
      config.headers.Authorization = `Bearer ${authTokens[userKey]}`;
    }

    if (data) {
      config.data = data;
    }

    const response = await axios(config);
    return { success: true, status: response.status, data: response.data };
  } catch (error) {
    return {
      success: false,
      status: error.response?.status || 0,
      data: error.response?.data || error.message
    };
  }
}

// Socket helper functions
function createSocket(userKey, token) {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket']
    });

    socket.on('connect', () => {
      log(`🔌 ${userKey} connected to Socket.IO`, 'green');
      sockets[userKey] = socket;
      
      // Set up event listeners for friend-related events
      setupSocketEventListeners(socket, userKey);
      resolve(socket);
    });

    socket.on('connect_error', (error) => {
      log(`❌ ${userKey} Socket connection failed: ${error.message}`, 'red');
      reject(error);
    });

    // Timeout after 5 seconds
    setTimeout(() => {
      if (!socket.connected) {
        reject(new Error('Socket connection timeout'));
      }
    }, 5000);
  });
}

function setupSocketEventListeners(socket, userKey) {
  const friendEvents = [
    'friendRequest',
    'friendRequestAccepted', 
    'friendRequestDeclined',
    'friendRequestCancelled',
    'friendRemoved',
    'friendshipUpdate',
    'userBlocked',
    'userUnblocked',
    'friendStatusUpdate',
    'friendPresenceUpdate'
  ];

  friendEvents.forEach(eventName => {
    socket.on(eventName, (data) => {
      const timestamp = new Date().toISOString();
      socketEvents[userKey].push({
        event: eventName,
        data,
        timestamp,
        received: true
      });
      log(`📡 ${userKey} received ${eventName}:`, 'magenta');
      console.log('   ', JSON.stringify(data, null, 2));
    });
  });
}

function waitForSocketEvent(userKey, eventName, timeout = 3000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    
    const checkForEvent = () => {
      const event = socketEvents[userKey].find(e => 
        e.event === eventName && 
        e.timestamp > new Date(startTime - 1000).toISOString()
      );
      
      if (event) {
        resolve(event);
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for ${eventName} event`));
      } else {
        setTimeout(checkForEvent, 100);
      }
    };
    
    checkForEvent();
  });
}

// Test functions
async function setupUsers() {
  log('\n🚀 Setting up test users...', 'blue');
  
  for (const [userKey, userRegistrationData] of Object.entries(testUsers)) {
    log(`Registering ${userKey}...`, 'cyan');
    // Register user
    const registerResult = await makeRequest('POST', '/auth/register', userRegistrationData, userKey);
    
    if (registerResult.success && registerResult.data && registerResult.data.data && registerResult.data.data.user && registerResult.data.data.user.id) {
      console.log(`DEBUG: Register result for ${userKey}:`, JSON.stringify(registerResult.data.data, null, 2));
      authTokens[userKey] = registerResult.data.data.token;
      userIds[userKey] = registerResult.data.data.user.id;
      registeredUsers[userKey] = registerResult.data.data.user; // Store full user data
      console.log(`DEBUG: Stored registeredUsers[${userKey}]:`, registeredUsers[userKey]);
      console.log(`DEBUG: Current registeredUsers keys:`, Object.keys(registeredUsers));
      logSuccess(`${userKey} registered successfully`);
    } else {
      logError(`${userKey} registration failed or incomplete: ${JSON.stringify(registerResult.data)}`);
      console.log(`DEBUG: Full error response:`, registerResult);
      throw new Error(`Failed to register ${userKey}: ${registerResult.success ? 'Missing user data' : 'Request failed'}`);
    }
  }
  
  // Create socket connections
  for (const [userKey, token] of Object.entries(authTokens)) {
    try {
      await createSocket(userKey, token);
    } catch (error) {
      logError(`Failed to connect ${userKey} to socket: ${error.message}`);
    }
  }
  
  // Wait a bit for connections to stabilize
  await new Promise(resolve => setTimeout(resolve, 1000));
}

async function testFriendSearch() {
  log('\n🔍 Testing Friend Search...', 'blue');
  
  // Debug: Check what's in registeredUsers
  console.log('DEBUG: registeredUsers keys:', Object.keys(registeredUsers));
  console.log('DEBUG: registeredUsers.user2:', registeredUsers.user2);
  
  // Test search for user2 from user1's perspective
  const searchResult = await makeRequest('GET', `/friends/search?query=${registeredUsers.user2.username}`, null, 'user1');
  
  if (searchResult.success && searchResult.data.length > 0) {
    const foundUser = searchResult.data.find(u => u.username === registeredUsers.user2.username);
    if (foundUser && foundUser.relationshipStatus === 'none') {
      logSuccess('Friend search working correctly');
    } else {
      logError('Friend search returned incorrect relationship status');
    }
  } else {
    logError('Friend search failed or returned no results');
  }
}

async function testSendFriendRequest() {
  log('\n📮 Testing Send Friend Request...', 'blue');
  
  // User1 sends friend request to User2 using actual user data
  const requestData = {
    username: registeredUsers.user2.username,
    discriminator: registeredUsers.user2.discriminator
  };
  
  const sendResult = await makeRequest('POST', '/friends/request', requestData, 'user1');
  
  if (sendResult.success) {
    logSuccess('Friend request sent successfully');
    
    // Wait for socket event on user2
    try {
      const event = await waitForSocketEvent('user2', 'friendRequest');
      logSuccess('Real-time friend request notification received');
      return event.data.friendship._id; // Return just the ID
    } catch (error) {
      logError(`Failed to receive friend request notification: ${error.message}`);
    }
  } else {
    logError(`Friend request failed: ${JSON.stringify(sendResult.data)}`);
  }
  
  return null;
}

async function testGetFriendRequests() {
  log('\n📋 Testing Get Friend Requests...', 'blue');
  
  // User2 checks pending friend requests
  const pendingResult = await makeRequest('GET', '/friends?type=pending', null, 'user2');
  
  if (pendingResult.success && pendingResult.data.length > 0) {
    const incomingRequest = pendingResult.data.find(f => f.isIncoming);
    if (incomingRequest) {
      logSuccess('Incoming friend request found in list');
      return incomingRequest._id;
    } else {
      logError('No incoming friend request found');
    }
  } else {
    logError('Failed to get pending friend requests');
  }
  
  // User1 checks sent friend requests
  const sentResult = await makeRequest('GET', '/friends?type=sent', null, 'user1');
  
  if (sentResult.success && sentResult.data.length > 0) {
    const outgoingRequest = sentResult.data.find(f => f.isOutgoing);
    if (outgoingRequest) {
      logSuccess('Outgoing friend request found in list');
    } else {
      logError('No outgoing friend request found');
    }
  } else {
    logError('Failed to get sent friend requests');
  }
  
  return null;
}

async function testAcceptFriendRequest(friendshipId) {
  log('\n✅ Testing Accept Friend Request...', 'blue');
  
  if (!friendshipId) {
    logError('No friendship ID provided for acceptance test');
    return false;
  }
  
  // User2 accepts the friend request
  const acceptResult = await makeRequest('PUT', `/friends/${friendshipId}/accept`, null, 'user2');
  
  if (acceptResult.success) {
    logSuccess('Friend request accepted successfully');
    
    // Wait for socket events
    try {
      await Promise.all([
        waitForSocketEvent('user1', 'friendRequestAccepted'),
        waitForSocketEvent('user2', 'friendshipUpdate')
      ]);
      logSuccess('Real-time acceptance notifications received by both users');
      return true;
    } catch (error) {
      logError(`Failed to receive acceptance notifications: ${error.message}`);
    }
  } else {
    logError(`Friend request acceptance failed: ${JSON.stringify(acceptResult.data)}`);
  }
  
  return false;
}

async function testGetFriendsList() {
  log('\n👥 Testing Get Friends List...', 'blue');
  
  // Both users should now see each other as friends
  const user1Friends = await makeRequest('GET', '/friends?type=friends', null, 'user1');
  const user2Friends = await makeRequest('GET', '/friends?type=friends', null, 'user2');
  
  if (user1Friends.success && user1Friends.data.length > 0) {
    const friend = user1Friends.data.find(f => f.user.username === testUsers.user2.username);
    if (friend && friend.status === 'ACCEPTED') {
      logSuccess('User1 can see User2 in friends list');
    } else {
      logError('User2 not found in User1 friends list');
    }
  } else {
    logError('User1 failed to get friends list');
  }
  
  if (user2Friends.success && user2Friends.data.length > 0) {
    const friend = user2Friends.data.find(f => f.user.username === testUsers.user1.username);
    if (friend && friend.status === 'ACCEPTED') {
      logSuccess('User2 can see User1 in friends list');
    } else {
      logError('User1 not found in User2 friends list');
    }
  } else {
    logError('User2 failed to get friends list');
  }
}

async function testStatusUpdates() {
  log('\n📡 Testing Status Updates...', 'blue');
  
  // User1 updates status to DND
  const statusResult = await makeRequest('PUT', '/auth/status', { 
    status: 'DND',
    customStatus: {
      text: 'In a meeting',
      emoji: { name: '📝' }
    }
  }, 'user1');
  
  if (statusResult.success) {
    logSuccess('Status updated successfully');
    
    // Wait for friend status update on user2
    try {
      const event = await waitForSocketEvent('user2', 'friendStatusUpdate');
      if (event.data.status === 'DND') {
        logSuccess('Real-time status update received by friend');
      } else {
        logError('Incorrect status in real-time update');
      }
    } catch (error) {
      logError(`Failed to receive status update: ${error.message}`);
    }
  } else {
    logError(`Status update failed: ${JSON.stringify(statusResult.data)}`);
  }
}

async function testDeclineFriendRequest() {
  log('\n❌ Testing Decline Friend Request...', 'blue');
  
  // User1 sends friend request to User3
  const requestData = {
    username: registeredUsers.user3.username,
    discriminator: registeredUsers.user3.discriminator
  };
  
  const sendResult = await makeRequest('POST', '/friends/request', requestData, 'user1');
  
  if (sendResult.success) {
    logSuccess('Friend request sent to User3');
    
    // Wait for User3 to receive request
    try {
      const event = await waitForSocketEvent('user3', 'friendRequest');
      const friendshipId = event.data.friendship._id;
      
      // User3 declines the request
      const declineResult = await makeRequest('PUT', `/friends/${friendshipId}/decline`, null, 'user3');
      
      if (declineResult.success) {
        logSuccess('Friend request declined successfully');
        
        // Wait for decline notification
        try {
          await waitForSocketEvent('user1', 'friendRequestDeclined');
          logSuccess('Real-time decline notification received');
        } catch (error) {
          logError(`Failed to receive decline notification: ${error.message}`);
        }
      } else {
        logError(`Friend request decline failed: ${JSON.stringify(declineResult.data)}`);
      }
    } catch (error) {
      logError(`Failed to receive friend request: ${error.message}`);
    }
  } else {
    logError(`Friend request to User3 failed: ${JSON.stringify(sendResult.data)}`);
  }
}

async function testBlockUser() {
  log('\n🚫 Testing Block User...', 'blue');
  
  // User2 blocks User3
  const blockResult = await makeRequest('POST', `/friends/${userIds.user3}/block`, null, 'user2');
  
  if (blockResult.success) {
    logSuccess('User blocked successfully');
    
    // Wait for block notification
    try {
      await waitForSocketEvent('user3', 'userBlocked');
      logSuccess('Real-time block notification received');
    } catch (error) {
      logError(`Failed to receive block notification: ${error.message}`);
    }
    
    // Test that User3 cannot send friend request to User2
    const requestData = {
      username: registeredUsers.user2.username,
      discriminator: registeredUsers.user2.discriminator
    };
    
    const blockedRequestResult = await makeRequest('POST', '/friends/request', requestData, 'user3');
    
    if (!blockedRequestResult.success && blockedRequestResult.status === 400) {
      logSuccess('Blocked user correctly prevented from sending friend request');
    } else {
      logError('Blocked user was able to send friend request');
    }
  } else {
    logError(`Block user failed: ${JSON.stringify(blockResult.data)}`);
  }
}

async function testUnblockUser() {
  log('\n🔓 Testing Unblock User...', 'blue');
  
  // User2 unblocks User3
  const unblockResult = await makeRequest('DELETE', `/friends/${userIds.user3}/unblock`, null, 'user2');
  
  if (unblockResult.success) {
    logSuccess('User unblocked successfully');
    
    // Wait for unblock notification
    try {
      await waitForSocketEvent('user3', 'userUnblocked');
      logSuccess('Real-time unblock notification received');
    } catch (error) {
      logError(`Failed to receive unblock notification: ${error.message}`);
    }
  } else {
    logError(`Unblock user failed: ${JSON.stringify(unblockResult.data)}`);
  }
}

async function testRemoveFriend() {
  log('\n💔 Testing Remove Friend...', 'blue');
  
  // Get friendship ID between user1 and user2
  const friendsResult = await makeRequest('GET', '/friends?type=friends', null, 'user1');
  
  if (friendsResult.success && friendsResult.data.length > 0) {
    const friendship = friendsResult.data.find(f => f.user.username === registeredUsers.user2.username);
    
    if (friendship) {
      const removeResult = await makeRequest('DELETE', `/friends/${friendship._id}`, null, 'user1');
      
      if (removeResult.success) {
        logSuccess('Friend removed successfully');
        
        // Wait for removal notification
        try {
          await waitForSocketEvent('user2', 'friendRemoved');
          logSuccess('Real-time friend removal notification received');
        } catch (error) {
          logError(`Failed to receive removal notification: ${error.message}`);
        }
      } else {
        logError(`Remove friend failed: ${JSON.stringify(removeResult.data)}`);
      }
    } else {
      logError('Friendship not found for removal');
    }
  } else {
    logError('Failed to get friends list for removal test');
  }
}

async function cleanup() {
  log('\n🧹 Cleaning up...', 'blue');
  
  // Close socket connections
  Object.values(sockets).forEach(socket => {
    if (socket && socket.connected) {
      socket.disconnect();
    }
  });
  
  log('Socket connections closed', 'green');
}

async function printTestSummary() {
  log('\n📊 FRIENDS SYSTEM TEST SUMMARY', 'bold');
  log('═'.repeat(50), 'cyan');
  
  log(`Total Tests: ${totalTests}`, 'white');
  log(`Passed: ${passedTests}`, 'green');
  log(`Failed: ${failedTests}`, 'red');
  log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`, 'yellow');
  
  // Socket events summary
  log('\n📡 Socket Events Received:', 'blue');
  Object.entries(socketEvents).forEach(([userKey, events]) => {
    log(`${userKey}: ${events.length} events`, 'cyan');
    events.forEach(event => {
      log(`  - ${event.event} at ${event.timestamp}`, 'gray');
    });
  });
}

// Main test execution
async function runFriendsTests() {
  try {
    log('🚀 Starting Comprehensive Friends System Tests', 'bold');
    log('Testing both REST API and Real-time Socket functionality\n', 'cyan');
    
    await setupUsers();
    log('✅ User setup complete', 'green');
    
    await testFriendSearch();
    
    const friendshipId = await testSendFriendRequest();
    const pendingFriendshipId = await testGetFriendRequests();
    
    // Use the friendship ID from either source
    const finalFriendshipId = friendshipId || pendingFriendshipId;
    const accepted = await testAcceptFriendRequest(finalFriendshipId);
    if (accepted) {
      await testGetFriendsList();
      await testStatusUpdates();
    }
    
    await testDeclineFriendRequest();
    await testBlockUser();
    await testUnblockUser();
    await testRemoveFriend();
    
  } catch (error) {
    logError(`Test execution error: ${error.message}`);
    console.error('Full error stack:', error.stack);
  } finally {
    await cleanup();
    await printTestSummary();
  }
}

// Check if server is running
async function checkServer() {
  try {
    const response = await axios.get(`${BASE_URL}/health`);
    if (response.status === 200) {
      log('✅ Server is running', 'green');
      return true;
    }
  } catch (error) {
    log('❌ Server is not running. Please start the server first.', 'red');
    log('Run: npm run dev', 'yellow');
    return false;
  }
}

// Run tests
(async () => {
  const serverRunning = await checkServer();
  if (serverRunning) {
    await runFriendsTests();
  }
  process.exit(0);
})();
