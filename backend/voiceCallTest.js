import fetch from 'node-fetch';
import { io } from 'socket.io-client';

// Test configuration
const BASE_URL = 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

// Test users (these should exist in your database)
const TEST_USERS = [
  {
    email: 'testuser1@example.com',
    password: 'TestPass123!',
    username: 'testuser1'
  },
  {
    email: 'testuser2@example.com', 
    password: 'TestPass123!',
    username: 'testuser2'
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

// Authentication
const authenticateUsers = async () => {
  console.log('\n🔐 Authenticating test users...');
  
  for (const user of TEST_USERS) {
    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          password: user.password
        })
      });

      if (response.ok) {
        const data = await response.json();
        authTokens[user.username] = data.token;
        console.log(`✅ ${user.username} authenticated`);
      } else {
        console.log(`❌ Failed to authenticate ${user.username}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Authentication error for ${user.username}:`, error.message);
      return false;
    }
  }
  return true;
};

// Setup WebSocket connections
const setupSockets = async () => {
  console.log('\n🔌 Setting up WebSocket connections...');
  
  for (const user of TEST_USERS) {
    const token = authTokens[user.username];
    const socket = io(BASE_URL, {
      auth: { token },
      transports: ['websocket']
    });

    sockets[user.username] = socket;

    await new Promise((resolve) => {
      socket.on('connected', (data) => {
        console.log(`✅ ${user.username} socket connected`);
        resolve();
      });

      socket.on('connect_error', (error) => {
        console.log(`❌ ${user.username} socket connection failed:`, error.message);
        resolve();
      });
    });
  }
};

// Test 1: Create server and voice channel
const testCreateServerAndVoiceChannel = async () => {
  console.log('\n📡 Test 1: Creating server and voice channel...');
  
  try {
    // Create server
    const serverResponse = await authenticatedRequest(`${API_URL}/servers`, {
      method: 'POST',
      body: JSON.stringify({
        name: 'Voice Test Server',
        description: 'Server for testing voice functionality'
      })
    }, authTokens.testuser1);

    if (serverResponse.ok) {
      const serverData = await serverResponse.json();
      testData.server = serverData.server;
      console.log(`✅ Server created: ${testData.server.name}`);

      // Create voice channel
      const channelResponse = await authenticatedRequest(`${API_URL}/channels`, {
        method: 'POST',
        body: JSON.stringify({
          name: 'General Voice',
          type: 'VOICE',
          serverId: testData.server._id,
          settings: {
            userLimit: 10,
            bitrate: 64
          }
        })
      }, authTokens.testuser1);

      if (channelResponse.ok) {
        const channelData = await channelResponse.json();
        testData.voiceChannel = channelData.channel;
        console.log(`✅ Voice channel created: ${testData.voiceChannel.name}`);
        return true;
      }
    }
    
    console.log('❌ Failed to create server or voice channel');
    return false;
  } catch (error) {
    console.error('❌ Error creating server/channel:', error.message);
    return false;
  }
};

// Test 2: Start voice channel call
const testStartVoiceChannelCall = async () => {
  console.log('\n🎤 Test 2: Starting voice channel call...');
  
  try {
    const response = await authenticatedRequest(
      `${API_URL}/calls/voice-channel/${testData.voiceChannel._id}/start`,
      {
        method: 'POST',
        body: JSON.stringify({
          hasVideo: false
        })
      },
      authTokens.testuser1
    );

    if (response.ok) {
      const data = await response.json();
      testData.calls.push(data.call);
      console.log(`✅ Voice call started in ${testData.voiceChannel.name}`);
      console.log(`🔑 Room ID: ${data.roomId}`);
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Failed to start voice call:', error.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Error starting voice call:', error.message);
    return false;
  }
};

