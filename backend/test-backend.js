#!/usr/bin/env node

/**
 * Comprehensive Test Script for IntelliHack Discord-like Chat Backend
 * Tests all API endpoints and WebSocket functionality
 */

import axios from 'axios';
import { io } from 'socket.io-client';
import chalk from 'chalk';

// Configuration
const BASE_URL = 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

// Test data
let authTokens = {};
let testData = {
  users: [],
  servers: [],
  channels: [],
  messages: [],
  dmChannels: [],
  friendships: []
};

// HTTP client with interceptors
const api = axios.create({
  baseURL: API_URL,
  timeout: 10000
});

// Add auth token to requests
api.interceptors.request.use((config) => {
  if (authTokens.user1) {
    config.headers.Authorization = `Bearer ${authTokens.user1}`;
  }
  return config;
});

// Logging utilities
const log = {
  success: (message) => console.log(chalk.green('✅'), message),
  error: (message) => console.log(chalk.red('❌'), message),
  info: (message) => console.log(chalk.blue('ℹ️'), message),
  warn: (message) => console.log(chalk.yellow('⚠️'), message),
  test: (message) => console.log(chalk.cyan('🧪'), message),
  section: (message) => console.log(chalk.magenta.bold(`\n=== ${message} ===`))
};

// Test runner
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
      console.error(error.response?.data || error.stack);
    }
  }

  summary() {
    log.section('TEST SUMMARY');
    console.log(`Total tests: ${this.total}`);
    console.log(chalk.green(`Passed: ${this.passed}`));
    console.log(chalk.red(`Failed: ${this.failed}`));
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
    throw new Error(`Expected status ${expectedStatus}, got ${response.status}`);
  }
  return response.data;
};

// Test functions
async function testHealthCheck() {
  const response = await axios.get(`${BASE_URL}/health`);
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

  const response = await api.post('/auth/register', userData);
  const data = assertResponse(response, 201);
  
  if (!data.success || !data.data.token) {
    throw new Error('Registration failed - no token returned');
  }
  
  authTokens.user1 = data.data.token;
  testData.users.push({ ...userData, ...data.data.user, token: data.data.token });
}

