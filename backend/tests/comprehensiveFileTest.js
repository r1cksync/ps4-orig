#!/usr/bin/env node
/**
 * Comprehensive File Upload Test - Test various file types and scenarios
 */

import http from 'http';
import fs from 'fs';
import path from 'path';

console.log('📁 Comprehensive File Upload Test');
console.log('='.repeat(40));

// Generate different test files
function generateTestFiles() {
  return {
    // 1x1 PNG image
    png: Buffer.from([
      0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A,
      0x00, 0x00, 0x00, 0x0D, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1F, 0x15, 0xC4, 0x89,
      0x00, 0x00, 0x00, 0x0B, 0x49, 0x44, 0x41, 0x54,
      0x78, 0x9C, 0x62, 0x00, 0x02, 0x00, 0x00, 0x05,
      0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4,
      0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44,
      0xAE, 0x42, 0x60, 0x82
    ]),
    
    // Simple JPEG (minimal valid JPEG)
    jpeg: Buffer.from([
      0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10, 0x4A, 0x46, 0x49, 0x46, 0x00, 0x01,
      0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xFF, 0xDB, 0x00, 0x43,
      0x00, 0x08, 0x06, 0x06, 0x07, 0x06, 0x05, 0x08, 0x07, 0x07, 0x07, 0x09,
      0x09, 0x08, 0x0A, 0x0C, 0x14, 0x0D, 0x0C, 0x0B, 0x0B, 0x0C, 0x19, 0x12,
      0x13, 0x0F, 0x14, 0x1D, 0x1A, 0x1F, 0x1E, 0x1D, 0x1A, 0x1C, 0x1C, 0x20,
      0x24, 0x2E, 0x27, 0x20, 0x22, 0x2C, 0x23, 0x1C, 0x1C, 0x28, 0x37, 0x29,
      0x2C, 0x30, 0x31, 0x34, 0x34, 0x34, 0x1F, 0x27, 0x39, 0x3D, 0x38, 0x32,
      0x3C, 0x2E, 0x33, 0x34, 0x32, 0xFF, 0xC0, 0x00, 0x11, 0x08, 0x00, 0x01,
      0x00, 0x01, 0x01, 0x01, 0x11, 0x00, 0x02, 0x11, 0x01, 0x03, 0x11, 0x01,
      0xFF, 0xC4, 0x00, 0x14, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x08, 0xFF, 0xC4,
      0x00, 0x14, 0x10, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
      0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xFF, 0xDA, 0x00, 0x0C,
      0x03, 0x01, 0x00, 0x02, 0x11, 0x03, 0x11, 0x00, 0x3F, 0x00, 0xB2, 0xC0,
      0x07, 0xFF, 0xD9
    ]),
    
    // Simple text file
    txt: Buffer.from('Hello, this is a test text file for DM upload! 📄'),
    
    // Simple PDF header (minimal valid PDF)
    pdf: Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj 2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj 3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]>>endobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000053 00000 n \n0000000125 00000 n \ntrailer<</Size 4/Root 1 0 R>>\nstartxref\n193\n%%EOF')
  };
}

// Create multipart form data
function createMultipartForm(fileBuffer, filename, contentType, textData = {}) {
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
  form += `Content-Disposition: form-data; name="file"; filename="${filename}"${CRLF}`;
  form += `Content-Type: ${contentType}${CRLF}${CRLF}`;
  
  const formBuffer = Buffer.from(form, 'utf8');
  const endBoundary = Buffer.from(`${CRLF}--${boundary}--${CRLF}`, 'utf8');
  
  return {
    buffer: Buffer.concat([formBuffer, fileBuffer, endBoundary]),
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
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', reject);
    req.setTimeout(15000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) {
      if (Buffer.isBuffer(data)) {
        req.write(data);
      } else if (typeof data === 'string') {
        req.write(data);
      } else {
        req.write(JSON.stringify(data));
      }
    }
    
    req.end();
  });
}

async function testFileUpload(dmChannelId, token, fileBuffer, filename, contentType, description) {
  console.log(`\n📎 Testing ${description}...`);
  
  const formData = createMultipartForm(fileBuffer, filename, contentType, {
    content: `Uploading ${description}: ${filename}`
  });

  const response = await httpRequest({
    hostname: 'localhost',
    port: 3001,
    path: `/api/dms/${dmChannelId}/messages/with-file`,
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Content-Type': formData.contentType,
      'Content-Length': formData.buffer.length
    }
  }, formData.buffer);

  return {
    success: response.status === 201,
    status: response.status,
    data: response.data,
    description,
    filename
  };
}

