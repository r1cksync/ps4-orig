import axios from 'axios';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config();

const BASE_URL = `http://localhost:${process.env.PORT || 3001}/api`;

class AuthTester {
  constructor() {
    this.testResults = [];
    this.userToken = null;
    this.testUser = {
      email: `test${Date.now()}@example.com`,
      password: 'TestPassword123!',
      name: 'Test User'
    };
  }

  // Helper method to make API requests
  async makeRequest(method, endpoint, data = null, token = null) {
    try {
      const config = {
        method,
        url: `${BASE_URL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
        },
      };

      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
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

  // Test result logger
  logTest(testName, success, message, details = null) {
    const result = {
      test: testName,
      success,
      message,
      details,
      timestamp: new Date().toISOString()
    };
    this.testResults.push(result);
    
    const icon = success ? '✅' : '❌';
    console.log(`${icon} ${testName}: ${message}`);
    if (details) {
      console.log(`   Details: ${JSON.stringify(details, null, 2)}`);
    }
  }

  // Test 1: User Registration
  async testUserRegistration() {
    console.log('\n🔐 Testing User Registration...');
    
    const response = await this.makeRequest('POST', '/auth/register', this.testUser);
    
    if (response.success && response.data.success) {
      this.userToken = response.data.data.token;
      this.logTest(
        'User Registration',
        true,
        'User registered successfully',
        {
          userId: response.data.data.user.id,
          email: response.data.data.user.email,
          tokenReceived: !!this.userToken
        }
      );
    } else {
      this.logTest(
        'User Registration',
        false,
        'Registration failed',
        response.error
      );
    }
  }

  // Test 2: User Login
  async testUserLogin() {
    console.log('\n🔑 Testing User Login...');
    
    const loginData = {
      email: this.testUser.email,
      password: this.testUser.password
    };

    const response = await this.makeRequest('POST', '/auth/login', loginData);
    
    if (response.success && response.data.success) {
      const newToken = response.data.data.token;
      this.logTest(
        'User Login',
        true,
        'User logged in successfully',
        {
          userId: response.data.data.user.id,
          email: response.data.data.user.email,
          tokenReceived: !!newToken,
          tokenMatches: newToken !== this.userToken // Should be different token
        }
      );
      this.userToken = newToken; // Update token
    } else {
      this.logTest(
        'User Login',
        false,
        'Login failed',
        response.error
      );
    }
  }

  // Test 3: Get Current User (Protected Route)
  async testGetCurrentUser() {
    console.log('\n👤 Testing Get Current User (Protected Route)...');
    
    const response = await this.makeRequest('GET', '/auth/me', null, this.userToken);
    
    if (response.success && response.data.success) {
      this.logTest(
        'Get Current User',
        true,
        'User data retrieved successfully',
        {
          userId: response.data.data.id,
          email: response.data.data.email,
          name: response.data.data.name,
          hasSettings: !!response.data.data.settings
        }
      );
    } else {
      this.logTest(
        'Get Current User',
        false,
        'Failed to get user data',
        response.error
      );
    }
  }

  // Test 4: Update User Profile
  async testUpdateProfile() {
    console.log('\n✏️ Testing Update User Profile...');
    
    const updateData = {
      name: 'Updated Test User',
      avatar: 'https://example.com/avatar.jpg'
    };

    const response = await this.makeRequest('PUT', '/auth/profile', updateData, this.userToken);
    
    if (response.success && response.data.success) {
      this.logTest(
        'Update Profile',
        true,
        'Profile updated successfully',
        {
          newName: response.data.data.name,
          newAvatar: response.data.data.avatar
        }
      );
    } else {
      this.logTest(
        'Update Profile',
        false,
        'Profile update failed',
        response.error
      );
    }
  }

  // Test 5: Change Password
  async testChangePassword() {
    console.log('\n🔒 Testing Change Password...');
    
    const newPassword = 'NewPassword123!';
    const passwordData = {
      currentPassword: this.testUser.password,
      newPassword
    };

    const response = await this.makeRequest('PUT', '/auth/password', passwordData, this.userToken);
    
    if (response.success && response.data.success) {
      this.testUser.password = newPassword; // Update for future tests
      this.logTest(
        'Change Password',
        true,
        'Password changed successfully',
        { message: response.data.message }
      );
    } else {
      this.logTest(
        'Change Password',
        false,
        'Password change failed',
        response.error
      );
    }
  }

  // Test 6: Update User Settings
  async testUpdateSettings() {
    console.log('\n⚙️ Testing Update User Settings...');
    
    const settingsData = {
      emailAlerts: true,
      pushNotifications: false,
      autoScanGmail: true,
      scanImages: true,
      lowRiskThreshold: 0.2,
      mediumRiskThreshold: 0.5,
      highRiskThreshold: 0.8
    };

    const response = await this.makeRequest('PUT', '/auth/settings', settingsData, this.userToken);
    
    if (response.success && response.data.success) {
      this.logTest(
        'Update Settings',
        true,
        'Settings updated successfully',
        response.data.data
      );
    } else {
      this.logTest(
        'Update Settings',
        false,
        'Settings update failed',
        response.error
      );
    }
  }

  // Test 7: Refresh Token
  async testRefreshToken() {
    console.log('\n🔄 Testing Refresh Token...');
    
    const response = await this.makeRequest('POST', '/auth/refresh', null, this.userToken);
    
    if (response.success && response.data.success) {
      const newToken = response.data.data.token;
      this.logTest(
        'Refresh Token',
        true,
        'Token refreshed successfully',
        {
          newTokenReceived: !!newToken,
          tokenChanged: newToken !== this.userToken
        }
      );
      this.userToken = newToken;
    } else {
      this.logTest(
        'Refresh Token',
        false,
        'Token refresh failed',
        response.error
      );
    }
  }

  // Test 8: Access Protected Route Without Token
  async testUnauthorizedAccess() {
    console.log('\n🚫 Testing Unauthorized Access...');
    
    const response = await this.makeRequest('GET', '/auth/me', null, null);
    
    if (!response.success && response.status === 401) {
      this.logTest(
        'Unauthorized Access',
        true,
        'Correctly denied access without token',
        { status: response.status, error: response.error }
      );
    } else {
      this.logTest(
        'Unauthorized Access',
        false,
        'Should have denied access but did not',
        response
      );
    }
  }

  // Test 9: Access Protected Route With Invalid Token
  async testInvalidToken() {
    console.log('\n🔐 Testing Invalid Token...');
    
    const invalidToken = 'invalid.jwt.token';
    const response = await this.makeRequest('GET', '/auth/me', null, invalidToken);
    
    if (!response.success && response.status === 401) {
      this.logTest(
        'Invalid Token',
        true,
        'Correctly rejected invalid token',
        { status: response.status, error: response.error }
      );
    } else {
      this.logTest(
        'Invalid Token',
        false,
        'Should have rejected invalid token',
        response
      );
    }
  }

  // Test 10: Logout
  async testLogout() {
    console.log('\n🚪 Testing Logout...');
    
    const response = await this.makeRequest('POST', '/auth/logout', null, this.userToken);
    
    if (response.success && response.data.success) {
      this.logTest(
        'Logout',
        true,
        'User logged out successfully',
        { message: response.data.message }
      );
    } else {
      this.logTest(
        'Logout',
        false,
        'Logout failed',
        response.error
      );
    }
  }

  // Test 11: Login with Wrong Password
  async testWrongPassword() {
    console.log('\n❌ Testing Login with Wrong Password...');
    
    const wrongLoginData = {
      email: this.testUser.email,
      password: 'WrongPassword123!'
    };

    const response = await this.makeRequest('POST', '/auth/login', wrongLoginData);
    
    if (!response.success && response.status === 401) {
      this.logTest(
        'Wrong Password',
        true,
        'Correctly rejected wrong password',
        { status: response.status, error: response.error }
      );
    } else {
      this.logTest(
        'Wrong Password',
        false,
        'Should have rejected wrong password',
        response
      );
    }
  }

  // Test 12: Register with Existing Email
  async testDuplicateRegistration() {
    console.log('\n📧 Testing Duplicate Email Registration...');
    
    const response = await this.makeRequest('POST', '/auth/register', this.testUser);
    
    if (!response.success && response.status === 400) {
      this.logTest(
        'Duplicate Registration',
        true,
        'Correctly rejected duplicate email',
        { status: response.status, error: response.error }
      );
    } else {
      this.logTest(
        'Duplicate Registration',
        false,
        'Should have rejected duplicate email',
        response
      );
    }
  }

  // Test 13: Google OAuth (Mock Test)
  async testGoogleOAuthMock() {
    console.log('\n🔍 Testing Google OAuth (Mock)...');
    
    // This is a mock test since we can't generate real Google ID tokens in testing
    const mockGoogleData = {
      idToken: 'mock.google.id.token'
    };

    const response = await this.makeRequest('POST', '/auth/google', mockGoogleData);
    
    // We expect this to fail since it's a mock token
    if (!response.success) {
      this.logTest(
        'Google OAuth Mock',
        true,
        'Correctly rejected mock Google token (expected behavior)',
        { status: response.status, error: response.error }
      );
    } else {
      this.logTest(
        'Google OAuth Mock',
        false,
        'Should have rejected mock Google token',
        response
      );
    }
  }

  // Test 14: Account Deactivation
  async testAccountDeactivation() {
    console.log('\n🗑️ Testing Account Deactivation...');
    
    // First login to get a valid token
    const loginResponse = await this.makeRequest('POST', '/auth/login', {
      email: this.testUser.email,
      password: this.testUser.password
    });

    if (loginResponse.success) {
      this.userToken = loginResponse.data.data.token;
      
      const response = await this.makeRequest('DELETE', '/auth/account', null, this.userToken);
      
      if (response.success && response.data.success) {
        this.logTest(
          'Account Deactivation',
          true,
          'Account deactivated successfully',
          { message: response.data.message }
        );
      } else {
        this.logTest(
          'Account Deactivation',
          false,
          'Account deactivation failed',
          response.error
        );
      }
    } else {
      this.logTest(
        'Account Deactivation',
        false,
        'Could not login to test deactivation',
        loginResponse.error
      );
    }
  }

  // Run all tests
  async runAllTests() {
    console.log('🧪 Starting Authentication Tests...');
    console.log('=====================================\n');

    try {
      await this.testUserRegistration();
      await this.testUserLogin();
      await this.testGetCurrentUser();
      await this.testUpdateProfile();
      await this.testChangePassword();
      await this.testUpdateSettings();
      await this.testRefreshToken();
      await this.testUnauthorizedAccess();
      await this.testInvalidToken();
      await this.testLogout();
      await this.testWrongPassword();
      await this.testDuplicateRegistration();
      await this.testGoogleOAuthMock();
      await this.testAccountDeactivation();

    } catch (error) {
      console.error('❌ Test execution failed:', error);
    }

    this.printSummary();
  }

  // Print test summary
  printSummary() {
    console.log('\n📊 Test Summary');
    console.log('=====================================');
    
    const passed = this.testResults.filter(r => r.success).length;
    const failed = this.testResults.filter(r => !r.success).length;
    const total = this.testResults.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📈 Success Rate: ${((passed / total) * 100).toFixed(1)}%`);

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.testResults
        .filter(r => !r.success)
        .forEach(r => {
          console.log(`   - ${r.test}: ${r.message}`);
        });
    }

    console.log('\n🎉 Authentication testing completed!');
    
    // Save results to file
    const testReport = {
      summary: { total, passed, failed, successRate: ((passed / total) * 100).toFixed(1) },
      results: this.testResults,
      generatedAt: new Date().toISOString()
    };
    
    fs.writeFileSync('auth-test-results.json', JSON.stringify(testReport, null, 2));
    console.log('📄 Test results saved to auth-test-results.json');
  }
}

// Run the tests
const tester = new AuthTester();
tester.runAllTests().catch(console.error);
