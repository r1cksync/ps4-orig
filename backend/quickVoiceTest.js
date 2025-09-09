import fetch from 'node-fetch';
import { io } from 'socket.io-client';

// Test configuration
const BASE_URL = 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

// Use existing users or create new ones
const TEST_USERS = [
  {
    email: 'john@example.com',
    password: 'password123',
    username: 'john'
  },
  {
    email: 'jane@example.com', 
    password: 'password123',
    username: 'jane'
  }
];

let authTokens = {};
let sockets = {};
let testData = {
  server: null,
  voiceChannel: null,
  dmChannel: null,
  calls: []
};

// Helper function to make authenticated requests
const authenticatedRequest = async (url, options = {}, token) => {
  const response = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });
  return response;
};

// Try to authenticate or create users
const setupUsers = async () => {
  console.log('\n🔐 Setting up test users...');
  
  for (const user of TEST_USERS) {
    try {
      // Try to login first
      let response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.password
        })
      });

      if (!response.ok) {
        // If login fails, try to register
        console.log(`Login failed for ${user.username}, trying to register...`);
        response = await fetch(`${API_URL}/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            username: user.username,
            email: user.email,
            password: user.password,
            displayName: user.username
          })
        });

        if (response.ok) {
          console.log(`✅ ${user.username} registered successfully`);
          // Now try to login
          response = await fetch(`${API_URL}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: user.email,
              password: user.password
            })
          });
        }
      }

      if (response.ok) {
        const data = await response.json();
        authTokens[user.username] = data.token;
        console.log(`✅ ${user.username} authenticated`);
      } else {
        const error = await response.json();
        console.log(`❌ Failed to authenticate ${user.username}:`, error);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error with ${user.username}:`, error.message);
      return false;
    }
  }
  return true;
};

// Quick test for voice channel functionality
const testVoiceChannelBasics = async () => {
  console.log('\n📡 Testing voice channel basics...');
  
  try {
    // Create server
    const serverResponse = await authenticatedRequest(`${API_URL}/servers`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Voice Test Server',
        description: 'Testing voice calls'
      })
    }, authTokens.john);

    if (!serverResponse.ok) {
      console.log('❌ Failed to create server');
      return false;
    }

    const serverData = await serverResponse.json();
    testData.server = serverData.server;
    console.log(`✅ Server created: ${testData.server.name}`);

    // Create voice channel
    const channelResponse = await authenticatedRequest(`${API_URL}/channels`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'General Voice',
        type: 'VOICE',
        serverId: testData.server._id
      })
    }, authTokens.john);

    if (!channelResponse.ok) {
      console.log('❌ Failed to create voice channel');
      return false;
    }

    const channelData = await channelResponse.json();
    testData.voiceChannel = channelData.channel;
    console.log(`✅ Voice channel created: ${testData.voiceChannel.name}`);

    // Start a call
    const callResponse = await authenticatedRequest(
      `${API_URL}/calls/voice-channel/${testData.voiceChannel._id}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ hasVideo: false })
      },
      authTokens.john
    );

    if (callResponse.ok) {
      const callData = await callResponse.json();
      console.log(`✅ Voice call started successfully`);
      console.log(`🔑 Room ID: ${callData.roomId}`);
      
      // Join call with second user
      const joinResponse = await authenticatedRequest(
        `${API_URL}/calls/voice-channel/${testData.voiceChannel._id}/join`,
        {
          method: 'POST',
          body: JSON.stringify({ hasVideo: true })
        },
        authTokens.jane
      );

      if (joinResponse.ok) {
        const joinData = await joinResponse.json();
        console.log(`✅ Second user joined with video`);
        console.log(`👥 Active participants: ${joinData.call.activeParticipants.length}`);
        return true;
      }
    }

    console.log('❌ Voice call functionality failed');
    return false;
  } catch (error) {
    console.error('❌ Error testing voice channels:', error.message);
    return false;
  }
};

