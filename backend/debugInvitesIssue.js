import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

class InviteDebugger {
  constructor() {
    this.token = null;
    this.serverId = null;
  }

  async setup() {
    console.log('🔍 Debugging invite creation issue...');
    
    // Register a user
    const userData = {
      name: `Debug User ${Date.now()}`,
      email: `debuguser_${Date.now()}@example.com`,
      password: 'password123',
      username: `debuguser_${Date.now()}`,
      discriminator: Math.floor(1000 + Math.random() * 9000).toString()
    };

    try {
      const registerResponse = await axios.post(`${API_BASE_URL}/auth/register`, userData);
      this.token = registerResponse.data.data.token;
      console.log('✅ User registered:', registerResponse.data.data.user.id);
    } catch (error) {
      console.error('❌ Registration failed:', error.response?.data || error.message);
      return false;
    }

    // Create a server
    const serverData = {
      name: `Debug Server ${Date.now()}`,
      description: 'Debug server for invite issue'
    };

    try {
      const serverResponse = await axios.post(`${API_BASE_URL}/servers`, serverData, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      this.serverId = serverResponse.data._id;
      console.log('✅ Server created:', this.serverId);
    } catch (error) {
      console.error('❌ Server creation failed:', error.response?.data || error.message);
      return false;
    }

    return true;
  }

  async testInviteCreation() {
    console.log('📋 Testing invite creation...');
    
    const inviteData = {
      maxUses: 10,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours
    };

    try {
      const inviteResponse = await axios.post(`${API_BASE_URL}/servers/${this.serverId}/invites`, inviteData, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      console.log('✅ Invite creation successful:', inviteResponse.data);
    } catch (error) {
      console.error('❌ Invite creation failed:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', error.response?.data);
      console.error('   Headers:', error.response?.headers);
      if (error.response?.status >= 500) {
        console.error('🔍 Server error - checking server logs needed');
      }
    }
  }

  async run() {
    const setupSuccess = await this.setup();
    if (!setupSuccess) {
      console.error('❌ Setup failed, cannot continue');
      return;
    }

    await this.testInviteCreation();
  }
}

const inviteDebugger = new InviteDebugger();
inviteDebugger.run().then(() => {
  console.log('🏁 Debug session completed');
}).catch(error => {
  console.error('💥 Debug session failed:', error);
});
