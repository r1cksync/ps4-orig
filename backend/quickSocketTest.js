import { io } from 'socket.io-client';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';

async function quickSocketTest() {
  console.log('🔌 Quick Socket.IO Connection Test');
  
  try {
    // Get auth token
    const loginResponse = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'realtime@test.com',
        password: 'TestPassword123!'
      })
    });
    
    if (!loginResponse.ok) {
      console.log('❌ Login failed, creating test user...');
      await fetch(`${BASE_URL}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: 'realtimetest',
          email: 'realtime@test.com',
          password: 'TestPassword123!'
        })
      });
      
      const retryLogin = await fetch(`${BASE_URL}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'realtime@test.com',
          password: 'TestPassword123!'
        })
      });
      
      const loginData = await retryLogin.json();
      var authToken = loginData.token;
    } else {
      const loginData = await loginResponse.json();
      var authToken = loginData.token;
    }
    
    console.log('✅ Authentication successful');
    
    // Test Socket.IO connection
    const socket = io(BASE_URL, {
      auth: { token: authToken },
      query: { token: authToken },
      extraHeaders: {
        'Authorization': `Bearer ${authToken}`
      },
      timeout: 5000
    });
    
    socket.on('connect', () => {
      console.log('✅ Socket.IO connected successfully!');
      console.log('Socket ID:', socket.id);
      
      // Test basic event
      socket.emit('test', { message: 'Hello from test!' });
      
      setTimeout(() => {
        socket.disconnect();
        console.log('✅ Test completed successfully');
        process.exit(0);
      }, 2000);
    });
    
    socket.on('connect_error', (error) => {
      console.error('❌ Socket.IO connection failed:', error.message);
      process.exit(1);
    });
    
    socket.on('error', (error) => {
      console.error('❌ Socket.IO error:', error);
    });
    
    // Timeout after 10 seconds
    setTimeout(() => {
      console.error('❌ Connection timeout after 10 seconds');
      socket.disconnect();
      process.exit(1);
    }, 10000);
    
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

quickSocketTest();
