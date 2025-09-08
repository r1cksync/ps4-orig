#!/usr/bin/env node
/**
 * DM Endpoints Test - Focus on DM functionality
 */

import http from 'http';

console.log('💬 DM Endpoints Test');
console.log('='.repeat(25));

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
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);
    
    if (data) {
      req.write(JSON.stringify(data));
    }
    
    req.end();
  });
}

async function runDMTests() {
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
  }

  try {
    // Login as Alice
    console.log('\n🔐 Authenticating test users...');
    
    const aliceLogin = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'alice.quick@test.com',
      password: 'testpass123'
    });

    test(aliceLogin.status === 200, 'Alice login successful');
    const aliceToken = aliceLogin.data?.data?.token;
    const aliceId = aliceLogin.data?.data?.user?._id;

    // Login as Bob
    const bobLogin = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/login',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      email: 'bob.quick@test.com',
      password: 'testpass123'
    });

    test(bobLogin.status === 200, 'Bob login successful');
    const bobToken = bobLogin.data?.data?.token;
    const bobId = bobLogin.data?.data?.user?._id;

    if (!aliceToken || !bobToken) {
      console.log('❌ Authentication failed, cannot proceed');
      return;
    }

    console.log('\n📞 Testing DM creation...');

    // Test: Get Alice's DM channels (should work)
    const getDMs = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/dms',
      method: 'GET',
      headers: { 'Authorization': `Bearer ${aliceToken}` }
    });

    test(getDMs.status === 200, `Get DMs endpoint works: ${getDMs.status}`);
    test(Array.isArray(getDMs.data?.data), 'DMs returned as array');

    // Test: Create DM between Alice and Bob
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

    test(
      createDM.status === 200 || createDM.status === 201,
      `Create DM: ${createDM.status} - ${createDM.data?.message || 'Success'}`
    );

    const dmChannelId = createDM.data?.data?._id;
    test(dmChannelId, 'DM channel ID received');

    if (dmChannelId) {
      console.log('\n💬 Testing messaging...');

      // Test: Send message
      const sendMessage = await httpRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/dms/${dmChannelId}/messages`,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        }
      }, {
        content: 'Hello Bob! Testing DM messaging functionality.'
      });

      test(
        sendMessage.status === 200 || sendMessage.status === 201,
        `Send message: ${sendMessage.status}`
      );

      const messageId = sendMessage.data?.data?._id;
      test(messageId, 'Message ID received');

      // Test: Get messages
      const getMessages = await httpRequest({
        hostname: 'localhost',
        port: 3001,
        path: `/api/dms/${dmChannelId}/messages`,
        method: 'GET',
        headers: { 'Authorization': `Bearer ${bobToken}` }
      });

      test(
        getMessages.status === 200,
        `Get messages: ${getMessages.status}`
      );

      test(
        Array.isArray(getMessages.data?.data) && getMessages.data.data.length > 0,
        'Messages retrieved successfully'
      );

      if (messageId) {
        // Test: Add reaction
        const addReaction = await httpRequest({
          hostname: 'localhost',
          port: 3001,
          path: `/api/dms/${dmChannelId}/messages/${messageId}/reactions/👍`,
          method: 'POST',
          headers: { 'Authorization': `Bearer ${bobToken}` }
        });

        test(
          addReaction.status === 200,
          `Add reaction: ${addReaction.status}`
        );

        // Test: Mark as read
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

        test(
          markRead.status === 200,
          `Mark as read: ${markRead.status}`
        );
      }
    }

    console.log('\n👥 Testing group DM...');

    // Test: Create group DM
    const createGroupDM = await httpRequest({
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
      name: 'Test Group Chat'
    });

    test(
      createGroupDM.status === 200 || createGroupDM.status === 201,
      `Create group DM: ${createGroupDM.status}`
    );

  } catch (error) {
    console.error('❌ Test error:', error.message);
  }

  // Results
  console.log('\n' + '='.repeat(40));
  console.log('📊 DM Endpoints Test Results:');
  console.log(`Tests Run: ${tests}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${tests - passed}`);
  console.log(`Success Rate: ${((passed / tests) * 100).toFixed(1)}%`);
  
  if (passed === tests) {
    console.log('\n🎉 All DM endpoint tests passed!');
    console.log('✅ Your DM system is fully functional');
  } else {
    console.log('\n⚠️  Some tests failed. Check implementation.');
  }
}

runDMTests().catch(console.error);
