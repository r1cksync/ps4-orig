#!/usr/bin/env node

import http from 'http';

async function httpRequest(options, data = null) {
  return new Promise((resolve, reject) => {
    console.log('Making request with options:', options);
    console.log('Request data:', data);
    
    const req = http.request(options, (res) => {
      console.log('Response status:', res.statusCode);
      console.log('Response headers:', res.headers);
      
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        console.log('Response body:', body);
        try {
          resolve({
            status: res.statusCode,
            data: body ? JSON.parse(body) : null
          });
        } catch (e) {
          console.log('JSON parse error:', e.message);
          resolve({
            status: res.statusCode,
            data: body
          });
        }
      });
    });

    req.on('error', (error) => {
      console.log('Request error:', error);
      reject(error);
    });
    
    req.setTimeout(10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });
    
    if (data) {
      const jsonData = JSON.stringify(data);
      console.log('Writing data:', jsonData);
      req.write(jsonData);
    }
    
    req.end();
  });
}

async function testAuth() {
  console.log('Testing authentication endpoint...');
  
  try {
    const result = await httpRequest({
      hostname: 'localhost',
      port: 3001,
      path: '/api/auth/register',
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    }, {
      username: 'debug_user',
      email: 'debug@test.com',
      password: 'testpass123'
    });
    
    console.log('Final result:', result);
  } catch (error) {
    console.log('Test failed:', error);
  }
}

testAuth();
