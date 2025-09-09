import fetch from 'node-fetch';

const debugCallJoin = async () => {
  const BASE_URL = 'http://localhost:3001';
  const API_URL = `${BASE_URL}/api`;

  // Create users, server, channel, start call, then debug join
  const timestamp = Date.now();
  const users = [];
  
  console.log('🔍 Debugging call join response...\n');

  try {
    // Create 2 users
    for (let i = 1; i <= 2; i++) {
      const userData = {
        username: `debugjoin${timestamp}${i}`,
        email: `debugjoin${timestamp}${i}@example.com`,
        password: `DebugJoin${i}23!`,
        displayName: `Debug Join User ${i}`
      };

      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData)
      });

      if (response.ok) {
        const data = await response.json();
        users.push({
          ...userData,
          token: data.data.token
        });
        console.log(`✅ User ${userData.username} created`);
      }
    }

    // Create server
    const serverResponse = await fetch(`${API_URL}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${users[0].token}`
      },
      body: JSON.stringify({
        name: 'Debug Join Server',
        description: 'Testing call join'
      })
    });

    const serverData = await serverResponse.json();
    console.log('✅ Server created');

    // Create voice channel
    const channelResponse = await fetch(`${API_URL}/channels`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${users[0].token}`
      },
      body: JSON.stringify({
        name: 'Debug Voice',
        type: 'VOICE',
        serverId: serverData._id
      })
    });

    const channelData = await channelResponse.json();
    console.log('✅ Voice channel created');

    // Start call
    const startResponse = await fetch(`${API_URL}/calls/voice-channel/${channelData._id}/start`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${users[0].token}`
      },
      body: JSON.stringify({
        hasVideo: false
      })
    });

    if (startResponse.ok) {
      console.log('✅ Call started by user 1');

      // Now debug the join response
      console.log('\n👥 User 2 joining call...');
      const joinResponse = await fetch(`${API_URL}/calls/voice-channel/${channelData._id}/join`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${users[1].token}`
        },
        body: JSON.stringify({
          hasVideo: true
        })
      });

      console.log('Join response status:', joinResponse.status);
      
      if (joinResponse.ok) {
        const joinData = await joinResponse.json();
        console.log('Join response data:', JSON.stringify(joinData, null, 2));
      } else {
        const errorData = await joinResponse.json();
        console.log('Join error data:', JSON.stringify(errorData, null, 2));
      }

    } else {
      console.log('❌ Call start failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

debugCallJoin();
