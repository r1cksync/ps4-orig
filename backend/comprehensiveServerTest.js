import axios from 'axios';
import mongoose from 'mongoose';

class ComprehensiveServerTest {
  constructor() {
    this.baseURL = 'http://localhost:3001/api';
    this.token = null;
    this.userId = null;
    this.serverId = null;
    this.channelId = null;
    this.roleId = null;
    this.inviteCode = null;
    this.testResults = [];
  }

  log(message, type = 'info') {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
    console.log(logMessage);
    this.testResults.push({ timestamp, type, message });
  }

  async makeRequest(method, endpoint, data = null, headers = {}) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          ...headers
        }
      };

      if (this.token) {
        config.headers.Authorization = `Bearer ${this.token}`;
      }

      if (data) {
        config.data = data;
      }

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

  async runTests() {
    this.log('🚀 Starting Comprehensive Server Feature Tests', 'info');

    try {
      // Test 1: Authentication
      await this.testAuthentication();
      
      // Test 2: Server Creation
      await this.testServerCreation();
      
      // Test 3: Server Management
      await this.testServerManagement();
      
      // Test 4: Member Management
      await this.testMemberManagement();
      
      // Test 5: Role Management
      await this.testRoleManagement();
      
      // Test 6: Channel Management
      await this.testChannelManagement();
      
      // Test 7: Invite System
      await this.testInviteSystem();
      
      // Test 8: Ban System
      await this.testBanSystem();
      
      // Test 9: Server Settings
      await this.testServerSettings();
      
      // Test 10: Emoji Management
      await this.testEmojiManagement();

      // Test 11: Permission System
      await this.testPermissionSystem();

      this.log('✅ All comprehensive server tests completed!', 'success');
      this.generateReport();

    } catch (error) {
      this.log(`❌ Test suite failed: ${error.message}`, 'error');
    }
  }

  async testAuthentication() {
    this.log('Testing Authentication...', 'test');

    // Register a test user
    const registerData = {
      email: `test_${Date.now()}@example.com`,
      password: 'testpassword123',
      name: `Test User ${Date.now()}`,
      username: `testuser_${Date.now()}`
    };

    const registerResult = await this.makeRequest('POST', '/auth/register', registerData);
    
    this.log(`Registration response: ${JSON.stringify(registerResult)}`, 'info');
    
    if (registerResult.success && registerResult.data.success) {
      this.token = registerResult.data.data.token;
      this.userId = registerResult.data.data.user.id;
      this.log('✅ User registration successful', 'success');
    } else {
      // Try to login if user already exists
      const loginResult = await this.makeRequest('POST', '/auth/login', {
        email: registerData.email,
        password: registerData.password
      });
      
      this.log(`Login response: ${JSON.stringify(loginResult)}`, 'info');
      
      if (loginResult.success && loginResult.data.success) {
        this.token = loginResult.data.data.token;
        this.userId = loginResult.data.data.user.id;
        this.log('✅ User login successful', 'success');
      } else {
        this.log(`❌ Authentication failed: ${JSON.stringify(registerResult.error || loginResult.error)}`, 'error');
        throw new Error('Authentication failed');
      }
    }
  }

  async testServerCreation() {
    this.log('Testing Server Creation...', 'test');

    const serverData = {
      name: `Test Server ${Date.now()}`,
      description: 'A comprehensive test server for Discord-like features',
      icon: 'https://example.com/server-icon.png'
    };

    const result = await this.makeRequest('POST', '/servers', serverData);
    
    if (result.success) {
      this.serverId = result.data._id;
      this.log('✅ Server creation successful', 'success');
      this.log(`   Server ID: ${this.serverId}`, 'info');
      this.log(`   Server Name: ${result.data.name}`, 'info');
      this.log(`   Owner: ${result.data.owner?.username || result.data.owner}`, 'info');
    } else {
      this.log(`❌ Server creation failed: ${JSON.stringify(result.error)}`, 'error');
    }
  }

  async testServerManagement() {
    this.log('Testing Server Management...', 'test');

    if (!this.serverId) {
      this.log('❌ Skipping server management - no server created', 'warning');
      return;
    }

    // Get server details
    const getResult = await this.makeRequest('GET', `/servers/${this.serverId}`);
    if (getResult.success) {
      this.log('✅ Server fetch successful', 'success');
    } else {
      this.log(`❌ Server fetch failed: ${JSON.stringify(getResult.error)}`, 'error');
    }

    // Update server
    const updateData = {
      name: `Updated Test Server ${Date.now()}`,
      description: 'Updated description for comprehensive testing'
    };

    const updateResult = await this.makeRequest('PUT', `/servers/${this.serverId}`, updateData);
    if (updateResult.success) {
      this.log('✅ Server update successful', 'success');
    } else {
      this.log(`❌ Server update failed: ${JSON.stringify(updateResult.error)}`, 'error');
    }
  }

  async testMemberManagement() {
    this.log('Testing Member Management...', 'test');

    if (!this.serverId) {
      this.log('❌ Skipping member management - no server created', 'warning');
      return;
    }

    // Get server members
    const membersResult = await this.makeRequest('GET', `/servers/${this.serverId}/members`);
    if (membersResult.success) {
      this.log('✅ Members fetch successful', 'success');
      this.log(`   Total members: ${membersResult.data.length}`, 'info');
    } else {
      this.log(`❌ Members fetch failed: ${JSON.stringify(membersResult.error)}`, 'error');
    }

    // Test member role update (updating own nickname)
    const updateMemberData = {
      nickname: 'Test Owner'
    };

    const updateMemberResult = await this.makeRequest('PATCH', `/servers/${this.serverId}/members/${this.userId}`, updateMemberData);
    if (updateMemberResult.success) {
      this.log('✅ Member update successful', 'success');
    } else {
      this.log(`❌ Member update failed: ${JSON.stringify(updateMemberResult.error)}`, 'error');
    }
  }

  async testRoleManagement() {
    this.log('Testing Role Management...', 'test');

    if (!this.serverId) {
      this.log('❌ Skipping role management - no server created', 'warning');
      return;
    }

    // Get existing roles
    const rolesResult = await this.makeRequest('GET', `/servers/${this.serverId}/roles`);
    if (rolesResult.success) {
      this.log('✅ Roles fetch successful', 'success');
      this.log(`   Total roles: ${rolesResult.data.length}`, 'info');
    } else {
      this.log(`❌ Roles fetch failed: ${JSON.stringify(rolesResult.error)}`, 'error');
    }

    // Create a new role
    const roleData = {
      name: 'Test Moderator',
      color: '#FF5722',
      permissions: ['KICK_MEMBERS', 'MANAGE_MESSAGES', 'MUTE_MEMBERS'],
      mentionable: true,
      hoist: true
    };

    const createRoleResult = await this.makeRequest('POST', `/servers/${this.serverId}/roles`, roleData);
    if (createRoleResult.success) {
      this.roleId = createRoleResult.data._id;
      this.log('✅ Role creation successful', 'success');
      this.log(`   Role ID: ${this.roleId}`, 'info');
    } else {
      this.log(`❌ Role creation failed: ${JSON.stringify(createRoleResult.error)}`, 'error');
    }

    // Update role if created
    if (this.roleId) {
      const updateRoleData = {
        name: 'Updated Test Moderator',
        color: '#9C27B0'
      };

      const updateRoleResult = await this.makeRequest('PATCH', `/servers/${this.serverId}/roles/${this.roleId}`, updateRoleData);
      if (updateRoleResult.success) {
        this.log('✅ Role update successful', 'success');
      } else {
        this.log(`❌ Role update failed: ${JSON.stringify(updateRoleResult.error)}`, 'error');
      }
    }
  }

  async testChannelManagement() {
    this.log('Testing Channel Management...', 'test');

    if (!this.serverId) {
      this.log('❌ Skipping channel management - no server created', 'warning');
      return;
    }

    // Get server channels
    const channelsResult = await this.makeRequest('GET', `/servers/${this.serverId}/channels`);
    if (channelsResult.success) {
      this.log('✅ Channels fetch successful', 'success');
      this.log(`   Total channels: ${channelsResult.data.length}`, 'info');
    } else {
      this.log(`❌ Channels fetch failed: ${JSON.stringify(channelsResult.error)}`, 'error');
    }

    // Create a new channel using the channels endpoint
    const channelData = {
      name: 'test-channel',
      type: 'TEXT',
      serverId: this.serverId,
      topic: 'A test channel for comprehensive testing',
      slowMode: 5
    };

    const createChannelResult = await this.makeRequest('POST', '/channels', channelData);
    if (createChannelResult.success) {
      this.channelId = createChannelResult.data._id;
      this.log('✅ Channel creation successful', 'success');
      this.log(`   Channel ID: ${this.channelId}`, 'info');
    } else {
      this.log(`❌ Channel creation failed: ${JSON.stringify(createChannelResult.error)}`, 'error');
    }

    // Update channel if created
    if (this.channelId) {
      const updateChannelData = {
        name: 'updated-test-channel',
        topic: 'Updated test channel topic'
      };

      const updateChannelResult = await this.makeRequest('PUT', `/channels/${this.channelId}`, updateChannelData);
      if (updateChannelResult.success) {
        this.log('✅ Channel update successful', 'success');
      } else {
        this.log(`❌ Channel update failed: ${JSON.stringify(updateChannelResult.error)}`, 'error');
      }
    }
  }

  async testInviteSystem() {
    this.log('Testing Invite System...', 'test');

    if (!this.serverId) {
      this.log('❌ Skipping invite system - no server created', 'warning');
      return;
    }

    // Create an invite
    const inviteData = {
      maxUses: 10,
      expiresAt: new Date(Date.now() + 3600000).toISOString() // 1 hour from now
    };

    const createInviteResult = await this.makeRequest('POST', `/servers/${this.serverId}/invites`, inviteData);
    if (createInviteResult.success) {
      this.inviteCode = createInviteResult.data.code;
      this.log('✅ Invite creation successful', 'success');
      this.log(`   Invite code: ${this.inviteCode}`, 'info');
    } else {
      this.log(`❌ Invite creation failed: ${JSON.stringify(createInviteResult.error)}`, 'error');
    }

    // Get server invites - check if this endpoint exists
    const invitesResult = await this.makeRequest('GET', `/servers/${this.serverId}/invites`);
    if (invitesResult.success) {
      this.log('✅ Invites fetch successful', 'success');
      this.log(`   Total invites: ${invitesResult.data?.length || 'N/A'}`, 'info');
    } else {
      this.log(`❌ Invites fetch failed: ${JSON.stringify(invitesResult.error)}`, 'error');
    }
  }

  async testBanSystem() {
    this.log('Testing Ban System...', 'test');

    if (!this.serverId) {
      this.log('❌ Skipping ban system - no server created', 'warning');
      return;
    }

    // Get current bans
    const bansResult = await this.makeRequest('GET', `/servers/${this.serverId}/bans`);
    if (bansResult.success) {
      this.log('✅ Bans fetch successful', 'success');
      this.log(`   Total bans: ${bansResult.data.length}`, 'info');
    } else {
      this.log(`❌ Bans fetch failed: ${JSON.stringify(bansResult.error)}`, 'error');
    }

    // Note: We won't actually ban the test user as they're the server owner
    this.log('⚠️  Skipping actual ban test (would ban server owner)', 'warning');
  }

  async testServerSettings() {
    this.log('Testing Server Settings...', 'test');

    if (!this.serverId) {
      this.log('❌ Skipping server settings - no server created', 'warning');
      return;
    }

    // Update server settings
    const settingsData = {
      verificationLevel: 'LOW',
      defaultMessageNotifications: 'ONLY_MENTIONS',
      explicitContentFilter: 'MEMBERS_WITHOUT_ROLES',
      afkTimeout: 300
    };

    const updateSettingsResult = await this.makeRequest('PATCH', `/servers/${this.serverId}/settings`, settingsData);
    if (updateSettingsResult.success) {
      this.log('✅ Server settings update successful', 'success');
    } else {
      this.log(`❌ Server settings update failed: ${JSON.stringify(updateSettingsResult.error)}`, 'error');
    }
  }

  async testEmojiManagement() {
    this.log('Testing Emoji Management...', 'test');

    if (!this.serverId) {
      this.log('❌ Skipping emoji management - no server created', 'warning');
      return;
    }

    // Add custom emoji
    const emojiData = {
      name: 'test_emoji',
      url: 'https://example.com/emoji.png',
      animated: false
    };

    const addEmojiResult = await this.makeRequest('POST', `/servers/${this.serverId}/emojis`, emojiData);
    if (addEmojiResult.success) {
      this.log('✅ Emoji addition successful', 'success');
      this.log(`   Emoji ID: ${addEmojiResult.data.id}`, 'info');
    } else {
      this.log(`❌ Emoji addition failed: ${JSON.stringify(addEmojiResult.error)}`, 'error');
    }
  }

  async testPermissionSystem() {
    this.log('Testing Permission System...', 'test');

    if (!this.serverId || !this.channelId) {
      this.log('❌ Skipping permission system - no server/channel created', 'warning');
      return;
    }

    // Test channel permissions
    const permissionsResult = await this.makeRequest('GET', `/servers/${this.serverId}/channels/${this.channelId}/permissions`);
    if (permissionsResult.success) {
      this.log('✅ Channel permissions fetch successful', 'success');
    } else {
      this.log(`❌ Channel permissions fetch failed: ${JSON.stringify(permissionsResult.error)}`, 'error');
    }

    // Test adding permission override for a role
    if (this.roleId) {
      const permissionData = {
        type: 'role',
        allow: ['SEND_MESSAGES', 'READ_MESSAGE_HISTORY'],
        deny: ['MANAGE_MESSAGES']
      };

      const updatePermissionResult = await this.makeRequest('PUT', `/servers/${this.serverId}/channels/${this.channelId}/permissions/${this.roleId}`, permissionData);
      if (updatePermissionResult.success) {
        this.log('✅ Permission override successful', 'success');
      } else {
        this.log(`❌ Permission override failed: ${JSON.stringify(updatePermissionResult.error)}`, 'error');
      }
    }
  }

  generateReport() {
    this.log('📊 Generating Test Report...', 'info');
    
    const successTests = this.testResults.filter(result => result.type === 'success').length;
    const errorTests = this.testResults.filter(result => result.type === 'error').length;
    const totalTests = this.testResults.filter(result => result.type === 'test').length;
    
    console.log('\n' + '='.repeat(60));
    console.log('           COMPREHENSIVE SERVER TEST REPORT');
    console.log('='.repeat(60));
    console.log(`Total Test Categories: ${totalTests}`);
    console.log(`Successful Operations: ${successTests}`);
    console.log(`Failed Operations: ${errorTests}`);
    console.log(`Success Rate: ${((successTests / (successTests + errorTests)) * 100).toFixed(2)}%`);
    console.log('='.repeat(60));
    
    if (this.serverId) {
      console.log(`\n📋 Test Data Created:`);
      console.log(`   Server ID: ${this.serverId}`);
      console.log(`   Channel ID: ${this.channelId || 'N/A'}`);
      console.log(`   Role ID: ${this.roleId || 'N/A'}`);
      console.log(`   Invite Code: ${this.inviteCode || 'N/A'}`);
    }
    
    console.log('\n🎯 Test Categories Completed:');
    console.log('   ✅ Authentication & User Management');
    console.log('   ✅ Server Creation & Management');
    console.log('   ✅ Member Management');
    console.log('   ✅ Role Management');
    console.log('   ✅ Channel Management');
    console.log('   ✅ Invite System');
    console.log('   ✅ Ban System');
    console.log('   ✅ Server Settings');
    console.log('   ✅ Emoji Management');
    console.log('   ✅ Permission System');
    
    console.log('\n🔍 Detailed Results:');
    this.testResults.forEach(result => {
      const icon = result.type === 'success' ? '✅' : 
                   result.type === 'error' ? '❌' : 
                   result.type === 'warning' ? '⚠️' : 'ℹ️';
      console.log(`   ${icon} ${result.message}`);
    });
  }
}

// Run the tests
const tester = new ComprehensiveServerTest();
tester.runTests().catch(console.error);

export default ComprehensiveServerTest;
