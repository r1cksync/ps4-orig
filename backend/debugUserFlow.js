import fetch from 'node-fetch';

const testUserFlow = async () => {
  const BASE_URL = 'http://localhost:3001';
  const API_URL = `${BASE_URL}/api`;
  
  const userData = {
    username: 'debuguser',
    email: 'debuguser@example.com',
    password: 'DebugPass123!',
    displayName: 'Debug User'
  };

  console.log('🔍 Testing complete user flow...\n');

  try {
    // Step 1: Register
    console.log('1. Registering user...');
    const registerResponse = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(userData)
    });

    console.log('Registration status:', registerResponse.status);
    const registerData = await registerResponse.json();
    console.log('Registration data:', registerData);

    if (!registerResponse.ok) {
      console.log('❌ Registration failed');
      return;
    }

    // Step 2: Wait a moment then login
    console.log('\n2. Attempting login...');
    await new Promise(resolve => setTimeout(resolve, 1000));

    const loginResponse = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: userData.email,
        password: userData.password
      })
    });

    console.log('Login status:', loginResponse.status);
    const loginData = await loginResponse.json();
    console.log('Login data:', loginData);

    if (loginResponse.ok) {
      console.log('\n✅ Full flow successful!');
      console.log('Token:', loginData.token?.substring(0, 30) + '...');

      // Test a protected endpoint
      console.log('\n3. Testing protected endpoint...');
      const profileResponse = await fetch(`${API_URL}/users/profile`, {
        headers: {
          'Authorization': `Bearer ${loginData.token}`
        }
      });

      console.log('Profile status:', profileResponse.status);
      const profileData = await profileResponse.json();
      console.log('Profile data:', profileData);

    } else {
      console.log('\n❌ Login failed after successful registration');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

testUserFlow();
