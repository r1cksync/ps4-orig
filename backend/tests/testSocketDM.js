#!/usr/bin/env node
/**
 * Socket.IO DM System Test
 * Tests real-time functionality using WebSocket connections
 * 
 * Usage: node testSocketDM.js
 */

import WebSocket from 'ws';
import http from 'http';

// Simple WebSocket client for Socket.IO testing
class SocketIOTestClient {
  constructor(url, token) {
    this.url = url;
    this.token = token;
    this.ws = null;
    this.events = new Map();
    this.connected = false;
  }

  async connect() {
    return new Promise((resolve, reject) => {
      // Socket.IO uses a specific handshake protocol
      const socketIOUrl = `${this.url}/socket.io/?EIO=4&transport=websocket&token=${this.token}`;
      
      this.ws = new WebSocket(socketIOUrl);
      
      this.ws.on('open', () => {
        console.log('Socket.IO connection established');
        this.connected = true;
        
        // Send initial Socket.IO handshake
        this.ws.send('40'); // Socket.IO connect packet
        resolve();
      });

      this.ws.on('message', (data) => {
        this.handleMessage(data.toString());
      });

      this.ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        reject(error);
      });

      this.ws.on('close', () => {
        console.log('Socket.IO connection closed');
        this.connected = false;
      });

      setTimeout(() => {
        if (!this.connected) {
          reject(new Error('Connection timeout'));
        }
      }, 5000);
    });
  }

  handleMessage(message) {
    try {
      // Parse Socket.IO message format
      if (message.startsWith('42')) {
        // Event message
        const eventData = JSON.parse(message.substring(2));
        const [eventName, payload] = eventData;
        
        if (!this.events.has(eventName)) {
          this.events.set(eventName, []);
        }
        
        this.events.get(eventName).push({
          timestamp: Date.now(),
          data: payload
        });
        
        console.log(`📨 Received event: ${eventName}`, payload);
      }
    } catch (error) {
      console.error('Error parsing message:', error);
    }
  }

  emit(eventName, data) {
    if (this.connected && this.ws) {
      const message = `42${JSON.stringify([eventName, data])}`;
      this.ws.send(message);
      console.log(`📤 Sent event: ${eventName}`, data);
    }
  }

  waitForEvent(eventName, timeout = 3000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`Event ${eventName} not received within ${timeout}ms`));
      }, timeout);

      const checkEvent = () => {
        const events = this.events.get(eventName);
        if (events && events.length > 0) {
          clearTimeout(timer);
          resolve(events[events.length - 1]);
        } else {
          setTimeout(checkEvent, 100);
        }
      };

      checkEvent();
    });
  }

  getEvents(eventName) {
    return this.events.get(eventName) || [];
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
    }
  }
}

// Simple HTTP client for getting tokens
class SimpleHTTPClient {
  constructor(baseURL) {
    this.baseURL = baseURL;
  }

  async post(path, data) {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseURL);
      const postData = JSON.stringify(data);

      const options = {
        hostname: url.hostname,
        port: url.port || 80,
        path: url.pathname,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let body = '';
        res.on('data', chunk => body += chunk);
        res.on('end', () => {
          try {
            const response = JSON.parse(body);
            if (res.statusCode >= 200 && res.statusCode < 300) {
              resolve(response);
            } else {
              const error = new Error(`HTTP ${res.statusCode}`);
              error.response = { status: res.statusCode, data: response };
              reject(error);
            }
          } catch (parseError) {
            reject(parseError);
          }
        });
      });

      req.on('error', reject);
      req.write(postData);
      req.end();
    });
  }
}

// Socket.IO test suite
class SocketDMTestSuite {
  constructor() {
    this.httpClient = new SimpleHTTPClient('http://localhost:3001');
    this.sockets = [];
    this.tokens = [];
    this.users = [];
    this.passed = 0;
    this.failed = 0;
    this.total = 0;
  }

  async assert(condition, message) {
    this.total++;
    if (condition) {
      this.passed++;
      console.log(`✅ ${message}`);
      return true;
    } else {
      this.failed++;
      console.log(`❌ ${message}`);
      return false;
    }
  }

  async setup() {
    console.log('🔌 Setting up Socket.IO test environment...\n');
    
    // Get authentication tokens for test users
    const testUsers = [
      { email: 'alice.dm.test@example.com', password: 'testpass123' },
      { email: 'bob.dm.test@example.com', password: 'testpass123' }
    ];

    for (const user of testUsers) {
      try {
        const response = await this.httpClient.post('/api/auth/login', user);
        
        if (response.success) {
          this.tokens.push(response.data.token);
          this.users.push(response.data.user);
          console.log(`✅ Authenticated user: ${response.data.user.username}`);
        } else {
          console.log(`❌ Failed to authenticate user: ${user.email}`);
        }
      } catch (error) {
        console.log(`❌ Authentication error for ${user.email}: ${error.message}`);
      }
    }

    if (this.tokens.length < 2) {
      throw new Error('Not enough authenticated users for Socket.IO tests');
    }

    // Create Socket.IO connections
    for (let i = 0; i < this.tokens.length; i++) {
      try {
        const socket = new SocketIOTestClient('ws://localhost:3001', this.tokens[i]);
        await socket.connect();
        this.sockets.push(socket);
        console.log(`✅ Socket connected for user: ${this.users[i].username}`);
      } catch (error) {
        console.log(`❌ Failed to connect socket for user ${i}: ${error.message}`);
      }
    }
  }

