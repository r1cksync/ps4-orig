import fetch from 'node-fetch';

const debugDMCreationFixed = async () => {
  const BASE_URL = 'http://localhost:3001';
  const API_URL = `${BASE_URL}/api`;

  // Create 2 users for DM testing
  const timestamp = Date.now();
  const users = [];
  
  console.log('🔍 Debugging DM creation with mutual server...\n');

  try {
    // Create 2 users
    for (let i = 1; i <= 2; i++) {
      const userData = {
        username: `dmfix${timestamp}${i}`,
        email: `dmfix${timestamp}${i}@example.com`,
        password: `DMFix${i}23!`,
        displayName: `DM Fix User ${i}`
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

    // Create a server and add both users to it (so they have mutual server)
    console.log('\n📡 Creating mutual server...');
    const serverResponse = await fetch(`${API_URL}/servers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${users[0].token}`
      },
      body: JSON.stringify({
        name: 'DM Test Server',
        description: 'Server for mutual DM access'
      })
    });

    if (serverResponse.ok) {
      const serverData = await serverResponse.json();
      console.log('✅ Server created:', serverData.name);

      // Add second user to the server (this should be done via invite, but for testing...)
      // For now, let's try creating DM with recipientId format
      console.log('\n💬 Creating DM with recipientId...');
      
      const dmResponse = await fetch(`${API_URL}/dms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${users[0].token}`
        },
        body: JSON.stringify({
          recipientId: users[1].id // Using recipientId instead of participants
        })
      });

      console.log('DM creation response status:', dmResponse.status);
      
      if (dmResponse.ok) {
        const dmData = await dmResponse.json();
        console.log('✅ DM creation successful!');
        console.log('DM Channel ID:', dmData.data._id);

        // Now try to start a DM call
        console.log('\n📞 Starting DM call...');
        const dmCallResponse = await fetch(`${API_URL}/calls/dm/${dmData.data._id}/start`, {
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
          console.log('✅ DM call started successfully!');
          console.log('🔑 Room ID:', dmCallData.roomId);

          // Test second user joining the DM call
          console.log('\n👥 Second user joining DM call...');
          const joinResponse = await fetch(`${API_URL}/calls/dm/${dmData.data._id}/join`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${users[1].token}`
            },
            body: JSON.stringify({
              hasVideo: true
            })
          });

          if (joinResponse.ok) {
            const joinData = await joinResponse.json();
            console.log('✅ Second user joined DM call!');
            console.log('👥 Total participants:', joinData.call.participants.length);
          } else {
            const joinError = await joinResponse.json();
            console.log('❌ DM call join error:', joinError);
          }

        } else {
          const dmCallError = await dmCallResponse.json();
          console.log('❌ DM call error:', dmCallError);
        }

      } else {
        const errorData = await dmResponse.json();
        console.log('❌ DM creation error:', errorData);
      }

    } else {
      console.log('❌ Server creation failed');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

debugDMCreationFixed();