async function testUserLogin() {
  const user = testData.users[0];
  const response = await api.post('/auth/login', {
    email: user.email,
    password: user.password
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

  const response = await api.post('/auth/register', userData);
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

  const response = await api.post('/servers', serverData);
  const data = assertResponse(response, 201);
  
  if (!data._id || !data.name) {
    throw new Error('Server creation failed - invalid response');
  }
  
  testData.servers.push(data);
}

async function testGetUserServers() {
  const response = await api.get('/servers');
  const data = assertResponse(response);
  
  if (!Array.isArray(data) || data.length === 0) {
    throw new Error('Failed to get user servers');
  }
}

async function testGetServerDetails() {
  const serverId = testData.servers[0]._id;
  const response = await api.get(`/servers/${serverId}`);
  const data = assertResponse(response);
  
  if (data._id !== serverId) {
    throw new Error('Server details mismatch');
  }
}

async function testUpdateServer() {
  const serverId = testData.servers[0]._id;
  const updateData = {
    name: `Updated Test Server ${generateRandomString()}`,
    description: 'Updated description'
  };

  const response = await api.put(`/servers/${serverId}`, updateData);
  const data = assertResponse(response);
  
  if (data.name !== updateData.name) {
    throw new Error('Server update failed');
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

  const response = await api.post('/channels', channelData);
  const data = assertResponse(response, 201);
  
  if (!data._id || data.type !== 'TEXT') {
    throw new Error('Channel creation failed');
  }
  
  testData.channels.push(data);
}

async function testCreateVoiceChannel() {
  const serverId = testData.servers[0]._id;
  const channelData = {
    name: `voice-channel-${generateRandomString()}`,
    type: 'VOICE',
    serverId
  };

  const response = await api.post('/channels', channelData);
  const data = assertResponse(response, 201);
  
  if (!data._id || data.type !== 'VOICE') {
    throw new Error('Voice channel creation failed');
  }
  
  testData.channels.push(data);
}

async function testGetChannelDetails() {
  const channelId = testData.channels[0]._id;
  const response = await api.get(`/channels/${channelId}`);
  const data = assertResponse(response);
  
  if (data._id !== channelId) {
    throw new Error('Channel details mismatch');
  }
}

async function testSendMessage() {
  const channelId = testData.channels[0]._id;
  const messageData = {
    content: `Test message ${generateRandomString()}`,
    attachments: [],
    embeds: []
  };

  const response = await api.post(`/channels/${channelId}/messages`, messageData);
  const data = assertResponse(response, 201);
  
  if (!data._id || data.content !== messageData.content) {
    throw new Error('Message sending failed');
  }
  
  testData.messages.push(data);
}

async function testGetChannelMessages() {
  const channelId = testData.channels[0]._id;
  const response = await api.get(`/channels/${channelId}/messages`);
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

  const response = await api.put(`/messages/${messageId}`, editData);
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

  const response = await api.post(`/messages/${messageId}/reactions`, reactionData);
  const data = assertResponse(response);
  
  if (!data.reactions || data.reactions.length === 0) {
    throw new Error('Reaction adding failed');
  }
}

async function testPinMessage() {
  const messageId = testData.messages[0]._id;
  const response = await api.post(`/messages/${messageId}/pin`);
  const data = assertResponse(response);
  
  if (!data.isPinned) {
    throw new Error('Message pinning failed');
  }
}

async function testCreateDMChannel() {
  // Switch to second user's token
  const originalToken = authTokens.user1;
  authTokens.user1 = authTokens.user2;
  
  const dmData = {
    recipientId: testData.users[0].id
  };

  const response = await api.post('/dms', dmData);
  const data = assertResponse(response, 201);
  
  if (!data._id || data.type !== 'DM') {
    throw new Error('DM channel creation failed');
  }
  
  testData.dmChannels.push(data);
  
  // Restore original token
  authTokens.user1 = originalToken;
}

async function testSendDMMessage() {
  const dmChannelId = testData.dmChannels[0]._id;
  const messageData = {
    content: `DM test message ${generateRandomString()}`
  };

  const response = await api.post(`/dms/${dmChannelId}/messages`, messageData);
  const data = assertResponse(response, 201);
  
  if (!data._id || data.content !== messageData.content) {
    throw new Error('DM message sending failed');
  }
}

async function testGetDMChannels() {
  const response = await api.get('/dms');
  const data = assertResponse(response);
  
  if (!Array.isArray(data)) {
    throw new Error('Failed to get DM channels');
  }
}

async function testSendFriendRequest() {
  const targetUser = testData.users[1];
  const requestData = {
    username: targetUser.username,
    discriminator: targetUser.discriminator
  };

  const response = await api.post('/friends/request', requestData);
  const data = assertResponse(response, 201);
  
  if (!data.friendship || data.friendship.status !== 'PENDING') {
    throw new Error('Friend request sending failed');
  }
  
  testData.friendships.push(data.friendship);
}

async function testAcceptFriendRequest() {
  // Switch to second user's token to accept the request
  const originalToken = authTokens.user1;
  authTokens.user1 = authTokens.user2;
  
  const friendshipId = testData.friendships[0]._id;
  const response = await api.put(`/friends/${friendshipId}/accept`);
  const data = assertResponse(response);
  
  if (data.friendship.status !== 'ACCEPTED') {
    throw new Error('Friend request acceptance failed');
  }
  
  // Restore original token
  authTokens.user1 = originalToken;
}

async function testGetFriends() {
  const response = await api.get('/friends?type=friends');
  const data = assertResponse(response);
  
  if (!Array.isArray(data)) {
    throw new Error('Failed to get friends list');
  }
}

async function testSearchUsers() {
  const response = await api.get('/friends/search?query=test');
  const data = assertResponse(response);
  
  if (!Array.isArray(data)) {
    throw new Error('User search failed');
  }
}

async function testJoinVoiceChannel() {
  const voiceChannelId = testData.channels.find(c => c.type === 'VOICE')?._id;
  if (!voiceChannelId) {
    throw new Error('No voice channel available for testing');
  }

  const response = await api.post(`/channels/${voiceChannelId}/voice/join`);
  assertResponse(response);
}

async function testLeaveVoiceChannel() {
  const voiceChannelId = testData.channels.find(c => c.type === 'VOICE')?._id;
  if (!voiceChannelId) {
    throw new Error('No voice channel available for testing');
  }

  const response = await api.post(`/channels/${voiceChannelId}/voice/leave`);
  assertResponse(response);
}

async function testTypingIndicator() {
  const channelId = testData.channels[0]._id;
  const response = await api.post(`/channels/${channelId}/typing`);
  assertResponse(response);
}

async function testMessageSearch() {
  const response = await api.get('/messages/search?query=test&limit=10');
  const data = assertResponse(response);
  
  if (!data.messages || !Array.isArray(data.messages)) {
    throw new Error('Message search failed');
  }
}

async function testCreateInvite() {
  const serverId = testData.servers[0]._id;
  const response = await api.post(`/servers/${serverId}/invites`, {
    maxUses: 10,
    expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
  });
  
  const data = assertResponse(response, 201);
  if (!data.code) {
    throw new Error('Invite creation failed');
  }
}

async function testWebSocketConnection() {
  return new Promise((resolve, reject) => {
    const socket = io(BASE_URL, {
      auth: {
        token: authTokens.user1
      }
    });

    const timeout = setTimeout(() => {
      socket.disconnect();
      reject(new Error('WebSocket connection timeout'));
    }, 5000);

    socket.on('connect', () => {
      clearTimeout(timeout);
      socket.disconnect();
      resolve();
    });

    socket.on('connect_error', (error) => {
      clearTimeout(timeout);
      reject(new Error(`WebSocket connection failed: ${error.message}`));
    });
  });
}

// Cleanup functions
async function cleanupTestData() {
  log.info('Cleaning up test data...');
  
  try {
    // Delete servers (this will cascade delete channels and messages)
    for (const server of testData.servers) {
      try {
        await api.delete(`/servers/${server._id}`);
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
  
  try {
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
    await test.run('Update Server', testUpdateServer);
    await test.run('Create Invite', testCreateInvite);
    
    // Channel tests
    await test.run('Create Text Channel', testCreateChannel);
    await test.run('Create Voice Channel', testCreateVoiceChannel);
    await test.run('Get Channel Details', testGetChannelDetails);
    
    // Voice channel tests
    await test.run('Join Voice Channel', testJoinVoiceChannel);
    await test.run('Leave Voice Channel', testLeaveVoiceChannel);
    
    // Message tests
    await test.run('Send Message', testSendMessage);
    await test.run('Get Channel Messages', testGetChannelMessages);
    await test.run('Edit Message', testEditMessage);
    await test.run('Add Reaction', testAddReaction);
    await test.run('Pin Message', testPinMessage);
    await test.run('Typing Indicator', testTypingIndicator);
    await test.run('Message Search', testMessageSearch);
    
    // Direct message tests
    await test.run('Create DM Channel', testCreateDMChannel);
    await test.run('Send DM Message', testSendDMMessage);
    await test.run('Get DM Channels', testGetDMChannels);
    
    // Friend system tests
    await test.run('Send Friend Request', testSendFriendRequest);
    await test.run('Accept Friend Request', testAcceptFriendRequest);
    await test.run('Get Friends List', testGetFriends);
    await test.run('Search Users', testSearchUsers);
    
    // WebSocket tests
    await test.run('WebSocket Connection', testWebSocketConnection);
    
    // Cleanup
    await cleanupTestData();
    
  } catch (error) {
    log.error(`Test execution failed: ${error.message}`);
  } finally {
    test.summary();
  }
}

// Error handling
process.on('unhandledRejection', (error) => {
  log.error(`Unhandled rejection: ${error.message}`);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  log.error(`Uncaught exception: ${error.message}`);
  process.exit(1);
});

// Run tests if this script is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch((error) => {
    log.error(`Test suite failed: ${error.message}`);
    process.exit(1);
  });
}

export default {
  runAllTests,
  testRunner: test,
  testData,
  authTokens
};
