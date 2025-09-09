import axios from 'axios';

const baseURL = 'http://localhost:3001/api';
let token = null;
let userId = null;
let serverId = null;

async function makeRequest(method, endpoint, data = null) {
  try {
    const config = {
      method,
      url: `${baseURL}${endpoint}`,
      headers: {
        'Content-Type': 'application/json',
        ...(token && { Authorization: `Bearer ${token}` })
      }
    };

    if (data) config.data = data;
    const response = await axios(config);
    return { success: true, data: response.data, status: response.status };
  } catch (error) {
    return {
      success: false,
      error: error.response?.data || error.message,
      status: error.response?.status || 500
    };
  }
}

async function debugMemberIssue() {
  console.log('🔍 Debugging member fetch issue...');

  // Register user
  const registerData = {
    email: `debug_${Date.now()}@example.com`,
    password: 'testpassword123',
    name: `Debug User ${Date.now()}`,
    username: `debuguser_${Date.now()}`
  };

  const registerResult = await makeRequest('POST', '/auth/register', registerData);
  if (registerResult.success && registerResult.data.success) {
    token = registerResult.data.data.token;
    userId = registerResult.data.data.user.id;
    console.log('✅ User registered:', userId);
  } else {
    console.log('❌ Registration failed:', registerResult.error);
    return;
  }

  // Create server
  const serverData = {
    name: `Debug Server ${Date.now()}`,
    description: 'Debug server for member issue'
  };

  const serverResult = await makeRequest('POST', '/servers', serverData);
  if (serverResult.success) {
    serverId = serverResult.data._id;
    console.log('✅ Server created:', serverId);
    console.log('📋 Server data:', JSON.stringify(serverResult.data, null, 2));
  } else {
    console.log('❌ Server creation failed:', serverResult.error);
    return;
  }

  // Get server details to check members
  const serverDetails = await makeRequest('GET', `/servers/${serverId}`);
  if (serverDetails.success) {
    console.log('📋 Server details:');
    console.log('   Owner:', serverDetails.data.owner);
    console.log('   Members:', JSON.stringify(serverDetails.data.members, null, 2));
    console.log('   Current User ID:', userId);
  }

  // Try to fetch members
  const membersResult = await makeRequest('GET', `/servers/${serverId}/members`);
  console.log('📋 Members fetch result:', JSON.stringify(membersResult, null, 2));
}

debugMemberIssue().catch(console.error);
