import fetch from 'node-fetch';

const debugChannelCreation = async () => {
  const BASE_URL = 'http://localhost:3001';
  const API_URL = `${BASE_URL}/api`;

  // Register a user and create a server first
  const userData = {
    username: `debugchannel${Date.now()}`,
    email: `debugchannel${Date.now()}@example.com`,
    password: 'DebugChannel123!',
    displayName: 'Debug Channel User'
  };

  console.log('🔍 Debugging channel creation...\n');

  try {
    // Register user
    const registerResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    if (registerResponse.ok) {
      const regData = await registerResponse.json();
      const token = regData.data.token;
      console.log('✅ User registered');

      // Create server
      const serverResponse = await fetch(`${API_URL}/servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Debug Server for Channel',
          description: 'Testing channel creation'
        })
      });

      if (serverResponse.ok) {
        const serverData = await serverResponse.json();
        console.log('✅ Server created:', serverData.name);

        // Now try to create a channel
        console.log('\n🎤 Creating voice channel...');
        const channelResponse = await fetch(`${API_URL}/channels`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            name: 'Debug Voice Channel',
            type: 'VOICE',
            serverId: serverData._id
          })
        });

        console.log('Channel response status:', channelResponse.status);
        
        if (channelResponse.ok) {
          const channelData = await channelResponse.json();
          console.log('Channel response data:', JSON.stringify(channelData, null, 2));
        } else {
          const errorData = await channelResponse.json();
          console.log('Channel error data:', JSON.stringify(errorData, null, 2));
        }

      } else {
        console.log('❌ Server creation failed');
      }

    } else {
      console.log('❌ User registration failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

debugChannelCreation();
