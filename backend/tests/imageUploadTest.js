#!/usr/bin/env node
/**
 * DM Image Upload Test - Test file upload functionality in DMs
 */

import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('🖼️ DM Image Upload Test');
console.log('='.repeat(30));

// Generate a simple test image (1x1 pixel PNG)
function generateTestImage() {
  // This is a minimal 1x1 pixel transparent PNG
  const pngData = Buffer.from([
    0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, // PNG signature
    0x00, 0x00, 0x00, 0x0D, // IHDR chunk size
    0x49, 0x48, 0x44, 0x52, // IHDR
    0x00, 0x00, 0x00, 0x01, // width: 1
    0x00, 0x00, 0x00, 0x01, // height: 1
    0x08, 0x06, 0x00, 0x00, 0x00, // bit depth: 8, color type: 6 (RGBA), compression: 0, filter: 0, interlace: 0
    0x1F, 0x15, 0xC4, 0x89, // IHDR CRC
    0x00, 0x00, 0x00, 0x0B, // IDAT chunk size
    0x49, 0x44, 0x41, 0x54, // IDAT
    0x78, 0x9C, 0x62, 0x00, 0x02, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, // compressed data
    0x0A, 0x2D, 0xB4, // IDAT CRC
    0x00, 0x00, 0x00, 0x00, // IEND chunk size
    0x49, 0x45, 0x4E, 0x44, // IEND
    0xAE, 0x42, 0x60, 0x82  // IEND CRC
  ]);
  
  return pngData;
}

// Create multipart form data manually
function createMultipartForm(imageBuffer, textData = {}) {
  const boundary = '----formdata-test-' + Math.random().toString(36);
  const CRLF = '\r\n';
  
  let form = '';
  
  // Add text fields
  for (const [key, value] of Object.entries(textData)) {
    form += `--${boundary}${CRLF}`;
    form += `Content-Disposition: form-data; name="${key}"${CRLF}${CRLF}`;
    form += `${value}${CRLF}`;
  }
  
  // Add file
  form += `--${boundary}${CRLF}`;
  form += `Content-Disposition: form-data; name="file"; filename="test-image.png"${CRLF}`;
  form += `Content-Type: image/png${CRLF}${CRLF}`;
  
  const formBuffer = Buffer.from(form, 'utf8');
  const endBoundary = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
  
  return {
    buffer: Buffer.concat([formBuffer, imageBuffer, endBoundary]),
    contentType: `multipart/form-data; boundary=${boundary}`
  };
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
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) {
      if (typeof data === 'string') {
        req.write(data);
      } else if (Buffer.isBuffer(data)) {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    
    req.end();
  });
}

