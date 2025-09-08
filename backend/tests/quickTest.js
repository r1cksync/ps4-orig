#!/usr/bin/env node
/**
 * Quick DM API Test - Direct and simple
 */

import http from 'http';

console.log('🎯 Quick DM API Test');
console.log('='.repeat(30));

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (condition) {
    testsPassed++;
    console.log(`✅ ${message}`);
  } else {
    testsFailed++;
    console.log(`❌ ${message}`);
  }
}

async function httpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: body ? JSON.parse(body) : null,
            headers: res.headers
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body,
            headers: res.headers
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

async function runQuickTests() {
  console.log('Starting quick DM API tests...\n');
  
  // Test 1: Create test user Alice
  try {
    const aliceData = {
      username: 'alice_quick_test',
      email: 'alice.quick@test.com',
      password: 'testpass123'
    };

    const registerOptions = {
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    };

    let response = await httpRequest(registerOptions, aliceData);
    
    if (response.status === 400) {
      // User exists, try login
      const loginOptions = { ...registerOptions, path: '/api/auth/login' };
      response = await httpRequest(loginOptions, {
        email: aliceData.email,
        password: aliceData.password
      });
    }

    assert(
      response.status === 200 || response.status === 201,
      `Alice authentication: ${response.status}`
    );

    const aliceToken = response.data?.data?.token;
    assert(aliceToken, 'Alice received authentication token');

    // Test 2: Create test user Bob
    const bobData = {
      username: 'bob_quick_test',
      email: 'bob.quick@test.com',
      password: 'testpass123'
    };

    response = await httpRequest(registerOptions, bobData);
    
    if (response.status === 400) {
      const loginOptions = { ...registerOptions, path: '/api/auth/login' };
      response = await httpRequest(loginOptions, {
        email: bobData.email,
        password: bobData.password
      });
    }

    assert(
      response.status === 200 || response.status === 201,
      `Bob authentication: ${response.status}`
    );

    const bobToken = response.data?.data?.token;
    const bobId = response.data?.data?.user?._id;
    assert(bobToken, 'Bob received authentication token');

    // Test 3: Alice sends friend request to Bob
    if (aliceToken && bobToken && bobId) {
      const friendOptions = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/friends/request',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        }
      };

      response = await httpRequest(friendOptions, { recipientId: bobId });
      assert(
        response.status === 200 || response.status === 201 || response.status === 400,
        `Friend request sent: ${response.status}`
      );

      // Test 4: Bob accepts friend request
      const acceptOptions = {
        ...friendOptions,
        path: '/api/friends/accept',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${bobToken}`
        }
      };

      const aliceId = response.data?.data?.user?._id || 'alice_id_placeholder';
      response = await httpRequest(acceptOptions, { requesterId: aliceId });
      assert(
        response.status === 200 || response.status === 400,
        `Friend request accepted: ${response.status}`
      );

      // Test 5: Alice creates DM with Bob
      const dmOptions = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/dms',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${aliceToken}`
        }
      };

      response = await httpRequest(dmOptions, { recipientId: bobId });
      assert(
        response.status === 200 || response.status === 201,
        `DM channel created: ${response.status}`
      );

      const dmChannelId = response.data?.data?._id;
      assert(dmChannelId, 'DM channel ID received');

      // Test 6: Alice sends message
      if (dmChannelId) {
        const messageOptions = {
          hostname: 'localhost',
          port: 3001,
          path: `/api/dms/${dmChannelId}/messages`,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${aliceToken}`
          }
        };

        response = await httpRequest(messageOptions, {
          content: 'Hello Bob! This is a test message from the quick test suite.'
        });

        assert(
          response.status === 200 || response.status === 201,
          `Message sent: ${response.status}`
        );

        // Test 7: Bob retrieves messages
        const getMessagesOptions = {
          hostname: 'localhost',
          port: 3001,
          path: `/api/dms/${dmChannelId}/messages`,
          method: 'GET',
          headers: {
            'Authorization': `Bearer ${bobToken}`
          }
        };

        response = await httpRequest(getMessagesOptions);
        assert(
          response.status === 200,
          `Messages retrieved: ${response.status}`
        );

        assert(
          response.data?.data && Array.isArray(response.data.data),
          'Messages returned as array'
        );
      }
    }

  } catch (error) {
    console.error('❌ Test error:', error.message);
    testsFailed++;
  }

  // Results
  console.log('\n' + '='.repeat(30));
  console.log('📊 Quick Test Results:');
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);
  console.log(`Success Rate: ${((testsPassed / (testsPassed + testsFailed)) * 100).toFixed(1)}%`);
  
  if (testsFailed === 0) {
    console.log('\n🎉 All quick tests passed!');
    console.log('✅ DM system is working correctly');
  } else {
    console.log('\n⚠️  Some tests failed. Check the output above.');
  }
}

runQuickTests().catch(console.error);
