import fetch from 'node-fetch';

const debugDMCreation = async () => {
  const BASE_URL = 'http://localhost:3001';
  const API_URL = `${BASE_URL}/api`;

  // Create 2 users for DM testing
  const timestamp = Date.now();
  const users = [];
  
  console.log('🔍 Debugging DM channel creation...\n');

  try {
    // Create 2 users
    for (let i = 1; i <= 2; i++) {
      const userData = {
        username: `debugdm${timestamp}${i}`,
        email: `debugdm${timestamp}${i}@example.com`,
        password: `DebugDM${i}23!`,
        displayName: `Debug DM User ${i}`
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
          token: data.data.token,
          id: data.data.user.id
        });
        console.log(`✅ User ${userData.username} created`);
      }
    }

    // Try to create DM channel
    console.log('\n💬 Creating DM channel...');
    console.log(`User 1: ${users[0].username}`);
    console.log(`User 2: ${users[1].username}`);

    const dmResponse = await fetch(`${API_URL}/dms`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${users[0].token}`
      },
      body: JSON.stringify({
        participants: [users[1].username] // Using username
      })
    });

    console.log('DM creation response status:', dmResponse.status);
    
    if (dmResponse.ok) {
      const dmData = await dmResponse.json();
      console.log('DM creation successful:', JSON.stringify(dmData, null, 2));

      // Now try to start a DM call
      console.log('\n📞 Starting DM call...');
      const dmCallResponse = await fetch(`${API_URL}/calls/dm/${dmData.dmChannel._id}/start`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${users[0].token}`
        },
        body: JSON.stringify({
          hasVideo: true
        })
      });

      console.log('DM call response status:', dmCallResponse.status);
      
      if (dmCallResponse.ok) {
        const dmCallData = await dmCallResponse.json();
        console.log('DM call started successfully!');
        console.log('Room ID:', dmCallData.roomId);
      } else {
        const dmCallError = await dmCallResponse.json();
        console.log('DM call error:', JSON.stringify(dmCallError, null, 2));
      }

    } else {
      const errorData = await dmResponse.json();
      console.log('DM creation error:', JSON.stringify(errorData, null, 2));
      
      // Try alternative approach with user ID
      console.log('\n🔄 Trying with user ID instead...');
      const dmResponse2 = await fetch(`${API_URL}/dms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${users[0].token}`
        },
        body: JSON.stringify({
          participants: [users[1].id] // Using ID
        })
      });

      console.log('DM creation (ID) response status:', dmResponse2.status);
      
      if (dmResponse2.ok) {
        const dmData2 = await dmResponse2.json();
        console.log('DM creation with ID successful!');
      } else {
        const errorData2 = await dmResponse2.json();
        console.log('DM creation (ID) error:', JSON.stringify(errorData2, null, 2));
      }
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

debugDMCreation();