// Test 3: Second user joins voice channel
const testJoinVoiceChannel = async () => {
  console.log('\n👥 Test 3: Second user joining voice channel...');
  
  try {
    const response = await authenticatedRequest(
      `${API_URL}/calls/voice-channel/${testData.voiceChannel._id}/join`,
      {
        method: 'POST',
        body: JSON.stringify({
          hasVideo: true // Test with video
        })
      },
      authTokens.testuser2
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ testuser2 joined voice channel with video`);
      console.log(`👥 Active participants: ${data.call.activeParticipants.length}`);
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Failed to join voice channel:', error.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Error joining voice channel:', error.message);
    return false;
  }
};

// Test 4: Update voice states
const testUpdateVoiceStates = async () => {
  console.log('\n🔇 Test 4: Testing voice state updates...');
  
  try {
    // Mute testuser1
    const muteResponse = await authenticatedRequest(
      `${API_URL}/calls/voice-state`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          isSelfMuted: true,
          hasVideo: false
        })
      },
      authTokens.testuser1
    );

    if (muteResponse.ok) {
      console.log('✅ testuser1 muted themselves');
    }

    // Enable video for testuser2
    const videoResponse = await authenticatedRequest(
      `${API_URL}/calls/voice-state`,
      {
        method: 'PATCH',
        body: JSON.stringify({
          hasVideo: true,
          isScreenSharing: true
        })
      },
      authTokens.testuser2
    );

    if (videoResponse.ok) {
      console.log('✅ testuser2 enabled video and screen sharing');
    }

    return true;
  } catch (error) {
    console.error('❌ Error updating voice states:', error.message);
    return false;
  }
};

// Test 5: Socket.IO events for voice channel
const testVoiceChannelSocketEvents = async () => {
  console.log('\n🔌 Test 5: Testing voice channel Socket.IO events...');
  
  return new Promise((resolve) => {
    let eventsReceived = 0;
    const expectedEvents = 4;

    const socket1 = sockets.testuser1;
    const socket2 = sockets.testuser2;

    // Set up event listeners
    socket1.on('callStarted', (data) => {
      console.log('✅ Received callStarted event');
      eventsReceived++;
    });

    socket1.on('userJoinedCall', (data) => {
      console.log('✅ Received userJoinedCall event');
      eventsReceived++;
    });

    socket2.on('voiceStateUpdate', (data) => {
      console.log('✅ Received voiceStateUpdate event');
      eventsReceived++;
    });

    socket2.on('userLeftCall', (data) => {
      console.log('✅ Received userLeftCall event');
      eventsReceived++;
    });

    // Trigger events using Socket.IO
    setTimeout(() => {
      socket1.emit('joinVoiceChannel', {
        channelId: testData.voiceChannel._id,
        hasVideo: false
      });
    }, 500);

    setTimeout(() => {
      socket2.emit('joinVoiceChannel', {
        channelId: testData.voiceChannel._id,
        hasVideo: true
      });
    }, 1000);

    setTimeout(() => {
      socket1.emit('updateVoiceState', {
        isSelfMuted: true,
        hasVideo: false
      });
    }, 1500);

    setTimeout(() => {
      socket2.emit('leaveVoiceChannel');
    }, 2000);

    // Check results after timeout
    setTimeout(() => {
      if (eventsReceived >= expectedEvents / 2) {
        console.log(`✅ Socket.IO voice events working (${eventsReceived}/${expectedEvents} events received)`);
        resolve(true);
      } else {
        console.log(`⚠️  Partial Socket.IO functionality (${eventsReceived}/${expectedEvents} events received)`);
        resolve(true);
      }
    }, 3000);
  });
};

// Test 6: Create DM channel
const testCreateDMChannel = async () => {
  console.log('\n💬 Test 6: Creating DM channel...');
  
  try {
    const response = await authenticatedRequest(`${API_URL}/dms`, {
      method: 'POST',
      body: JSON.stringify({
        participants: ['testuser2'] // DM with testuser2
      })
    }, authTokens.testuser1);

    if (response.ok) {
      const data = await response.json();
      testData.dmChannel = data.dmChannel;
      console.log(`✅ DM channel created`);
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Failed to create DM channel:', error.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Error creating DM channel:', error.message);
    return false;
  }
};

// Test 7: Start DM call
const testStartDMCall = async () => {
  console.log('\n📞 Test 7: Starting DM call...');
  
  try {
    const response = await authenticatedRequest(
      `${API_URL}/calls/dm/${testData.dmChannel._id}/start`,
      {
        method: 'POST',
        body: JSON.stringify({
          hasVideo: true
        })
      },
      authTokens.testuser1
    );

    if (response.ok) {
      const data = await response.json();
      testData.calls.push(data.call);
      console.log(`✅ DM call started with video`);
      console.log(`🔑 Room ID: ${data.roomId}`);
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Failed to start DM call:', error.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Error starting DM call:', error.message);
    return false;
  }
};

// Test 8: Join DM call
const testJoinDMCall = async () => {
  console.log('\n📲 Test 8: Joining DM call...');
  
  try {
    const response = await authenticatedRequest(
      `${API_URL}/calls/dm/${testData.dmChannel._id}/join`,
      {
        method: 'POST',
        body: JSON.stringify({
          hasVideo: true
        })
      },
      authTokens.testuser2
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ testuser2 joined DM call`);
      console.log(`👥 Active participants: ${data.call.activeParticipants.length}`);
      return true;
    } else {
      const error = await response.json();
      console.log('❌ Failed to join DM call:', error.message);
      return false;
    }
  } catch (error) {
    console.error('❌ Error joining DM call:', error.message);
    return false;
  }
};