async function runImageUploadTest() {
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
    console.log('\n👥 Setting up test users...');

    // Create unique test users
    const timestamp = Date.now();
    const aliceData = {
      username: `alice_img_${timestamp}`,
      email: `alice.img.${timestamp}@test.com`,
      password: 'testpass123'
    };

    const bobData = {
      username: `bob_img_${timestamp}`,
      email: `bob.img.${timestamp}@test.com`,
      password: 'testpass123'
    };

    // Create Alice
    const aliceAuth = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, aliceData);

    test(aliceAuth.status === 201, `Alice created: ${aliceAuth.status}`);
    const aliceToken = aliceAuth.data?.data?.token;
    const aliceId = aliceAuth.data?.data?.user?.id;

    // Create Bob
    const bobAuth = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, bobData);

    test(bobAuth.status === 201, `Bob created: ${bobAuth.status}`);
    const bobToken = bobAuth.data?.data?.token;
    const bobId = bobAuth.data?.data?.user?.id;

    if (!aliceToken || !bobToken) {
      console.log('❌ Failed to create users');
      return;
    }

    console.log('\n🤝 Setting up friendship...');

    // Send friend request
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
      username: bobAuth.data.data.user.username,
      discriminator: bobAuth.data.data.user.discriminator
    });

    test(friendRequest.status === 201, `Friend request sent: ${friendRequest.status}`);
    const friendshipId = friendRequest.data?.friendship?._id;

    // Accept friend request
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

    test(acceptRequest.status === 200, `Friend request accepted: ${acceptRequest.status}`);

    console.log('\n📞 Creating DM channel...');

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

    test(createDM.status === 201, `DM channel created: ${createDM.status}`);
    const dmChannelId = createDM.data?.data?._id;

    if (!dmChannelId) {
      console.log('❌ No DM channel ID received');
      return;
    }

    console.log('\n🖼️ Testing image upload...');

    // Generate test image
    const imageBuffer = generateTestImage();
    console.log(`Generated test image: ${imageBuffer.length} bytes`);

    // Test 1: Upload file only
    const formData = createMultipartForm(imageBuffer);
    
    const uploadResponse = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/dms/${dmChannelId}/upload`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aliceToken}`,
        'Content-Type': formData.contentType,
        'Content-Length': formData.buffer.length
      }
    }, formData.buffer);

    console.log('Upload response:', uploadResponse.status, uploadResponse.data);
    
    test(
      uploadResponse.status === 201,
      `Image upload: ${uploadResponse.status}`
    );

    const attachment = uploadResponse.data?.data?.attachment;
    test(attachment && attachment.filename === 'test-image.png', 'Attachment metadata correct');
    test(attachment && attachment.contentType === 'image/png', 'Content type correct');

    console.log('\n💬 Testing message with file...');

    // Test 2: Send message with file attachment
    const messageFormData = createMultipartForm(imageBuffer, {
      content: 'Here is a test image! 🖼️'
    });

    const messageWithFile = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/dms/${dmChannelId}/messages/with-file`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${aliceToken}`,
        'Content-Type': messageFormData.contentType,
        'Content-Length': messageFormData.buffer.length
      }
    }, messageFormData.buffer);

    console.log('Message with file response:', messageWithFile.status, messageWithFile.data);

    test(
      messageWithFile.status === 201,
      `Message with file: ${messageWithFile.status}`
    );

    const messageData = messageWithFile.data?.data;
    test(messageData && messageData.content === 'Here is a test image! 🖼️', 'Message content correct');
    test(messageData && messageData.attachments && messageData.attachments.length > 0, 'Message has attachment');

    console.log('\n📨 Verifying messages...');

    // Get messages to verify upload
    const getMessages = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/dms/${dmChannelId}/messages`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${bobToken}` }
    });

    test(getMessages.status === 200, `Get messages: ${getMessages.status}`);
    
    const messages = getMessages.data?.data;
    test(Array.isArray(messages) && messages.length > 0, `Messages retrieved: ${messages?.length || 0}`);
    
    const messageWithAttachment = messages?.find(m => m.attachments && m.attachments.length > 0);
    test(messageWithAttachment !== undefined, 'Found message with attachment');

    if (messageWithAttachment) {
      const att = messageWithAttachment.attachments[0];
      test(att.filename === 'test-image.png', 'Retrieved attachment filename correct');
      test(att.contentType === 'image/png', 'Retrieved attachment content type correct');
      console.log(`📎 Attachment URL: ${att.url}`);
    }

  } catch (error) {
    console.error('Test error:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 IMAGE UPLOAD TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${tests}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${tests - passed}`);
  console.log(`Success Rate: ${((passed / tests) * 100).toFixed(1)}%`);

  if (passed === tests) {
    console.log('\n🎉 ALL IMAGE UPLOAD TESTS PASSED! 🎉');
    console.log('✅ Image upload functionality is working correctly!');
    console.log('🚀 Features verified:');
    console.log('   • File upload to S3');
    console.log('   • Message with file attachment');
    console.log('   • Proper attachment metadata');
    console.log('   • File retrieval in messages');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED');
    console.log('Please check the failed tests above and fix the issues.');
  }

  console.log('\n💡 Next steps:');
  console.log('   • Test different file types (JPEG, GIF, PDF)');
  console.log('   • Test file size limits');
  console.log('   • Test file permissions and access');
  console.log('   • Implement image resizing/thumbnails');
}

runImageUploadTest();
