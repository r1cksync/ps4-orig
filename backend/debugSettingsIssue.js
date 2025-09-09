import axios from 'axios';

const API_BASE_URL = 'http://localhost:3001/api';

class SettingsDebugger {
  constructor() {
    this.token = null;
    this.serverId = null;
  }

  async setup() {
    console.log('🔍 Debugging server settings update issue...');
    
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
      description: 'Debug server for settings issue'
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

  async testSettingsUpdate() {
    console.log('📋 Testing server settings update...');
    
    const settingsData = {
      verificationLevel: 'LOW',
      explicitContentFilter: 'MEMBERS_WITHOUT_ROLES',
      defaultMessageNotifications: 'ONLY_MENTIONS'
    };

    try {
      const response = await axios.patch(`${API_BASE_URL}/servers/${this.serverId}/settings`, settingsData, {
        headers: { 'Authorization': `Bearer ${this.token}` }
      });
      
      console.log('✅ Settings update successful:', {
        status: response.status,
        data: response.data
      });
    } catch (error) {
      console.error('❌ Settings update failed:');
      console.error('   Status:', error.response?.status);
      console.error('   Data:', error.response?.data);
      console.error('   Headers:', error.response?.headers);
    }
  }

  async run() {
    const setupSuccess = await this.setup();
    if (!setupSuccess) {
      console.error('❌ Setup failed, cannot continue');
      return;
    }

    await this.testSettingsUpdate();
    console.log('🏁 Debug session completed');
  }
}

const settingsDebugger = new SettingsDebugger();
settingsDebugger.run();
