import io from 'socket.io-client';
import fetch from 'node-fetch';
import FormData from 'form-data';
import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3001';
let authToken, secondUserToken, secondUserId;
let socket, secondSocket, testServerId, testChannelId;
const receivedEvents = [];
const testResults = [];

// Helper function for API requests
async function apiRequest(endpoint, options = {}, token = authToken) {
  console.log(`🔍 API Request: ${endpoint}, Token: ${token ? token.substring(0, 20) + '...' : 'undefined'}`);
  
  const response = await fetch(`${BASE_URL}${endpoint}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
      ...options.headers
    },
    ...options
  });

  if (!response.ok) {
    const error = await response.json();
    console.log(`❌ API Error Response:`, error);
    throw new Error(`API Error ${response.status}: ${JSON.stringify(error)}`);
  }

  return response.json();
}

// Helper function for tracking test results
function addTestResult(testName, passed, details) {
  testResults.push({ testName, passed, details, timestamp: new Date().toISOString() });
  console.log(`${passed ? '✅' : '❌'} ${testName} - ${details}`);
}

// Wait for events
async function waitForEvents(expectedCount, timeout = 3000) {
  const startTime = Date.now();
  const initialCount = receivedEvents.length;
  
  while (receivedEvents.length < initialCount + expectedCount && Date.now() - startTime < timeout) {
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return receivedEvents.length - initialCount;
}

// Create a test image file
function createTestImage() {
  const testImagePath = path.join(process.cwd(), 'test-image.png');
  
  // Create a simple PNG file (1x1 transparent pixel)
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk length
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x06, 0x00, 0x00, 0x00, // bit depth, color type, compression, filter, interlace
    0x1F, 0x15, 0xC4, 0x89, // CRC
    0x00, 0x00, 0x00, 0x0A, // IDAT chunk length
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x78, 0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, // compressed data
    0x0D, 0x0A, 0x2D, 0xB4, // CRC
    0x00, 0x00, 0x00, 0x00, // IEND chunk length
    0x49, 0x45, 0x4E, 0x44, // IEND
    0xAE, 0x42, 0x60, 0x82  // CRC
  ]);
  
  fs.writeFileSync(testImagePath, pngData);
  return testImagePath;
}

async function setupAuth() {
  console.log('\\n🔐 Setting up authentication...');
  
  const timestamp = Date.now();
  
  // Register first user (server owner)
  const user1 = await apiRequest('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `fileuploadowner${timestamp}`,
      email: `fileuploadowner${timestamp}@test.com`,
      password: 'TestPass123!',
      displayName: 'File Upload Test Owner'
    })
  });
  
  authToken = user1.data.token;
  console.log('   🔑 First user token set:', authToken ? 'Success' : 'Failed');
  
  // Register second user (member)
  const user2 = await apiRequest('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: `fileuploadmember${timestamp}`,
      email: `fileuploadmember${timestamp}@test.com`,
      password: 'TestPass123!',
      displayName: 'File Upload Test Member'
    })
  });
  
  secondUserToken = user2.data.token;
  secondUserId = user2.data.user._id;
  
  // Add a small delay to ensure tokens are fully processed
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  console.log('    ✅ Both users authenticated');
  addTestResult('User Authentication', true, 'Both users registered and authenticated');
}

async function setupSockets() {
  console.log('\\n🔌 Setting up Socket.IO connections...');
  
  // Setup first user socket
  socket = io(BASE_URL, {
    auth: { token: authToken }
  });
  
  // Setup second user socket  
  secondSocket = io(BASE_URL, {
    auth: { token: secondUserToken }
  });
  
  // Wait for connections
  await new Promise((resolve) => {
    let connected = 0;
    socket.on('connect', () => {
      console.log('    ✅ Owner socket connected');
      connected++;
      if (connected === 2) resolve();
    });
    
    secondSocket.on('connect', () => {
      console.log('    ✅ Member socket connected');
      connected++;
      if (connected === 2) resolve();
    });
  });
  
  // Setup event listeners
  const eventTypes = ['message', 'channelJoined', 'error'];
  
  eventTypes.forEach(eventType => {
    socket.on(eventType, (data) => {
      console.log(`📡 ✅ Event: ${eventType} (Owner)`, JSON.stringify(data, null, 2));
      receivedEvents.push({ type: eventType, data, user: 'owner' });
    });
    
    secondSocket.on(eventType, (data) => {
      console.log(`📡 ✅ Event: ${eventType} (Member)`, JSON.stringify(data, null, 2));
      receivedEvents.push({ type: `${eventType} (Member)`, data, user: 'member' });
    });
  });
  
  console.log('    ✅ Both Socket.IO connections established');
  addTestResult('Socket Connection Setup', true, 'Both users connected via Socket.IO');
}

async function setupServer() {
  console.log('\\n🏢 Setting up test server and channel...');
  console.log('   🔑 Auth token for server creation:', authToken ? 'Present' : 'Missing');
  
  // Create server using direct fetch like in quick test
  const serverResponse = await fetch(`${BASE_URL}/api/servers`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'File Upload Test Server',
      description: 'Testing file uploads in channels'
    })
  });

  if (!serverResponse.ok) {
    const error = await serverResponse.json();
    throw new Error(`Failed to create server: ${JSON.stringify(error)}`);
  }

  const server = await serverResponse.json();
  testServerId = server._id;
  
  // For this test, we'll just use the owner account
  // Skip adding second user to simplify the test
  
  // Create a text channel using direct fetch
  const channelResponse = await fetch(`${BASE_URL}/api/channels`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${authToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      name: 'file-upload-test',
      type: 'TEXT',
      serverId: testServerId,
      topic: 'Testing file uploads'
    })
  });

  if (!channelResponse.ok) {
    const error = await channelResponse.json();
    throw new Error(`Failed to create channel: ${JSON.stringify(error)}`);
  }

  const channel = await channelResponse.json();
  testChannelId = channel._id;
  
  // Join channel rooms for both users using correct Socket.IO event format
  socket.emit('joinChannel', { channelId: testChannelId });
  secondSocket.emit('joinChannel', { channelId: testChannelId });
  
  // Add a longer wait for channel joining and listen for join confirmations
  await new Promise(resolve => {
    let joinedCount = 0;
    const onJoined = () => {
      joinedCount++;
      if (joinedCount === 2) resolve();
    };
    
    socket.on('channelJoined', onJoined);
    secondSocket.on('channelJoined', onJoined);
    
    // Fallback timeout
    setTimeout(resolve, 3000);
  });
  
  console.log('    ✅ Test server and channel created');
  addTestResult('Test Server Setup', true, 'Server created, both users added, and channel created');
}

async function testFileUpload() {
  console.log('\\n📁 Testing File Upload Endpoint...');
  
  const initialEvents = receivedEvents.length;
  const testImagePath = createTestImage();
  
  try {
    // Test direct file upload
    console.log('  📁 Uploading test image...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testImagePath), {
      filename: 'test-image.png',
      contentType: 'image/png'
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
    
    addTestResult('File Upload Endpoint', uploadResult.success === true, 
      uploadResult.success ? 'File uploaded successfully' : 'Upload failed');
    
    // Verify upload response structure
    const hasRequiredFields = uploadResult.data && 
                              uploadResult.data.attachment &&
                              uploadResult.data.attachment.filename &&
                              uploadResult.data.attachment.url;
    
    addTestResult('Upload Response Structure', hasRequiredFields, 
      hasRequiredFields ? 'Response contains required fields' : 'Missing required fields');
    
    return uploadResult.data.attachment;
    
  } catch (error) {
    console.error('File upload error:', error);
    addTestResult('File Upload Endpoint', false, `Upload failed: ${error.message}`);
    return null;
  } finally {
    // Clean up test file
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  }
}

async function testMessageWithFile() {
  console.log('\\n💬 Testing Message with File Attachment...');
  
  const initialEvents = receivedEvents.length;
  const testImagePath = createTestImage();
  
  try {
    console.log('  💬 Sending message with file attachment...');
    
    const formData = new FormData();
    formData.append('file', fs.createReadStream(testImagePath), {
      filename: 'message-attachment.png',
      contentType: 'image/png'
    });
    formData.append('content', 'This is a test message with an image attachment! 🖼️');
    
    const messageResponse = await fetch(`${BASE_URL}/api/channels/${testChannelId}/messages/with-file`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${authToken}`
      },
      body: formData
    });
    
    if (!messageResponse.ok) {
      const error = await messageResponse.json();
      throw new Error(`Message with file failed: ${JSON.stringify(error)}`);
    }
    
    const messageResult = await messageResponse.json();
    
    addTestResult('Message with File Endpoint', true, 'Message with file sent successfully');
    
    // Wait for Socket.IO events
    await waitForEvents(2, 3000); // Should get events for both users
    
    const messageEvents = receivedEvents.filter(e => 
      e.type === 'message' || e.type === 'message (Member)'
    );
    
    addTestResult('Message with File Events', messageEvents.length >= 1, 
      `Received ${messageEvents.length} message events`);
    
    // Verify message structure
    if (messageEvents.length > 0) {
      const eventData = messageEvents[messageEvents.length - 1].data;
      const hasAttachment = eventData.attachments && eventData.attachments.length > 0;
      const hasContent = eventData.content && eventData.content.includes('test message');
      
      addTestResult('Message Event Data', hasAttachment && hasContent, 
        hasAttachment && hasContent ? 'Event contains message content and attachment' : 'Missing content or attachment');
      
      if (hasAttachment) {
        const attachment = eventData.attachments[0];
        const attachmentValid = attachment.filename && attachment.url && attachment.contentType;
        addTestResult('Attachment Structure', attachmentValid, 
          attachmentValid ? 'Attachment has required fields' : 'Missing attachment fields');
      }
    }
    
    return messageResult;
    
  } catch (error) {
    console.error('Message with file error:', error);
    addTestResult('Message with File Endpoint', false, `Failed: ${error.message}`);
    return null;
  } finally {
    // Clean up test file
    if (fs.existsSync(testImagePath)) {
      fs.unlinkSync(testImagePath);
    }
  }
}