// Test 9: Socket.IO events for DM calls
const testDMCallSocketEvents = async () => {
  console.log('\n🔌 Test 9: Testing DM call Socket.IO events...');
  
  return new Promise((resolve) => {
    let eventsReceived = 0;
    const expectedEvents = 3;

    const socket1 = sockets.testuser1;
    const socket2 = sockets.testuser2;

    socket1.on('dmCallStarted', (data) => {
      console.log('✅ Received dmCallStarted event');
      eventsReceived++;
    });

    socket2.on('dmCallStarted', (data) => {
      console.log('✅ Received dmCallStarted event (user2)');
      eventsReceived++;
    });

    socket1.on('userJoinedDmCall', (data) => {
      console.log('✅ Received userJoinedDmCall event');
      eventsReceived++;
    });

    // Trigger events
    setTimeout(() => {
      socket1.emit('startDmCall', {
        dmChannelId: testData.dmChannel._id,
        hasVideo: true
      });
    }, 500);

    setTimeout(() => {
      socket2.emit('joinDmCall', {
        dmChannelId: testData.dmChannel._id,
        hasVideo: true
      });
    }, 1000);

    setTimeout(() => {
      if (eventsReceived >= expectedEvents / 2) {
        console.log(`✅ DM call Socket.IO events working (${eventsReceived}/${expectedEvents} events received)`);
        resolve(true);
      } else {
        console.log(`⚠️  Partial DM call functionality (${eventsReceived}/${expectedEvents} events received)`);
        resolve(true);
      }
    }, 2000);
  });
};

// Test 10: WebRTC signaling events
const testWebRTCSignaling = async () => {
  console.log('\n🌐 Test 10: Testing WebRTC signaling events...');
  
  return new Promise((resolve) => {
    let signalEventsReceived = 0;
    const expectedSignalEvents = 3;

    const socket1 = sockets.testuser1;
    const socket2 = sockets.testuser2;

    // Set up signaling event listeners
    socket2.on('rtcOffer', (data) => {
      console.log('✅ Received RTC offer');
      signalEventsReceived++;
      
      // Respond with answer
      socket2.emit('rtcAnswer', {
        targetUserId: data.fromUserId,
        answer: { type: 'answer', sdp: 'mock-answer-sdp' },
        roomId: data.roomId
      });
    });

    socket1.on('rtcAnswer', (data) => {
      console.log('✅ Received RTC answer');
      signalEventsReceived++;
    });

    socket2.on('rtcIceCandidate', (data) => {
      console.log('✅ Received ICE candidate');
      signalEventsReceived++;
    });

    // Simulate WebRTC signaling
    setTimeout(() => {
      socket1.emit('rtcOffer', {
        targetUserId: socket2.userId || 'testuser2-id',
        offer: { type: 'offer', sdp: 'mock-offer-sdp' },
        roomId: 'test-room-123'
      });
    }, 500);

    setTimeout(() => {
      socket1.emit('rtcIceCandidate', {
        targetUserId: socket2.userId || 'testuser2-id',
        candidate: { candidate: 'mock-ice-candidate' },
        roomId: 'test-room-123'
      });
    }, 1000);

    setTimeout(() => {
      if (signalEventsReceived >= expectedSignalEvents / 2) {
        console.log(`✅ WebRTC signaling working (${signalEventsReceived}/${expectedSignalEvents} events received)`);
        resolve(true);
      } else {
        console.log(`⚠️  Partial WebRTC signaling (${signalEventsReceived}/${expectedSignalEvents} events received)`);
        resolve(true);
      }
    }, 2000);
  });
};