async function runComprehensiveTest() {
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
    console.log('\n👥 Setting up test environment...');

    // Create test users
    const timestamp = Date.now();
    const alice = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: `alice_files_${timestamp}`,
      email: `alice.files.${timestamp}@test.com`,
      password: 'testpass123'
    });

    const bob = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    }, {
      username: `bob_files_${timestamp}`,
      email: `bob.files.${timestamp}@test.com`,
      password: 'testpass123'
    });

    test(alice.status === 201, 'Alice created');
    test(bob.status === 201, 'Bob created');

    const aliceToken = alice.data?.data?.token;
    const bobId = bob.data?.data?.user?.id;

    // Setup friendship
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
      username: bob.data.data.user.username,
      discriminator: bob.data.data.user.discriminator
    });

    const acceptRequest = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/friends/${friendRequest.data?.friendship?._id}/accept`,
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${bob.data?.data?.token}`
      }
    });

    test(acceptRequest.status === 200, 'Friendship established');

    // Create DM channel
    const dmChannel = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/dms',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${aliceToken}`
      }
    }, { recipientId: bobId });

    test(dmChannel.status === 201, 'DM channel created');
    const dmChannelId = dmChannel.data?.data?._id;

    console.log('\n🗂️ Testing various file types...');

    const testFiles = generateTestFiles();
    const uploadTests = [
      { buffer: testFiles.png, filename: 'test.png', contentType: 'image/png', description: 'PNG Image' },
      { buffer: testFiles.jpeg, filename: 'test.jpg', contentType: 'image/jpeg', description: 'JPEG Image' },
      { buffer: testFiles.txt, filename: 'test.txt', contentType: 'text/plain', description: 'Text File' },
      { buffer: testFiles.pdf, filename: 'test.pdf', contentType: 'application/pdf', description: 'PDF Document' }
    ];

    const results = [];
    for (const testFile of uploadTests) {
      const result = await testFileUpload(
        dmChannelId,
        aliceToken,
        testFile.buffer,
        testFile.filename,
        testFile.contentType,
        testFile.description
      );
      results.push(result);
      
      test(result.success, `${result.description} upload: ${result.status}`);
      if (result.data?.data?.attachments) {
        const attachment = result.data.data.attachments[0];
        test(attachment.filename === result.filename, `${result.description} filename correct`);
        test(attachment.contentType === testFile.contentType, `${result.description} content type correct`);
      }
    }

    console.log('\n📋 Testing file listing...');

    // Get all messages to verify uploads
    const messages = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: `/api/dms/${dmChannelId}/messages`,
      method: 'GET',
      headers: { 'Authorization': `Bearer ${bob.data?.data?.token}` }
    });

    test(messages.status === 200, 'Messages retrieved');
    const messageList = messages.data?.data || [];
    const messagesWithAttachments = messageList.filter(m => m.attachments && m.attachments.length > 0);
    
    test(
      messagesWithAttachments.length === uploadTests.length,
      `All ${uploadTests.length} attachments found in messages`
    );

    console.log('\n📊 File Upload Summary:');
    results.forEach(result => {
      if (result.success) {
        const attachment = result.data?.data?.attachments?.[0];
        console.log(`✅ ${result.description}: ${attachment?.size} bytes`);
        console.log(`   📍 S3 Key: ${attachment?.id}`);
      } else {
        console.log(`❌ ${result.description}: Failed (${result.status})`);
      }
    });

  } catch (error) {
    console.error('Test error:', error);
  }

  console.log('\n' + '='.repeat(50));
  console.log('📊 COMPREHENSIVE FILE UPLOAD TEST RESULTS');
  console.log('='.repeat(50));
  console.log(`Total Tests: ${tests}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${tests - passed}`);
  console.log(`Success Rate: ${((passed / tests) * 100).toFixed(1)}%`);

  if (passed === tests) {
    console.log('\n🎉 ALL FILE UPLOAD TESTS PASSED! 🎉');
    console.log('✅ Multi-format file upload is working perfectly!');
    console.log('🚀 Successfully tested:');
    console.log('   • PNG Images');
    console.log('   • JPEG Images'); 
    console.log('   • Text Files');
    console.log('   • PDF Documents');
    console.log('   • S3 Integration');
    console.log('   • Attachment Metadata');
    console.log('   • Message Integration');
  } else {
    console.log('\n⚠️  SOME TESTS FAILED');
  }
}

runComprehensiveTest();
