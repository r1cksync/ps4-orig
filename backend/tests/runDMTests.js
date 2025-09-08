#!/usr/bin/env node
/**
 * Simple DM System Test Runner
 * Tests DM REST API endpoints and basic Socket.IO functionality
 * 
 * Usage: node runDMTests.js
 */

import http from 'http';
import https from 'https';
import { URL } from 'url';

// Simple HTTP client without external dependencies
class SimpleHTTPClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
    this.headers = {};
  }

  setAuth(token) {
    this.headers['Authorization'] = `Bearer ${token}`;
  }

  async request(method, path, data = null) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseURL);
      const isHttps = url.protocol === 'https:';
      const httpModule = isHttps ? https : http;

      const options = {
        hostname: url.hostname,
        port: url.port || (isHttps ? 443 : 80),
        path: url.pathname + url.search,
        method: method.toUpperCase(),
        headers: {
          'Content-Type': 'application/json',
          ...this.headers
        }
      };

      const req = httpModule.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = {
              status: res.statusCode,
              data: body ? JSON.parse(body) : null,
              headers: res.headers
            };
            
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              const error = new Error(`HTTP ${res.statusCode}: ${res.statusMessage}`);
              error.response = response;
              reject(error);
            }
          } catch (parseError) {
            reject(parseError);
          }
        });
      });

      req.on('error', reject);

      if (data) {
        req.write(JSON.stringify(data));
      }

      req.end();
    });
  }

  async get(path) {
    const response = await this.request('GET', path);
    return response.data;
  }

  async post(path, data) {
    const response = await this.request('POST', path, data);
    return response.data;
  }

  async put(path, data) {
    const response = await this.request('PUT', path, data);
    return response.data;
  }

  async delete(path) {
    const response = await this.request('DELETE', path);
    return response.data;
  }

  async patch(path, data) {
    const response = await this.request('PATCH', path, data);
    return response.data;
  }
}

// Simple test framework
class TestRunner {
  constructor() {
    this.passed = 0;
    this.failed = 0;
    this.total = 0;
    this.startTime = Date.now();
  }

  async test(description, testFn) {
    this.total++;
    try {
      const result = await testFn();
      if (result !== false) {
        this.passed++;
        console.log(`✅ ${description}`);
        return true;
      } else {
        this.failed++;
        console.log(`❌ ${description}`);
        return false;
      }
    } catch (error) {
      this.failed++;
      console.log(`❌ ${description} - ${error.message}`);
      return false;
    }
  }

  assert(condition, message) {
    if (!condition) {
      throw new Error(message || 'Assertion failed');
    }
    return true;
  }

