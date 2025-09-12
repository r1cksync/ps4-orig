import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:3001';
const API_URL = `${BASE_URL}/api`;

const testUsers = [
  {
    username: 'testuser1',
    email: 'testuser1@example.com',
    password: 'TestPass123!',
    displayName: 'Test User 1'
  },
  {
    username: 'testuser2', 
    email: 'testuser2@example.com',
    password: 'TestPass123!',
    displayName: 'Test User 2'
  }
];

const createTestUsers = async () => {
  console.log('🔧 Setting up test users for voice call testing...\n');

  for (const user of testUsers) {
    try {
      console.log(`Creating user: ${user.username}`);
      
      const response = await fetch(`${API_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(user)
      });

      if (response.ok) {
        const data = await response.json();
        console.log(`✅ ${user.username} created successfully`);
      } else if (response.status === 409) {
        console.log(`ℹ️  ${user.username} already exists`);
      } else {
        const error = await response.json();
        console.log(`❌ Failed to create ${user.username}:`, error.message);
      }
    } catch (error) {
      console.log(`❌ Error creating ${user.username}:`, error.message);
    }
  }

  console.log('\n🎯 Test users setup complete! Now run: node voiceCallTest.js');
};

createTestUsers();