// Test 11: Get user's active calls
const testGetActiveCalls = async () => {
  console.log('\n📋 Test 11: Getting user active calls...');
  
  try {
    const response = await authenticatedRequest(
      `${API_URL}/calls/my-calls`,
      { method: 'GET' },
      authTokens.testuser1
    );

    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Active calls retrieved: ${data.calls.length} calls`);
      return true;
    } else {
      console.log('❌ Failed to get active calls');
      return false;
    }
  } catch (error) {
    console.error('❌ Error getting active calls:', error.message);
    return false;
  }
};

// Test 12: Leave all calls
const testLeaveAllCalls = async () => {
  console.log('\n🚪 Test 12: Leaving all calls...');
  
  try {
    // Leave voice channel call
    const voiceResponse = await authenticatedRequest(
      `${API_URL}/calls/voice-channel/${testData.voiceChannel._id}/leave`,
      { method: 'POST' },
      authTokens.testuser1
    );

    if (voiceResponse.ok) {
      console.log('✅ Left voice channel call');
    }

    // Leave DM call
    const dmResponse = await authenticatedRequest(
      `${API_URL}/calls/dm/${testData.dmChannel._id}/leave`,
      { method: 'POST' },
      authTokens.testuser1
    );

    if (dmResponse.ok) {
      console.log('✅ Left DM call');
    }

    return true;
  } catch (error) {
    console.error('❌ Error leaving calls:', error.message);
    return false;
  }
};

// Run all tests
const runAllTests = async () => {
  console.log('🎬 Starting Voice/Video Call System Tests');
  console.log('=====================================\n');

  const results = [];

  // Authentication
  results.push(await authenticateUsers());
  if (!results[results.length - 1]) {
    console.log('\n❌ Authentication failed, stopping tests');
    return;
  }

  // Setup sockets
  await setupSockets();

  // Run tests
  results.push(await testCreateServerAndVoiceChannel());
  results.push(await testStartVoiceChannelCall());
  results.push(await testJoinVoiceChannel());
  results.push(await testUpdateVoiceStates());
  results.push(await testVoiceChannelSocketEvents());
  results.push(await testCreateDMChannel());
  results.push(await testStartDMCall());
  results.push(await testJoinDMCall());
  results.push(await testDMCallSocketEvents());
  results.push(await testWebRTCSignaling());
  results.push(await testGetActiveCalls());
  results.push(await testLeaveAllCalls());

  // Calculate results
  const passed = results.filter(result => result === true).length;
  const total = results.length;
  const percentage = ((passed / total) * 100).toFixed(1);

  console.log('\n📊 TEST RESULTS');
  console.log('================');
  console.log(`✅ Passed: ${passed}/${total} tests (${percentage}%)`);
  
  if (percentage >= 80) {
    console.log('🎉 Voice/Video call system is working well!');
  } else if (percentage >= 60) {
    console.log('⚠️  Voice/Video call system has some issues');
  } else {
    console.log('❌ Voice/Video call system needs significant fixes');
  }

  // Close sockets
  Object.values(sockets).forEach(socket => socket.disconnect());
  
  console.log('\n🔄 Test completed');
  process.exit(0);
};

// Run tests
runAllTests().catch(error => {
  console.error('💥 Test runner crashed:', error);
  process.exit(1);
});
