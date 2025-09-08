#!/usr/bin/env node

/**
 * Simple Test Script for IntelliHack Discord-like Chat Backend
 * Tests all API endpoints using only built-in Node.js modules
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// Configuration
const BASE_URL = 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

// Test data storage
let authTokens = {};
let testData = {
  users: [],
  servers: [],
  channels: [],
  messages: [],
  dmChannels: [],
  friendships: []
};

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m'
};

// Logging utilities
const log = {
  success: (message) => console.log(`${colors.green}✅${colors.reset}`, message),
  error: (message) => console.log(`${colors.red}❌${colors.reset}`, message),
  info: (message) => console.log(`${colors.blue}ℹ️${colors.reset}`, message),
  warn: (message) => console.log(`${colors.yellow}⚠️${colors.reset}`, message),
  test: (message) => console.log(`${colors.cyan}🧪${colors.reset}`, message),
  section: (message) => console.log(`${colors.magenta}${colors.bright}\n=== ${message} ===${colors.reset}`)
};

// HTTP request helper
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const httpModule = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Backend-Test-Script/1.0',
        ...options.headers
      }
    };

    if (authTokens.user1 && !options.noAuth) {
      requestOptions.headers.Authorization = `Bearer ${authTokens.user1}`;
    }

    const req = httpModule.request(requestOptions, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const parsedData = data ? JSON.parse(data) : {};
          resolve({
            status: res.statusCode,
            data: parsedData,
            headers: res.headers
          });
        } catch (error) {
          resolve({
            status: res.statusCode,
            data: data,
            headers: res.headers
          });
        }
      });
    });

    req.on('error', reject);

    if (options.body) {
      req.write(JSON.stringify(options.body));
    }

    req.end();
  });
}

// Test runner class
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.total = 0;
  }

  async run(testName, testFn) {
    this.total++;
    log.test(`Testing: ${testName}`);
    
    try {
      await testFn();
      this.passed++;
      log.success(`${testName} - PASSED`);
    } catch (error) {
      this.failed++;
      log.error(`${testName} - FAILED: ${error.message}`);
      if (error.response) {
        console.error('Response:', error.response);
      }
    }
  }

  summary() {
    log.section('TEST SUMMARY');
    console.log(`Total tests: ${this.total}`);
    console.log(`${colors.green}Passed: ${this.passed}${colors.reset}`);
    console.log(`${colors.red}Failed: ${this.failed}${colors.reset}`);
    console.log(`Success rate: ${((this.passed / this.total) * 100).toFixed(1)}%`);
  }
}

const test = new TestRunner();

// Utility functions
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

const generateRandomString = (length = 8) => {
  return Math.random().toString(36).substring(2, length + 2);
};

const assertResponse = (response, expectedStatus = 200) => {
  if (response.status !== expectedStatus) {
    throw new Error(`Expected status ${expectedStatus}, got ${response.status}. Response: ${JSON.stringify(response.data)}`);
  }
  return response.data;
};

// Test functions
async function testHealthCheck() {
  const response = await makeRequest(`${BASE_URL}/health`, { noAuth: true });
  assertResponse(response);
  
  if (response.data.status !== 'OK') {
    throw new Error('Health check failed');
  }
}

async function testUserRegistration() {
  const userData = {
    email: `test1_${generateRandomString()}@example.com`,
    password: 'testpassword123',
    name: 'Test User 1',
    username: `testuser${generateRandomString(6)}`
  };

  const response = await makeRequest(`${API_URL}/auth/register`, {
    method: 'POST',
    body: userData,
    noAuth: true
  });
  
  const data = assertResponse(response, 201);
  
  if (!data.success || !data.data.token) {
    throw new Error('Registration failed - no token returned');
  }
  
  authTokens.user1 = data.data.token;
  testData.users.push({ ...userData, ...data.data.user, token: data.data.token });
}

async function testUserLogin() {
  const user = testData.users[0];
  const response = await makeRequest(`${API_URL}/auth/login`, {
    method: 'POST',
    body: {
      email: user.email,
      password: user.password
    },
    noAuth: true
  });
  
  const data = assertResponse(response);
  if (!data.success || !data.data.token) {
    throw new Error('Login failed - no token returned');
  }
}

async function testCreateSecondUser() {
  const userData = {
    email: `test2_${generateRandomString()}@example.com`,
    password: 'testpassword123',
    name: 'Test User 2',
    username: `testuser${generateRandomString(6)}`
  };

  const response = await makeRequest(`${API_URL}/auth/register`, {
    method: 'POST',
    body: userData,
    noAuth: true
  });
  
  const data = assertResponse(response, 201);
  
  authTokens.user2 = data.data.token;
  testData.users.push({ ...userData, ...data.data.user, token: data.data.token });
}

async function testCreateServer() {
  const serverData = {
    name: `Test Server ${generateRandomString()}`,
    description: 'A test server for API testing',
    icon: 'https://example.com/icon.png'
  };

  const response = await makeRequest(`${API_URL}/servers`, {
    method: 'POST',
    body: serverData
  });
  
  const data = assertResponse(response, 201);
  
  if (!data._id || !data.name) {
    throw new Error('Server creation failed - invalid response');
  }
  
  testData.servers.push(data);
}

async function testGetUserServers() {
  const response = await makeRequest(`${API_URL}/servers`);
  const data = assertResponse(response);
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Failed to get user servers');
  }
}

async function testGetServerDetails() {
  const serverId = testData.servers[0]._id;
  const response = await makeRequest(`${API_URL}/servers/${serverId}`);
  const data = assertResponse(response);
  
  if (data._id !== serverId) {
    throw new Error('Server details mismatch');
  }
}

async function testCreateChannel() {
  const serverId = testData.servers[0]._id;
  const channelData = {
    name: `test-channel-${generateRandomString()}`,
    type: 'TEXT',
    serverId,
    topic: 'Test channel for API testing'
  };

  const response = await makeRequest(`${API_URL}/channels`, {
    method: 'POST',
    body: channelData
  });
  
  const data = assertResponse(response, 201);
  
  if (!data._id || data.type !== 'TEXT') {
    throw new Error('Channel creation failed');
  }
  
  testData.channels.push(data);
}

async function testSendMessage() {
  const channelId = testData.channels[0]._id;
  const messageData = {
    content: `Test message ${generateRandomString()}`,
    attachments: [],
    embeds: []
  };

  const response = await makeRequest(`${API_URL}/channels/${channelId}/messages`, {
    method: 'POST',
    body: messageData
  });
  
  const data = assertResponse(response, 201);
  
  if (!data._id || data.content !== messageData.content) {
    throw new Error('Message sending failed');
  }
  
  testData.messages.push(data);
}

async function testGetChannelMessages() {
  const channelId = testData.channels[0]._id;
  const response = await makeRequest(`${API_URL}/channels/${channelId}/messages`);
  const data = assertResponse(response);
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Failed to get channel messages');
  }
}

async function testEditMessage() {
  const messageId = testData.messages[0]._id;
  const editData = {
    content: `Edited message ${generateRandomString()}`
  };

  const response = await makeRequest(`${API_URL}/messages/${messageId}`, {
    method: 'PUT',
    body: editData
  });
  
  const data = assertResponse(response);
  
  if (data.content !== editData.content || !data.isEdited) {
    throw new Error('Message editing failed');
  }
}

async function testAddReaction() {
  const messageId = testData.messages[0]._id;
  const reactionData = {
    emoji: { name: '👍', id: null }
  };

  const response = await makeRequest(`${API_URL}/messages/${messageId}/reactions`, {
    method: 'POST',
    body: reactionData
  });
  
  const data = assertResponse(response);
  
  if (!data.reactions || data.reactions.length === 0) {
    throw new Error('Reaction adding failed');
  }
}

async function testCreateDMChannel() {
  // Switch to second user's token
  const originalToken = authTokens.user1;
  authTokens.user1 = authTokens.user2;
  
  const dmData = {
    recipientId: testData.users[0].id
  };

  const response = await makeRequest(`${API_URL}/dms`, {
    method: 'POST',
    body: dmData
  });
  
  const data = assertResponse(response, 201);
  
  if (!data._id || data.type !== 'DM') {
    throw new Error('DM channel creation failed');
  }
  
  testData.dmChannels.push(data);
  
  // Restore original token
  authTokens.user1 = originalToken;
}

async function testSendFriendRequest() {
  const targetUser = testData.users[1];
  const requestData = {
    username: targetUser.username,
    discriminator: targetUser.discriminator
  };

  const response = await makeRequest(`${API_URL}/friends/request`, {
    method: 'POST',
    body: requestData
  });
  
  const data = assertResponse(response, 201);
  
  if (!data.friendship || data.friendship.status !== 'PENDING') {
    throw new Error('Friend request sending failed');
  }
  
  testData.friendships.push(data.friendship);
}

async function testGetFriends() {
  const response = await makeRequest(`${API_URL}/friends?type=friends`);
  const data = assertResponse(response);
  
  if (!Array.isArray(data)) {
    throw new Error('Failed to get friends list');
  }
}

// Cleanup function
async function cleanupTestData() {
  log.info('Cleaning up test data...');
  
  try {
    for (const server of testData.servers) {
      try {
        await makeRequest(`${API_URL}/servers/${server._id}`, {
          method: 'DELETE'
        });
      } catch (error) {
        log.warn(`Failed to delete server ${server._id}: ${error.message}`);
      }
    }
    
    log.success('Cleanup completed');
  } catch (error) {
    log.error(`Cleanup failed: ${error.message}`);
  }
}

// Main test execution
async function runAllTests() {
  log.section('IntelliHack Discord-like Chat Backend API Tests');
  log.info(`Testing backend at: ${BASE_URL}`);
  log.info('Make sure the backend server is running before starting tests\n');
  
  try {
    // Wait a moment for server to be ready
    await sleep(1000);
    
    // Basic tests
    await test.run('Health Check', testHealthCheck);
    
    // Authentication tests
    await test.run('User Registration', testUserRegistration);
    await test.run('User Login', testUserLogin);
    await test.run('Create Second User', testCreateSecondUser);
    
    // Server tests
    await test.run('Create Server', testCreateServer);
    await test.run('Get User Servers', testGetUserServers);
    await test.run('Get Server Details', testGetServerDetails);
    
    // Channel tests
    await test.run('Create Text Channel', testCreateChannel);
    
    // Message tests
    await test.run('Send Message', testSendMessage);
    await test.run('Get Channel Messages', testGetChannelMessages);
    await test.run('Edit Message', testEditMessage);
    await test.run('Add Reaction', testAddReaction);
    
    // Direct message tests
    await test.run('Create DM Channel', testCreateDMChannel);
    
    // Friend system tests
    await test.run('Send Friend Request', testSendFriendRequest);
    await test.run('Get Friends List', testGetFriends);
    
    // Cleanup
    await cleanupTestData();
    
  } catch (error) {
    log.error(`Test execution failed: ${error.message}`);
  } finally {
    test.summary();
  }
}

// Run tests
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch((error) => {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  });
}

export default { runAllTests };
