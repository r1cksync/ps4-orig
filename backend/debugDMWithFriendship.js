import fetch from 'node-fetch';

const debugDMWithFriendship = async () => {
  const BASE_URL = 'http://localhost:3001';
  const API_URL = `${BASE_URL}/api`;

  // Create 2 users for DM testing
  const timestamp = Date.now();
  const users = [];
  
  console.log('🔍 Testing DM creation with friendship...\n');

  try {
    // Create 2 users
    for (let i = 1; i <= 2; i++) {
      const userData = {
        username: `dmfriend${timestamp}${i}`,
        email: `dmfriend${timestamp}${i}@example.com`,
        password: `DMFriend${i}23!`,
        displayName: `DM Friend User ${i}`
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
          id: data.data.user.id,
          discriminator: data.data.user.discriminator // Store discriminator
        });
        console.log(`✅ User ${userData.username}#${data.data.user.discriminator} created`);
      }
    }

    // Make them friends
    console.log('\n👫 Creating friendship...');
    
    // Send friend request from user 1 to user 2
    const friendRequestResponse = await fetch(`${API_URL}/friends/request`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${users[0].token}`
      },
      body: JSON.stringify({
        username: users[1].username,
        discriminator: users[1].discriminator
      })
    });

    if (friendRequestResponse.ok) {
      const friendRequestData = await friendRequestResponse.json();
      console.log('✅ Friend request sent');
      console.log('Friend request data:', JSON.stringify(friendRequestData, null, 2));

      // Accept friend request from user 2
      const acceptResponse = await fetch(`${API_URL}/friends/${friendRequestData.friendship._id}/accept`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${users[1].token}`
        }
      });

      if (acceptResponse.ok) {
        console.log('✅ Friend request accepted');

        // Now try to create DM channel
        console.log('\n💬 Creating DM channel...');
        
        const dmResponse = await fetch(`${API_URL}/dms`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${users[0].token}`
          },
          body: JSON.stringify({
            recipientId: users[1].id
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
              console.log('\n🎉 FULL DM CALL FUNCTIONALITY WORKING!');
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
        const acceptError = await acceptResponse.json();
        console.log('❌ Friend accept error:', acceptError);
      }

    } else {
      const requestError = await friendRequestResponse.json();
      console.log('❌ Friend request error:', requestError);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
  }
};

debugDMWithFriendship();