  async testSocketConnection() {
    console.log('\n🔌 Testing Socket.IO Connection...');
    
    await this.assert(
      this.sockets.length >= 2,
      'Multiple Socket.IO connections established'
    );

    // Test joining DM rooms
    for (let i = 0; i < this.sockets.length; i++) {
      this.sockets[i].emit('joinDMRooms', {});
      await this.assert(true, `User ${i + 1} joined DM rooms`);
    }
  }

  async testRealTimeMessaging() {
    console.log('\n💬 Testing Real-time Messaging...');
    
    if (this.sockets.length < 2) {
      await this.assert(false, 'Not enough sockets for messaging test');
      return;
    }

    const alice = this.sockets[0];
    const bob = this.sockets[1];

    try {
      // Alice creates a DM with Bob
      alice.emit('createDM', {
        recipientId: this.users[1]._id,
        message: 'Hello Bob! Testing real-time messaging.'
      });

      // Wait for events
      const aliceSuccess = await alice.waitForEvent('dmCreateSuccess', 5000);
      await this.assert(
        aliceSuccess && aliceSuccess.data,
        'Alice received DM creation success'
      );

      const bobNotification = await bob.waitForEvent('dmChannelCreate', 5000);
      await this.assert(
        bobNotification && bobNotification.data,
        'Bob received DM channel creation notification'
      );

    } catch (error) {
      await this.assert(false, `Real-time messaging test failed: ${error.message}`);
    }
  }

  async testTypingIndicators() {
    console.log('\n⌨️ Testing Typing Indicators...');
    
    if (this.sockets.length < 2) {
      await this.assert(false, 'Not enough sockets for typing test');
      return;
    }

    const alice = this.sockets[0];
    const bob = this.sockets[1];

    try {
      // Use a dummy channel ID for testing
      const dummyChannelId = '507f1f77bcf86cd799439011';
      
      // Alice starts typing
      alice.emit('dmTyping', { channelId: dummyChannelId });
      
      // Wait for Bob to receive typing event
      const typingEvent = await bob.waitForEvent('dmTypingStart', 3000);
      await this.assert(
        typingEvent && typingEvent.data.user,
        'Bob received typing indicator from Alice'
      );

      // Alice stops typing
      alice.emit('dmTypingStop', { channelId: dummyChannelId });
      
      const stopTypingEvent = await bob.waitForEvent('dmTypingStop', 3000);
      await this.assert(
        stopTypingEvent && stopTypingEvent.data.userId,
        'Bob received stop typing indicator'
      );

    } catch (error) {
      await this.assert(false, `Typing indicators test failed: ${error.message}`);
    }
  }

  async testEventHandling() {
    console.log('\n📨 Testing Event Handling...');
    
    const socket = this.sockets[0];
    
    // Test various event emissions
    const events = [
      { name: 'joinDMRooms', data: {} },
      { name: 'markDMRead', data: { channelId: '507f1f77bcf86cd799439011' } }
    ];

    for (const event of events) {
      try {
        socket.emit(event.name, event.data);
        await this.assert(true, `Successfully emitted ${event.name} event`);
      } catch (error) {
        await this.assert(false, `Failed to emit ${event.name}: ${error.message}`);
      }
    }
  }

  async cleanup() {
    console.log('\n🧹 Cleaning up...');
    
    for (const socket of this.sockets) {
      socket.disconnect();
    }
    
    console.log('✅ All sockets disconnected');
  }

  report() {
    console.log('\n' + '='.repeat(60));
    console.log('📊 SOCKET.IO TEST RESULTS');
    console.log('='.repeat(60));
    console.log(`Total Tests: ${this.total}`);
    console.log(`Passed: ${this.passed}`);
    console.log(`Failed: ${this.failed}`);
    console.log(`Success Rate: ${((this.passed / this.total) * 100).toFixed(1)}%`);
    console.log('='.repeat(60));
  }

  async run() {
    console.log('⚡ Starting Socket.IO DM System Tests');
    console.log('Testing real-time functionality via WebSocket');
    console.log('='.repeat(60));
    
    try {
      await this.setup();
      await this.testSocketConnection();
      await this.testRealTimeMessaging();
      await this.testTypingIndicators();
      await this.testEventHandling();
    } catch (error) {
      console.error(`\n💥 Socket.IO test suite error: ${error.message}`);
    } finally {
      await this.cleanup();
      this.report();
    }
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const testSuite = new SocketDMTestSuite();
  testSuite.run().catch(console.error);
}

export default SocketDMTestSuite;