  report() {
    const duration = Date.now() - this.startTime;
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.total}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / this.total) * 100).toFixed(1)}%`);
    console.log(`Duration: ${duration}ms`);
    console.log('='.repeat(60));
    
    if (this.failed === 0) {
      console.log('🎉 All tests passed!');
    } else {
      console.log(`⚠️  ${this.failed} test(s) failed`);
    }
  }
}

// Main test suite
class DMTestSuite {
  constructor() {
    this.runner = new TestRunner();
    this.client = new SimpleHTTPClient('http://localhost:3001');
    this.testData = {
      users: [],
      tokens: [],
      dmChannels: [],
      messages: []
    };
  }

  async setup() {
    console.log('🚀 Setting up DM test environment...\n');
    
    // Create test users
    const users = [
      { username: 'alice_test_dm', email: 'alice.dm.test@example.com', password: 'testpass123' },
      { username: 'bob_test_dm', email: 'bob.dm.test@example.com', password: 'testpass123' }
    ];

    for (const user of users) {
      await this.runner.test(`Create/login user: ${user.username}`, async () => {
        try {
          // Try to register
          let response;
          try {
            response = await this.client.post('/api/auth/register', user);
          } catch (error) {
            if (error.response?.status === 400) {
              // User might exist, try login
              response = await this.client.post('/api/auth/login', {
                email: user.email,
                password: user.password
              });
            } else {
              throw error;
            }
          }

          this.runner.assert(response.success, 'Registration/login successful');
          this.runner.assert(response.data.token, 'Received authentication token');
          
          this.testData.users.push(response.data.user);
          this.testData.tokens.push(response.data.token);
          
          return true;
        } catch (error) {
          console.error(`User creation failed: ${error.message}`);
          return false;
        }
      });
    }

    // Setup friendship
    if (this.testData.tokens.length >= 2) {
      await this.runner.test('Setup friendship between users', async () => {
        try {
          // Alice sends friend request to Bob
          this.client.setAuth(this.testData.tokens[0]);
          await this.client.post('/api/friends/request', {
            recipientId: this.testData.users[1]._id
          });

          // Bob accepts friend request
          this.client.setAuth(this.testData.tokens[1]);
          await this.client.post('/api/friends/accept', {
            requesterId: this.testData.users[0]._id
          });

          return true;
        } catch (error) {
          console.error(`Friendship setup failed: ${error.message}`);
          return false;
        }
      });
    }
  }

  async testDMChannelCreation() {
    console.log('\n📞 Testing DM Channel Creation...');
    
    await this.runner.test('Create DM channel between friends', async () => {
      this.client.setAuth(this.testData.tokens[0]); // Alice
      
      const response = await this.client.post('/api/dms', {
        recipientId: this.testData.users[1]._id // Bob
      });

      this.runner.assert(response.success, 'DM creation returned success');
      this.runner.assert(response.data.type === 'DM', 'Created DM has correct type');
      this.runner.assert(response.data.participants.length === 2, 'DM has 2 participants');
      
      this.testData.dmChannels.push(response.data);
      return true;
    });
  }

  async testGetDMChannels() {
    console.log('\n📋 Testing Get DM Channels...');
    
    await this.runner.test('Retrieve DM channels list', async () => {
      this.client.setAuth(this.testData.tokens[0]); // Alice
      
      const response = await this.client.get('/api/dms');
      
      this.runner.assert(response.success, 'DM list retrieval returned success');
      this.runner.assert(Array.isArray(response.data), 'Response data is an array');
      this.runner.assert(response.data.length > 0, 'Alice has at least one DM channel');
      
      return true;
    });
  }

  async testMessageSending() {
    console.log('\n💬 Testing Message Sending...');
    
    if (this.testData.dmChannels.length === 0) {
      console.log('❌ No DM channels available for message test');
      return;
    }

    await this.runner.test('Send message in DM channel', async () => {
      this.client.setAuth(this.testData.tokens[0]); // Alice
      const channelId = this.testData.dmChannels[0]._id;
      
      const response = await this.client.post(`/api/dms/${channelId}/messages`, {
        content: 'Hello Bob! This is a test message from the automated test suite.',
        nonce: 'test-message-001'
      });

      this.runner.assert(response.success, 'Message sending returned success');
      this.runner.assert(response.data.content.includes('Hello Bob'), 'Message has correct content');
      this.runner.assert(response.data.author._id === this.testData.users[0]._id, 'Message has correct author');
      
      this.testData.messages.push(response.data);
      return true;
    });
  }

  async testMessageRetrieval() {
    console.log('\n📨 Testing Message Retrieval...');
    
    if (this.testData.dmChannels.length === 0) {
      console.log('❌ No DM channels available for message retrieval test');
      return;
    }

    await this.runner.test('Retrieve messages from DM channel', async () => {
      this.client.setAuth(this.testData.tokens[1]); // Bob
      const channelId = this.testData.dmChannels[0]._id;
      
      const response = await this.client.get(`/api/dms/${channelId}/messages?limit=10`);
      
      this.runner.assert(response.success, 'Message retrieval returned success');
      this.runner.assert(Array.isArray(response.data), 'Messages response is an array');
      this.runner.assert(response.data.length > 0, 'Channel has at least one message');
      
      return true;
    });
  }

  async testMessageEditing() {
    console.log('\n✏️ Testing Message Editing...');
    
    if (this.testData.messages.length === 0) {
      console.log('❌ No messages available for editing test');
      return;
    }

    await this.runner.test('Edit existing message', async () => {
      this.client.setAuth(this.testData.tokens[0]); // Alice (original author)
      const channelId = this.testData.dmChannels[0]._id;
      const messageId = this.testData.messages[0]._id;
      
      const response = await this.client.put(`/api/dms/${channelId}/messages/${messageId}`, {
        content: 'Hello Bob! This message has been EDITED by the test suite.'
      });

      this.runner.assert(response.success, 'Message editing returned success');
      this.runner.assert(response.data.content.includes('EDITED'), 'Message content was updated');
      this.runner.assert(response.data.editedAt !== null, 'Message has editedAt timestamp');
      
      return true;
    });
  }

  async testMessageReactions() {
    console.log('\n😀 Testing Message Reactions...');
    
    if (this.testData.messages.length === 0) {
      console.log('❌ No messages available for reaction test');
      return;
    }

    await this.runner.test('Add reaction to message', async () => {
      this.client.setAuth(this.testData.tokens[1]); // Bob reacting to Alice's message
      const channelId = this.testData.dmChannels[0]._id;
      const messageId = this.testData.messages[0]._id;
      
      const response = await this.client.post(`/api/dms/${channelId}/messages/${messageId}/reactions/👍`);

      this.runner.assert(response.success, 'Reaction addition returned success');
      this.runner.assert(response.data.reactions && response.data.reactions.length > 0, 'Message has reactions');
      
      return true;
    });
  }

  async testReadReceipts() {
    console.log('\n👁️ Testing Read Receipts...');
    
    if (this.testData.dmChannels.length === 0) {
      console.log('❌ No DM channels available for read receipt test');
      return;
    }

    await this.runner.test('Mark messages as read', async () => {
      this.client.setAuth(this.testData.tokens[1]); // Bob
      const channelId = this.testData.dmChannels[0]._id;
      
      const response = await this.client.post(`/api/dms/${channelId}/read`, {
        messageId: this.testData.messages[0]?._id
      });

      this.runner.assert(response.success, 'Mark as read returned success');
      
      return true;
    });
  }

  async testGroupDMCreation() {
    console.log('\n👥 Testing Group DM Creation...');
    
    if (this.testData.users.length < 2) {
      console.log('❌ Not enough users for group DM test');
      return;
    }

    await this.runner.test('Create group DM', async () => {
      this.client.setAuth(this.testData.tokens[0]); // Alice
      
      const response = await this.client.post('/api/dms/group', {
        participantIds: [this.testData.users[1]._id],
        name: 'Test Group Chat'
      });

      this.runner.assert(response.success, 'Group DM creation returned success');
      this.runner.assert(response.data.type === 'GROUP_DM', 'Created group DM has correct type');
      this.runner.assert(response.data.name === 'Test Group Chat', 'Group DM has correct name');
      this.runner.assert(response.data.owner === this.testData.users[0]._id, 'Group DM has correct owner');
      
      this.testData.dmChannels.push(response.data);
      return true;
    });
  }

  async testErrorHandling() {
    console.log('\n🚨 Testing Error Handling...');
    
    await this.runner.test('Handle invalid channel ID', async () => {
      this.client.setAuth(this.testData.tokens[0]);
      
      try {
        await this.client.post('/api/dms/invalid-id/messages', {
          content: 'This should fail'
        });
        return false; // Should not reach here
      } catch (error) {
        this.runner.assert(error.response?.status === 400, 'Correctly rejected invalid channel ID');
        return true;
      }
    });

    await this.runner.test('Handle unauthorized access', async () => {
      const unauthorizedClient = new SimpleHTTPClient('http://localhost:5000');
      // Don't set auth token
      
      try {
        await unauthorizedClient.get('/api/dms');
        return false; // Should not reach here
      } catch (error) {
        this.runner.assert(error.response?.status === 401, 'Correctly rejected unauthorized access');
        return true;
      }
    });

    await this.runner.test('Handle empty message content', async () => {
      this.client.setAuth(this.testData.tokens[0]);
      
      if (this.testData.dmChannels.length === 0) {
        console.log('⚠️  Skipping empty message test - no DM channels');
        return true;
      }

      try {
        await this.client.post(`/api/dms/${this.testData.dmChannels[0]._id}/messages`, {
          content: ''
        });
        return false; // Should not reach here
      } catch (error) {
        this.runner.assert(error.response?.status === 400, 'Correctly rejected empty message');
        return true;
      }
    });
  }

  async run() {
    console.log('🎯 Starting DM System API Tests'.toUpperCase());
    console.log('Testing REST API endpoints for Direct Messages');
    console.log('='.repeat(60));
    
    // Debug: Force console output
    process.stdout.write('Debug: Test runner starting...\n');
    
    try {
      await this.setup();
      await this.testDMChannelCreation();
      await this.testGetDMChannels();
      await this.testMessageSending();
      await this.testMessageRetrieval();
      await this.testMessageEditing();
      await this.testMessageReactions();
      await this.testReadReceipts();
      await this.testGroupDMCreation();
      await this.testErrorHandling();
    } catch (error) {
      console.error(`\n💥 Test suite encountered an error: ${error.message}`);
    } finally {
      this.runner.report();
    }
  }
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new DMTestSuite();
  testSuite.run().catch(console.error);
}

export default DMTestSuite;
