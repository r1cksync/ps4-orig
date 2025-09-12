import fetch from 'node-fetch';

const debugServerCreation = async () => {
  const BASE_URL = 'http://localhost:3001';
  const API_URL = `${BASE_URL}/api`;

  // Register a user first
  const userData = {
    username: 'debugserver',
    email: 'debugserver@example.com',
    password: 'DebugServer123!',
    displayName: 'Debug Server User'
  };

  console.log('🔍 Debugging server creation...\n');

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
      console.log('✅ User registered, token obtained');

      // Now try to create a server
      console.log('\n📡 Creating server...');
      const serverResponse = await fetch(`${API_URL}/servers`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          name: 'Debug Test Server',
          description: 'Testing server creation'
        })
      });

      console.log('Server response status:', serverResponse.status);
      
      if (serverResponse.ok) {
        const serverData = await serverResponse.json();
        console.log('Server response data:', JSON.stringify(serverData, null, 2));
      } else {
        const errorData = await serverResponse.json();
        console.log('Server error data:', JSON.stringify(errorData, null, 2));
      }

    } else {
      console.log('❌ User registration failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

debugServerCreation();
