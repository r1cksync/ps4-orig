#!/usr/bin/env node
/**
 * Simple Test to verify server connectivity and basic functionality
 */

console.log('🔍 Simple DM System Test');
console.log('='.repeat(40));

// Test server connectivity
async function testServerConnection() {
  console.log('📡 Testing server connection...');
  
  try {
    const http = await import('http');
    
    return new Promise((resolve) => {
      const req = http.get('http://localhost:3001/health', (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`✅ Server responded with status: ${res.statusCode}`);
          console.log(`📊 Health data: ${data}`);
          resolve(true);
        });
      });

      req.on('error', (error) => {
        console.log(`❌ Connection failed: ${error.message}`);
        resolve(false);
      });

      req.setTimeout(5000, () => {
        req.destroy();
        console.log('❌ Request timeout');
        resolve(false);
      });
    });
  } catch (error) {
    console.log(`❌ Error: ${error.message}`);
    return false;
  }
}

// Test basic auth endpoint
async function testAuth() {
  console.log('\n🔐 Testing authentication...');
  
  try {
    const http = await import('http');
    const postData = JSON.stringify({
      username: 'test_user_simple',
      email: 'test.simple@example.com',
      password: 'testpass123'
    });

    return new Promise((resolve) => {
      const options = {
        hostname: 'localhost',
        port: 3001,
        path: '/api/auth/register',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData)
        }
      };

      const req = http.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
          console.log(`📝 Auth response status: ${res.statusCode}`);
          if (res.statusCode === 201 || res.statusCode === 400) {
            console.log('✅ Auth endpoint is working');
            resolve(true);
          } else {
            console.log(`❌ Unexpected status: ${res.statusCode}`);
            console.log(`Response: ${data}`);
            resolve(false);
          }
        });
      });

      req.on('error', (error) => {
        console.log(`❌ Auth test failed: ${error.message}`);
        resolve(false);
      });

      req.write(postData);
      req.end();
    });
  } catch (error) {
    console.log(`❌ Auth test error: ${error.message}`);
    return false;
  }
}

// Main test function
async function runSimpleTests() {
  console.log('Starting simple connectivity tests...\n');
  
  const serverOk = await testServerConnection();
  if (!serverOk) {
    console.log('\n💥 Server connection failed. Cannot proceed with tests.');
    process.exit(1);
  }
  
  const authOk = await testAuth();
  
  console.log('\n' + '='.repeat(40));
  console.log('📋 Simple Test Results:');
  console.log(`Server Connection: ${serverOk ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`Authentication: ${authOk ? '✅ PASS' : '❌ FAIL'}`);
  
  if (serverOk && authOk) {
    console.log('\n🎉 Basic functionality is working!');
    console.log('🚀 You can now run the full test suite:');
    console.log('   node runDMTests.js');
    console.log('   node testSocketDM.js');
  } else {
    console.log('\n⚠️  Some basic tests failed. Check your server configuration.');
  }
}

// Run tests
runSimpleTests().catch(error => {
  console.error('💥 Test runner error:', error);
  process.exit(1);
});