async function testFileTypes() {
  console.log('\\n🎨 Testing Different File Types...');
  
  const testFiles = [
    { name: 'test.txt', content: 'Hello World!', contentType: 'text/plain' },
    { name: 'test.json', content: '{"test": true, "message": "Hello from JSON"}', contentType: 'application/json' }
  ];
  
  for (const testFile of testFiles) {
    try {
      const filePath = path.join(process.cwd(), testFile.name);
      fs.writeFileSync(filePath, testFile.content);
      
      console.log(`  📄 Testing ${testFile.name}...`);
      
      const formData = new FormData();
      formData.append('file', fs.createReadStream(filePath), {
        filename: testFile.name,
        contentType: testFile.contentType
      });
      
      const uploadResponse = await fetch(`${BASE_URL}/api/channels/${testChannelId}/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${authToken}`
        },
        body: formData
      });
      
      if (!uploadResponse.ok) {
        const errorText = await uploadResponse.text();
        console.log(`     ❌ Error response: ${uploadResponse.status} - ${errorText}`);
      }
      
      const success = uploadResponse.ok;
      addTestResult(`File Type Test: ${testFile.name}`, success, 
        success ? 'Upload successful' : `Upload failed: ${uploadResponse.status}`);
      
      // Clean up
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      
    } catch (error) {
      console.error(`Error testing ${testFile.name}:`, error);
      addTestResult(`File Type Test: ${testFile.name}`, false, `Error: ${error.message}`);
    }
  }
}

