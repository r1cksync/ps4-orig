import fetch from 'node-fetch';

const testLoginVariations = async () => {
  const BASE_URL = 'http://localhost:3001';
  const API_URL = `${BASE_URL}/api`;
  
  // Use the registration token directly instead of trying to login again
  const registerData = {
    username: 'quicktest',
    email: 'quicktest@example.com',
    password: 'QuickTest123!',
    displayName: 'Quick Test'
  };

  console.log('🔍 Testing login variations...\n');

  try {
    // Register and get token
    const registerResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(registerData)
    });

    if (registerResponse.ok) {
      const regData = await registerResponse.json();
      console.log('✅ Registration successful, got token directly');
      const token = regData.data.token;
      
      // Test with the registration token
      const profileResponse = await fetch(`${API_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (profileResponse.ok) {
        const profileData = await profileResponse.json();
        console.log('✅ Token works for protected routes');
        console.log('User data:', profileData);
        
        // Now test voice call functionality with this token
        await testVoiceCallsWithToken(token, API_URL);
        
      } else {
        console.log('❌ Token doesn\'t work for protected routes');
      }
      
    } else {
      console.log('❌ Registration failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

const testVoiceCallsWithToken = async (token, API_URL) => {
  console.log('\n🎤 Testing voice calls with valid token...');
  
  try {
    // Create server
    const serverResponse = await fetch(`${API_URL}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Voice Test Server',
        description: 'Testing voice functionality'
      })
    });

    if (serverResponse.ok) {
      const serverData = await serverResponse.json();
      console.log('✅ Server created:', serverData.server.name);
      
      // Create voice channel
      const channelResponse = await fetch(`${API_URL}/channels`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'General Voice',
          type: 'VOICE',
          serverId: serverData.server._id
        })
      });

      if (channelResponse.ok) {
        const channelData = await channelResponse.json();
        console.log('✅ Voice channel created:', channelData.channel.name);
        
        // Start voice call
        const callResponse = await fetch(`${API_URL}/calls/voice-channel/${channelData.channel._id}/start`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            hasVideo: false
          })
        });

        if (callResponse.ok) {
          const callData = await callResponse.json();
          console.log('✅ Voice call started successfully!');
          console.log('🔑 Room ID:', callData.roomId);
          console.log('📞 Call ID:', callData.call._id);
          
          // Test voice state update
          const stateResponse = await fetch(`${API_URL}/calls/voice-state`, {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              isSelfMuted: true,
              hasVideo: false
            })
          });

          if (stateResponse.ok) {
            console.log('✅ Voice state updated successfully');
          } else {
            console.log('❌ Voice state update failed');
          }

        } else {
          const error = await callResponse.json();
          console.log('❌ Voice call failed:', error);
        }
        
      } else {
        console.log('❌ Voice channel creation failed');
      }
      
    } else {
      console.log('❌ Server creation failed');
    }

  } catch (error) {
    console.error('❌ Voice call test error:', error.message);
  }
};

testLoginVariations();
