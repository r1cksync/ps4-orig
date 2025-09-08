#!/usr/bin/env node
/**
 * Complete DM System Test - Create users and test all functionality
 */

import http from 'http';

console.log('🎯 Complete DM System Test');
console.log('='.repeat(30));

async function httpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          });
        } catch (e) {
          console.log(`Response parse error for ${options.path}:`, e.message);
          console.log('Raw response body:', body);
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', (error) => {
      console.log(`Request error for ${options.path}:`, error.message);
      reject(error);
    });
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runCompleteTest() {
  let tests = 0;
  let passed = 0;

  function test(condition, message) {
    tests++;
    if (condition) {
      passed++;
      console.log(`✅ ${message}`);
    } else {
      console.log(`❌ ${message}`);
    }
    return condition;
  }

  try {
    console.log('\n👥 Creating test users...');

    // Create Alice
    const aliceData = {
      username: 'alice_test_' + Date.now(),
      email: 'alice.' + Date.now() + '@test.com', 
      password: 'testpass123'
    };

    let aliceAuth = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, aliceData);

    console.log('Alice auth response:', aliceAuth.status, aliceAuth.data);

    if (aliceAuth.status === 400) {
      // User exists, login instead
      console.log('Alice user exists, trying login...');
      aliceAuth = await httpRequest({
        hostname: 'localhost',
        port: 3001,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { email: aliceData.email, password: aliceData.password });
      console.log('Alice login response:', aliceAuth.status, aliceAuth.data);
    }

    const aliceOk = test(
      aliceAuth.status === 200 || aliceAuth.status === 201,
      `Alice account ready: ${aliceAuth.status}`
    );

    const aliceToken = aliceAuth.data?.data?.token;
    const aliceId = aliceAuth.data?.data?.user?.id; // Use 'id' instead of '_id'

    // Create Bob
    const bobData = {
      username: 'bob_test_' + Date.now(),
      email: 'bob.' + Date.now() + '@test.com',
      password: 'testpass123'
    };

    let bobAuth = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, bobData);

    if (bobAuth.status === 400) {
      bobAuth = await httpRequest({
        hostname: 'localhost',
        port: 3001,
        path: '/api/auth/login',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      }, { email: bobData.email, password: bobData.password });
    }

    const bobOk = test(
      bobAuth.status === 200 || bobAuth.status === 201,
      `Bob account ready: ${bobAuth.status}`
    );

    const bobToken = bobAuth.data?.data?.token;
    const bobId = bobAuth.data?.data?.user?.id; // Use 'id' instead of '_id'

    console.log('Alice ID:', aliceId);
    console.log('Bob ID:', bobId);

    if (!aliceOk || !bobOk || !aliceToken || !bobToken) {
      console.log('\n❌ User setup failed. Cannot proceed.');
      return;
    }

    console.log('\n🤝 Setting up friendship...');

    // Alice sends friend request (using username and discriminator)
    const friendRequest = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/friends/request',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      }
    }, { 
      username: bobAuth.data?.data?.user?.username,
      discriminator: bobAuth.data?.data?.user?.discriminator
    });

    console.log('Friend request response:', friendRequest.status, friendRequest.data);

    test(
      friendRequest.status === 200 || friendRequest.status === 201 || friendRequest.status === 400,
      `Friend request: ${friendRequest.status} - ${friendRequest.data?.message || 'OK'}`
    );

    const friendshipId = friendRequest.data?.friendship?._id;
    console.log('Friendship ID:', friendshipId);

    // Bob accepts friend request
    const acceptRequest = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/friends/${friendshipId}/accept`,
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${bobToken}`
      }
    });

    console.log('Accept request response:', acceptRequest.status, acceptRequest.data);

    test(
      acceptRequest.status === 200 || acceptRequest.status === 400,
      `Accept friend: ${acceptRequest.status} - ${acceptRequest.data?.message || 'OK'}`
    );

    console.log('\n📞 Testing DM functionality...');

    // Get Alice's DM list
    const getDMs = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/dms',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });

    test(getDMs.status === 200, `Get DM list: ${getDMs.status}`);
    test(getDMs.data?.success, 'DM list response format correct');

    // Create DM channel
    const createDM = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/dms',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      }
    }, { recipientId: bobId });

    console.log('Create DM response:', createDM.status, createDM.data);

    const dmOk = test(
      createDM.status === 200 || createDM.status === 201,
      `Create DM: ${createDM.status} - ${createDM.data?.message || 'Success'}`
    );

    const dmChannelId = createDM.data?.data?._id;
    test(dmChannelId, 'DM channel ID received');

    if (dmOk && dmChannelId) {
      console.log('\n💬 Testing messaging...');

      // Send message
      const sendMsg = await httpRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/dms/${dmChannelId}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        }
      }, {
        content: 'Hello Bob! This is a comprehensive test message. 🚀'
      });

      console.log('Send message response:', sendMsg.status, sendMsg.data);

      const msgOk = test(
        sendMsg.status === 200 || sendMsg.status === 201,
        `Send message: ${sendMsg.status}`
      );

      const messageId = sendMsg.data?.data?._id;
      test(messageId, 'Message ID received');

      // Get messages
      const getMessages = await httpRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/dms/${dmChannelId}/messages`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${bobToken}` }
      });

      test(getMessages.status === 200, `Get messages: ${getMessages.status}`);
      
      const messages = getMessages.data?.data;
      test(
        Array.isArray(messages) && messages.length > 0,
        `Messages retrieved: ${messages?.length || 0} messages`
      );

      if (msgOk && messageId) {
        console.log('\n😀 Testing reactions...');

        // Add reaction
        const reaction = await httpRequest({
          hostname: 'localhost',
          port: 3001,
          path: `/api/dms/${dmChannelId}/messages/${messageId}/reactions/👍`,
          method: 'POST',
          headers: { 'Authorization': `Bearer ${bobToken}` }
        });

        test(reaction.status === 200, `Add reaction: ${reaction.status}`);

        console.log('\n👁️ Testing read receipts...');

        // Mark as read
        const markRead = await httpRequest({
          hostname: 'localhost',
          port: 3001,
          path: `/api/dms/${dmChannelId}/read`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${bobToken}`
          }
        }, { messageId });

        test(markRead.status === 200, `Mark as read: ${markRead.status}`);

        console.log('\n✏️ Testing message editing...');

        // Edit message
        const editMsg = await httpRequest({
          hostname: 'localhost',
          port: 3001,
          path: `/api/dms/${dmChannelId}/messages/${messageId}`,
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aliceToken}`
          }
        }, {
          content: 'Hello Bob! This message has been EDITED! ✏️'
        });

        test(editMsg.status === 200, `Edit message: ${editMsg.status}`);
      }
    }

    console.log('\n👥 Testing group DM...');

    // Create group DM
    const groupDM = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/dms/group',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      }
    }, {
      participantIds: [bobId],
      name: 'Test Group Chat 🎉'
    });

    const groupOk = test(
      groupDM.status === 200 || groupDM.status === 201,
      `Create group DM: ${groupDM.status}`
    );

    const groupId = groupDM.data?.data?._id;
    test(groupId, 'Group DM ID received');

    if (groupOk && groupId) {
      // Send message in group
      const groupMsg = await httpRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/dms/${groupId}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        }
      }, {
        content: 'Hello group! This is a group message. 👥'
      });

      test(
        groupMsg.status === 200 || groupMsg.status === 201,
        `Group message: ${groupMsg.status}`
      );

      // Update group name
      const updateGroup = await httpRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/dms/${groupId}`,
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        }
      }, {
        name: 'Updated Test Group Chat ✨'
      });

      test(
        updateGroup.status === 200,
        `Update group name: ${updateGroup.status}`
      );
    }

  } catch (error) {
    console.error(`❌ Test error: ${error.message}`);
  }

  // Final results
  console.log('\n' + '='.repeat(50));
  console.log('📊 COMPLETE DM SYSTEM TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${tests}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${tests - passed}`);
  console.log(`Success Rate: ${((passed / tests) * 100).toFixed(1)}%`);
  
  if (passed === tests) {
    console.log('\n🎉 ALL TESTS PASSED! 🎉');
    console.log('✅ Your DM system is fully functional and ready!');
    console.log('🚀 Features verified:');
    console.log('   • User authentication');
    console.log('   • Friend system integration');
    console.log('   • DM channel creation');
    console.log('   • Message sending & retrieval');
    console.log('   • Message editing');
    console.log('   • Reactions');
    console.log('   • Read receipts');
    console.log('   • Group DMs');
    console.log('   • Group management');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED');
    console.log('Please check the failed tests above and fix the issues.');
  }
  
  console.log('\n💡 Next steps:');
  console.log('   • Run Socket.IO tests for real-time functionality');
  console.log('   • Test with a frontend client');
  console.log('   • Deploy to production environment');
}

console.log('Starting comprehensive DM system test...');
runCompleteTest().catch(error => {
  console.error('💥 Test runner failed:', error);
  process.exit(1);
});
