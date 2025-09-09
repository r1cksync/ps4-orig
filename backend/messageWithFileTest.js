import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3001';

async function testMessageWithFileOnly() {
  console.log('🧪 Testing Message with File Endpoint Only');
  console.log('='.repeat(50));
  
  let authToken, testServerId, testChannelId;
  
  try {
    // 1. Register user
    console.log('\\n1️⃣ Creating test user...');
    const timestamp = Date.now();
    const user = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `msgtest${timestamp}`,
        email: `msgtest${timestamp}@test.com`,
        password: 'TestPass123!',
        displayName: 'Message Test User'
      })
    });
    
    if (!user.ok) throw new Error('Failed to create user');
    const userData = await user.json();
    authToken = userData.data.token;
    console.log('   ✅ User created');

    // 2. Create server
    console.log('\\n2️⃣ Creating test server...');
    const server = await fetch(`${BASE_URL}/api/servers`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'Message Test Server',
        description: 'Testing message with file'
      })
    });
    
    if (!server.ok) throw new Error('Failed to create server');
    const serverData = await server.json();
    testServerId = serverData._id;
    console.log('   ✅ Server created');

    // 3. Create channel
    console.log('\\n3️⃣ Creating test channel...');
    const channel = await fetch(`${BASE_URL}/api/channels`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        name: 'message-test',
        type: 'TEXT',
        serverId: testServerId
      })
    });
    
    if (!channel.ok) throw new Error('Failed to create channel');
    const channelData = await channel.json();
    testChannelId = channelData._id;
    console.log('   ✅ Channel created');

    // 4. Create test file
    console.log('\\n4️⃣ Creating test file...');
    const testFilePath = path.join(process.cwd(), 'message-test.txt');
    fs.writeFileSync(testFilePath, 'Hello from message test!');
    console.log('   ✅ Test file created');

    // 5. Test message with file (this is what's causing the crash)
    console.log('\\n5️⃣ Testing message with file...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath), {
      filename: 'message-test.txt',
      contentType: 'text/plain'
    });
    formData.append('content', 'This is a test message with a file!');

    console.log('   📤 Sending request...');
    const messageResponse = await fetch(`${BASE_URL}/api/channels/${testChannelId}/messages/with-file`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });

    console.log('   📨 Response status:', messageResponse.status);
    
    if (!messageResponse.ok) {
      const error = await messageResponse.json();
      console.log('   ❌ Error response:', error);
      throw new Error(`Message with file failed: ${JSON.stringify(error)}`);
    }

    const messageResult = await messageResponse.json();
    console.log('   ✅ Message sent successfully!');
    console.log('   💬 Message ID:', messageResult._id);
    console.log('   📎 Attachments:', messageResult.attachments?.length || 0);

    // Cleanup
    console.log('\\n6️⃣ Cleaning up...');
    await fetch(`${BASE_URL}/api/servers/${testServerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    
    console.log('   ✅ Cleanup completed');
    console.log('\\n🎉 MESSAGE WITH FILE TEST PASSED!');
    
  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
    console.error('   📋 Full error:', error);
    
    // Cleanup on error
    try {
      if (testServerId && authToken) {
        await fetch(`${BASE_URL}/api/servers/${testServerId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      }
      
      const testFilePath = path.join(process.cwd(), 'message-test.txt');
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError.message);
    }
  }
}

testMessageWithFileOnly();
