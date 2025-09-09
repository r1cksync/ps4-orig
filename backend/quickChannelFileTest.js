import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3001';

// Simple test for channel file uploads
async function quickFileUploadTest() {
  console.log('🚀 Quick Channel File Upload Test');
  console.log('='.repeat(40));
  
  let authToken, testServerId, testChannelId;
  
  try {
    // 1. Register user
    console.log('\\n1️⃣ Creating test user...');
    const timestamp = Date.now();
    const user = await fetch(`${BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: `quicktest${timestamp}`,
        email: `quicktest${timestamp}@test.com`,
        password: 'TestPass123!',
        displayName: 'Quick Test User'
      })
    });
    
    if (!user.ok) throw new Error('Failed to create user');
    const userData = await user.json();
    console.log('   📋 Full user data:', JSON.stringify(userData, null, 2));
    authToken = userData.data.token;
    console.log('   🔑 Auth token:', authToken ? 'Present' : 'Missing');
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
        name: 'Quick Test Server',
        description: 'Testing file uploads'
      })
    });
    
    if (!server.ok) {
      const error = await server.json();
      throw new Error(`Failed to create server: ${JSON.stringify(error)}`);
    }
    const serverData = await server.json();
    console.log('   📋 Server data structure:', Object.keys(serverData));
    testServerId = serverData.data ? serverData.data._id : serverData._id;
    console.log('   🏢 Server ID:', testServerId);
    console.log('   👤 Server owner:', serverData.owner);
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
        name: 'file-test',
        type: 'TEXT',
        serverId: testServerId
      })
    });
    
    if (!channel.ok) {
      const error = await channel.json();
      throw new Error(`Failed to create channel: ${JSON.stringify(error)}`);
    }
    const channelData = await channel.json();
    testChannelId = channelData._id;
    console.log('   ✅ Channel created');
    
    // 4. Create test file
    console.log('\\n4️⃣ Creating test file...');
    const testFilePath = path.join(process.cwd(), 'quick-test.txt');
    fs.writeFileSync(testFilePath, 'Hello from file upload test!');
    console.log('   ✅ Test file created');
    
    // 5. Test file upload
    console.log('\\n5️⃣ Testing file upload...');
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testFilePath), {
      filename: 'quick-test.txt',
      contentType: 'text/plain'
    });
    
    const uploadResponse = await fetch(`${BASE_URL}/api/channels/${testChannelId}/upload`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });
    
    if (!uploadResponse.ok) {
      const error = await uploadResponse.json();
      throw new Error(`Upload failed: ${JSON.stringify(error)}`);
    }
    
    const uploadResult = await uploadResponse.json();
    console.log('   ✅ File uploaded successfully!');
    console.log('   📁 Filename:', uploadResult.data.attachment.filename);
    console.log('   🔗 URL:', uploadResult.data.attachment.url);
    console.log('   📄 Type:', uploadResult.data.attachment.contentType);
    
    // 6. Test message with file
    console.log('\\n6️⃣ Testing message with file...');
    const messageFormData = new FormData();
    messageFormData.append('file', fs.createReadStream(testFilePath), {
      filename: 'message-test.txt',
      contentType: 'text/plain'
    });
    messageFormData.append('content', 'This message has a file attachment!');
    
    const messageResponse = await fetch(`${BASE_URL}/api/channels/${testChannelId}/messages/with-file`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: messageFormData
    });
    
    if (!messageResponse.ok) {
      const error = await messageResponse.json();
      throw new Error(`Message with file failed: ${JSON.stringify(error)}`);
    }
    
    const messageResult = await messageResponse.json();
    console.log('   ✅ Message with file sent successfully!');
    console.log('   💬 Content:', messageResult.content);
    console.log('   📎 Attachments:', messageResult.attachments.length);
    
    // 7. Cleanup
    console.log('\\n7️⃣ Cleaning up...');
    
    // Delete server
    await fetch(`${BASE_URL}/api/servers/${testServerId}`, {
      method: 'DELETE',
      headers: { 'Authorization': `Bearer ${authToken}` }
    });
    
    // Delete test file
    if (fs.existsSync(testFilePath)) {
      fs.unlinkSync(testFilePath);
    }
    
    console.log('   ✅ Cleanup completed');
    
    console.log('\\n🎉 ALL TESTS PASSED! Channel file uploads are working perfectly!');
    
  } catch (error) {
    console.error('\\n❌ Test failed:', error.message);
    
    // Cleanup on error
    try {
      if (testServerId && authToken) {
        await fetch(`${BASE_URL}/api/servers/${testServerId}`, {
          method: 'DELETE',
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
      }
      
      const testFilePath = path.join(process.cwd(), 'quick-test.txt');
      if (fs.existsSync(testFilePath)) {
        fs.unlinkSync(testFilePath);
      }
    } catch (cleanupError) {
      console.error('Cleanup error:', cleanupError.message);
    }
  }
}

// Run the quick test
quickFileUploadTest();