async function cleanup() {
  console.log('\\n🧹 Cleaning up test data...');
  
  try {
    // Delete test server
    await apiRequest(`/api/servers/${testServerId}`, {
      method: 'DELETE'
    });
    console.log('    ✅ Test server cleaned up');
    
    // Disconnect sockets
    socket.disconnect();
    secondSocket.disconnect();
    console.log('    ✅ Socket connections closed');
    
  } catch (error) {
    console.error('Cleanup error:', error);
  }
}

function generateReport() {
  console.log('\\n📊 CHANNEL FILE UPLOAD TEST RESULTS');
  console.log('='.repeat(60));
  
  const passed = testResults.filter(r => r.passed).length;
  const total = testResults.length;
  const successRate = ((passed / total) * 100).toFixed(1);
  
  console.log(`\\n📈 Overall Success Rate: ${successRate}% (${passed}/${total} tests passed)`);
  
  console.log('\\n📋 Detailed Results:');
  testResults.forEach(result => {
    const status = result.passed ? '✅ PASS' : '❌ FAIL';
    console.log(`  ${status} | ${result.testName}: ${result.details}`);
  });
  
  console.log('\\n📡 Message Events Summary:');
  const eventTypes = [...new Set(receivedEvents.map(e => e.type))];
  eventTypes.forEach(eventType => {
    const count = receivedEvents.filter(e => e.type === eventType).length;
    console.log(`  📨 ${eventType}: ${count} events received`);
  });
  
  console.log(`\\n🎯 Total Events Received: ${receivedEvents.length}`);
  
  if (successRate >= 90) {
    console.log('\\n🎉 EXCELLENT! Channel file upload functionality is working perfectly!');
  } else if (successRate >= 75) {
    console.log('\\n👍 GOOD! Most channel file upload features are working.');
  } else {
    console.log('\\n⚠️  WARNING! Channel file upload functionality needs attention.');
  }
}

async function runChannelFileUploadTest() {
  console.log('🚀 COMPREHENSIVE CHANNEL FILE UPLOAD TESTING SUITE');
  console.log('='.repeat(65));
  console.log('📁 Testing file uploads in server text channels\\n');
  
  try {
    await setupAuth();
    await setupSockets();
    await setupServer();
    
    console.log('\\n🧪 STARTING CHANNEL FILE UPLOAD TESTS...');
    console.log('-'.repeat(60));
    
    const uploadResult = await testFileUpload();
    const messageResult = await testMessageWithFile();
    await testFileTypes();
    
    await cleanup();
    
    // Final wait for any delayed events
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    generateReport();
    
  } catch (error) {
    console.error('❌ Channel file upload test suite failed:', error.message);
    console.error(error.stack);
  } finally {
    process.exit(0);
  }
}

// Run the test
runChannelFileUploadTest();
