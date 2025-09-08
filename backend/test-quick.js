#!/usr/bin/env node

/**
 * Quick Test Script for Discord-like Chat Backend
 * Simple and reliable testing with clear output
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

// Test data
let authToken = '';
let userId = '';
let serverId = '';
let channelId = '';
let messageId = '';
let testData = {}; // Store user registration data

// Colors for output
const colors = {
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  reset: '\x1b[0m',
  bold: '\x1b[1m'
};

function log(message, color = colors.reset) {
  console.log(`${color}${message}${colors.reset}`);
}

function generateTestData() {
  const rand = Math.random().toString(36).substring(2, 8);
  return {
    email: `test_${rand}@example.com`,
    password: 'TestPassword123!',
    name: `Test User ${rand}`,
    username: `testuser${rand}`,
    serverName: `Test Server ${rand}`,
    channelName: `test-channel-${rand}`,
    messageContent: `Test message ${rand}`
  };
}

async function makeRequest(method, endpoint, data = null, useAuth = true) {
  try {
    const config = {
      method,
      url: endpoint.startsWith('/health') ? `${BASE_URL}${endpoint}` : `${API_URL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (useAuth && authToken) {
      config.headers.Authorization = `Bearer ${authToken}`;
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

async function testEndpoint(name, method, endpoint, data = null, useAuth = true, expectedStatus = 200) {
  log(`\n🧪 Testing: ${name}`, colors.blue);
  
  const result = await makeRequest(method, endpoint, data, useAuth);
  
  if (result.success && result.status === expectedStatus) {
    log(`✅ ${name} - PASSED (${result.status})`, colors.green);
    return result.data;
  } else {
    log(`❌ ${name} - FAILED (${result.status})`, colors.red);
    console.log('Response:', result.data);
    return null;
  }
}

async function runTests() {
  log('🚀 Starting Discord-like Chat Backend Tests', colors.bold + colors.magenta);
  log(`📍 Testing server at: ${BASE_URL}`, colors.yellow);
  
  // Generate test data once at the beginning
  testData = generateTestData();
  let passedTests = 0;
  let totalTests = 0;

  // 1. Health Check
  totalTests++;
  log('\n📋 BASIC HEALTH CHECK', colors.bold + colors.magenta);
  const healthResult = await testEndpoint('Health Check', 'GET', '/health', null, false);
  if (healthResult) passedTests++;

  // 2. User Registration
  totalTests++;
  log('\n👤 USER AUTHENTICATION', colors.bold + colors.magenta);
  const registerResult = await testEndpoint(
    'User Registration',
    'POST',
    '/auth/register',
    {
      email: testData.email,
      password: testData.password,
      name: testData.name,
      username: testData.username
    },
    false,
    201
  );
  
  if (registerResult && registerResult.success) {
    authToken = registerResult.data.token;
    userId = registerResult.data.user.id;
    passedTests++;
    log(`🔑 Auth token acquired: ${authToken.substring(0, 20)}...`, colors.yellow);
  }

  // 3. User Login
  totalTests++;
  const loginResult = await testEndpoint(
    'User Login',
    'POST',
    '/auth/login',
    {
      email: testData.email,
      password: testData.password
    },
    false
  );
  if (loginResult) passedTests++;

  // 4. Get Profile
  totalTests++;
  const profileResult = await testEndpoint('Get User Profile', 'GET', '/auth/me');
  if (profileResult) passedTests++;

  // 5. Create Server
  totalTests++;
  log('\n🏰 SERVER MANAGEMENT', colors.bold + colors.magenta);
  const serverResult = await testEndpoint(
    'Create Server',
    'POST',
    '/servers',
    {
      name: testData.serverName,
      description: 'Test server for API testing'
    },
    true,
    201
  );
  
  if (serverResult) {
    serverId = serverResult._id;
    passedTests++;
    log(`🏰 Server created: ${serverId}`, colors.yellow);
  }

  // 6. Get User Servers
  totalTests++;
  const serversResult = await testEndpoint('Get User Servers', 'GET', '/servers');
  if (serversResult) passedTests++;

  // 7. Get Server Details
  totalTests++;
  if (serverId) {
    const serverDetailsResult = await testEndpoint('Get Server Details', 'GET', `/servers/${serverId}`);
    if (serverDetailsResult) passedTests++;
  }

  // 8. Create Channel
  totalTests++;
  log('\n📺 CHANNEL MANAGEMENT', colors.bold + colors.magenta);
  const channelResult = await testEndpoint(
    'Create Text Channel',
    'POST',
    '/channels',
    {
      name: testData.channelName,
      type: 'TEXT',
      serverId: serverId,
      topic: 'Test channel for API testing'
    },
    true,
    201
  );
  
  if (channelResult) {
    channelId = channelResult._id;
    passedTests++;
    log(`📺 Channel created: ${channelId}`, colors.yellow);
  }

  // 9. Get Channel Details
  totalTests++;
  if (channelId) {
    const channelDetailsResult = await testEndpoint('Get Channel Details', 'GET', `/channels/${channelId}`);
    if (channelDetailsResult) passedTests++;
  }

  // 10. Send Message
  totalTests++;
  log('\n💬 MESSAGE SYSTEM', colors.bold + colors.magenta);
  if (channelId) {
    const messageResult = await testEndpoint(
      'Send Message',
      'POST',
      `/channels/${channelId}/messages`,
      {
        content: testData.messageContent
      },
      true,
      201
    );
    
    if (messageResult) {
      messageId = messageResult._id;
      passedTests++;
      log(`💬 Message sent: ${messageId}`, colors.yellow);
    }
  }

  // 11. Get Channel Messages
  totalTests++;
  if (channelId) {
    const messagesResult = await testEndpoint('Get Channel Messages', 'GET', `/channels/${channelId}/messages`);
    if (messagesResult) passedTests++;
  }

  // 12. Edit Message
  totalTests++;
  if (messageId) {
    const editResult = await testEndpoint(
      'Edit Message',
      'PUT',
      `/messages/${messageId}`,
      {
        content: 'Edited: ' + testData.messageContent
      }
    );
    if (editResult) passedTests++;
  }

  // 13. Add Reaction
  totalTests++;
  if (messageId) {
    const reactionResult = await testEndpoint(
      'Add Reaction',
      'POST',
      `/messages/${messageId}/reactions`,
      {
        emoji: { name: '👍', id: null }
      }
    );
    if (reactionResult) passedTests++;
  }

  // 14. Get Friends List
  totalTests++;
  log('\n👥 FRIEND SYSTEM', colors.bold + colors.magenta);
  const friendsResult = await testEndpoint('Get Friends List', 'GET', '/friends');
  if (friendsResult) passedTests++;

  // 15. Get DM Channels
  totalTests++;
  log('\n📨 DIRECT MESSAGES', colors.bold + colors.magenta);
  const dmsResult = await testEndpoint('Get DM Channels', 'GET', '/dms');
  if (dmsResult) passedTests++;

  // Test Summary
  log('\n📊 TEST SUMMARY', colors.bold + colors.magenta);
  log(`Total Tests: ${totalTests}`, colors.yellow);
  log(`Passed: ${passedTests}`, colors.green);
  log(`Failed: ${totalTests - passedTests}`, colors.red);
  log(`Success Rate: ${((passedTests / totalTests) * 100).toFixed(1)}%`, colors.bold);
  
  if (passedTests === totalTests) {
    log('\n🎉 All tests passed! Your Discord-like backend is working perfectly!', colors.bold + colors.green);
  } else {
    log('\n⚠️  Some tests failed. Check the output above for details.', colors.bold + colors.yellow);
  }
}

// Run the tests
runTests().catch(error => {
  log(`❌ Test suite crashed: ${error.message}`, colors.red);
  console.error(error);
  process.exit(1);
});