// Test DM calls
const testDMCallBasics = async () => {
  console.log('\n💬 Testing DM call basics...');
  
  try {
    // Create DM channel
    const dmResponse = await authenticatedRequest(`${API_URL}/dms`, {
      method: 'POST',
      body: JSON.stringify({
        participants: ['jane']
      })
    }, authTokens.john);

    if (!dmResponse.ok) {
      console.log('❌ Failed to create DM channel');
      return false;
    }

    const dmData = await dmResponse.json();
    testData.dmChannel = dmData.dmChannel;
    console.log(`✅ DM channel created`);

    // Start DM call
    const callResponse = await authenticatedRequest(
      `${API_URL}/calls/dm/${testData.dmChannel._id}/start`,
      {
        method: 'POST',
        body: JSON.stringify({ hasVideo: true })
      },
      authTokens.john
    );

    if (callResponse.ok) {
      const callData = await callResponse.json();
      console.log(`✅ DM call started with video`);
      
      // Join DM call
      const joinResponse = await authenticatedRequest(
        `${API_URL}/calls/dm/${testData.dmChannel._id}/join`,
        {
          method: 'POST',
          body: JSON.stringify({ hasVideo: true })
        },
        authTokens.jane
      );

      if (joinResponse.ok) {
        console.log(`✅ Second user joined DM call`);
        return true;
      }
    }

    console.log('❌ DM call functionality failed');
    return false;
  } catch (error) {
    console.error('❌ Error testing DM calls:', error.message);
    return false;
  }
};

// Test voice state updates
const testVoiceStateUpdates = async () => {
  console.log('\n🔇 Testing voice state updates...');
  
  try {
    const response = await authenticatedRequest(
      `${API_URL}/calls/voice-state`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          isSelfMuted: true,
          hasVideo: false,
          isScreenSharing: false
        })
      },
      authTokens.john
    );

    if (response.ok) {
      console.log('✅ Voice state updated successfully');
      return true;
    } else {
      console.log('❌ Failed to update voice state');
      return false;
    }
  } catch (error) {
    console.error('❌ Error updating voice state:', error.message);
    return false;
  }
};

// Simple socket test
const testSocketConnection = async () => {
  console.log('\n🔌 Testing Socket.IO connection...');
  
  return new Promise((resolve) => {
    const socket = io(BASE_URL, {
      auth: { token: authTokens.john },
      transports: ['websocket']
    });

    socket.on('connected', (data) => {
      console.log('✅ Socket.IO connection successful');
      socket.disconnect();
      resolve(true);
    });

    socket.on('connect_error', (error) => {
      console.log('❌ Socket.IO connection failed:', error.message);
      resolve(false);
    });

    setTimeout(() => {
      console.log('⏰ Socket connection timeout');
      socket.disconnect();
      resolve(false);
    }, 5000);
  });
};

// Run quick tests
const runQuickTests = async () => {
  console.log('🚀 Quick Voice/Video Call System Tests');
  console.log('=====================================\n');

  const results = [];

  // Setup users
  results.push(await setupUsers());
  if (!results[results.length - 1]) {
    console.log('\n❌ User setup failed, stopping tests');
    return;
  }

  // Run tests
  results.push(await testVoiceChannelBasics());
  results.push(await testDMCallBasics());
  results.push(await testVoiceStateUpdates());
  results.push(await testSocketConnection());

  // Calculate results
  const passed = results.filter(result => result === true).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log('\n📊 QUICK TEST RESULTS');
  console.log('====================');
  console.log(`✅ Passed: ${passed}/${total} tests (${percentage}%)`);
  
  if (percentage >= 80) {
    console.log('🎉 Voice/Video call system is working great!');
  } else if (percentage >= 60) {
    console.log('⚠️  Voice/Video call system has some issues to fix');
  } else {
    console.log('❌ Voice/Video call system needs significant work');
  }

  console.log('\n🔄 Test completed');
  process.exit(0);
};

// Run tests
runQuickTests().catch(error => {
  console.error('💥 Test runner crashed:', error);
  process.exit(1);
});
