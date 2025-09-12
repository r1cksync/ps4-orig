import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

const testAuth = async () => {
  console.log('🔍 Testing authentication...');
  
  try {
    const response = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'testuser1@example.com',
        password: 'TestPass123!'
      })
    });

    console.log('Response status:', response.status);
    const data = await response.json();
    console.log('Response data:', data);

    if (response.ok) {
      console.log('✅ Authentication successful!');
      console.log('Token:', data.token?.substring(0, 20) + '...');
    } else {
      console.log('❌ Authentication failed:', data.message);
    }
  } catch (error) {
    console.error('❌ Request error:', error.message);
  }
};

testAuth();
