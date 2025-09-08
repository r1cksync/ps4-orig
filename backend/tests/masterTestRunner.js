#!/usr/bin/env node
/**
 * Master DM System Test Runner
 * Executes comprehensive tests for the entire DM system
 * 
 * Usage: node masterTestRunner.js [--api-only] [--socket-only] [--quick]
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

class MasterTestRunner {
  constructor() {
    this.args = process.argv.slice(2);
    this.results = {
      api: null,
      socket: null,
      startTime: Date.now()
    };
  }

  async runTest(testFile, testName) {
    return new Promise((resolve, reject) => {
      console.log(`\n🚀 Starting ${testName} tests...`);
      console.log('='.repeat(60));
      
      const testPath = join(__dirname, testFile);
      const child = spawn('node', [testPath], {
        stdio: 'inherit',
        cwd: __dirname
      });

      child.on('close', (code) => {
        console.log(`\n📊 ${testName} tests completed with code: ${code}`);
        resolve(code === 0);
      });

      child.on('error', (error) => {
        console.error(`❌ Failed to run ${testName} tests:`, error);
        reject(error);
      });
    });
  }

  async checkServerHealth() {
    console.log('🏥 Checking server health...');
    
    try {
      const http = await import('http');
      
      return new Promise((resolve, reject) => {
        const req = http.get('http://localhost:3001/health', (res) => {
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            try {
              const health = JSON.parse(data);
              if (health.status === 'OK') {
                console.log('✅ Server is healthy and responsive');
                resolve(true);
              } else {
                console.log('⚠️  Server responded but status is not OK');
                resolve(false);
              }
            } catch (error) {
              console.log('❌ Invalid health check response');
              resolve(false);
            }
          });
        });

        req.on('error', (error) => {
          console.log('❌ Server health check failed:', error.message);
          console.log('💡 Make sure the server is running on port 3001');
          resolve(false);
        });

        req.setTimeout(5000, () => {
          req.destroy();
          console.log('❌ Server health check timed out');
          resolve(false);
        });
      });
    } catch (error) {
      console.log('❌ Health check error:', error.message);
      return false;
    }
  }

  async runAPITests() {
    console.log('\n🌐 API TESTS'.blue);
    console.log('Testing REST endpoints for DM functionality');
    
    try {
      const success = await this.runTest('runDMTests.js', 'API');
      this.results.api = success;
      return success;
    } catch (error) {
      console.error('API tests failed to run:', error);
      this.results.api = false;
      return false;
    }
  }

  async runSocketTests() {
    console.log('\n⚡ SOCKET.IO TESTS'.cyan);
    console.log('Testing real-time functionality via WebSocket');
    
    try {
      const success = await this.runTest('testSocketDM.js', 'Socket.IO');
      this.results.socket = success;
      return success;
    } catch (error) {
      console.error('Socket.IO tests failed to run:', error);
      this.results.socket = false;
      return false;
    }
  }

  async wait(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  printBanner() {
    console.log('🎯 COMPREHENSIVE DM SYSTEM TEST SUITE'.rainbow);
    console.log('=' * 80);
    console.log('This test suite will validate:');
    console.log('• 📡 REST API endpoints');
    console.log('• 🔌 Socket.IO real-time events');
    console.log('• 💬 Message sending and retrieval');
    console.log('• 👥 Group DM management');
    console.log('• 😀 Reactions and read receipts');
    console.log('• ⌨️  Typing indicators');
    console.log('• 🚨 Error handling');
    console.log('• 🔒 Permission validation');
    console.log('=' * 80);
  }

  generateTestReport() {
    const duration = Date.now() - this.results.startTime;
    
    console.log('\n' + '='.repeat(80));
    console.log('📋 COMPREHENSIVE TEST REPORT'.bold);
    console.log('='.repeat(80));
    
    console.log('\n🎯 Test Categories:');
    console.log(`📡 REST API Tests: ${this.results.api ? '✅ PASSED' : '❌ FAILED'}`);
    console.log(`⚡ Socket.IO Tests: ${this.results.socket ? '✅ PASSED' : '❌ FAILED'}`);
    
    const passedCount = [this.results.api, this.results.socket].filter(Boolean).length;
    const totalCount = 2;
    const successRate = (passedCount / totalCount) * 100;
    
    console.log('\n📊 Overall Results:');
    console.log(`Total Categories: ${totalCount}`);
    console.log(`Passed: ${passedCount}`);
    console.log(`Failed: ${totalCount - passedCount}`);
    console.log(`Success Rate: ${successRate.toFixed(1)}%`);
    console.log(`Total Duration: ${(duration / 1000).toFixed(1)}s`);
    
    if (successRate === 100) {
      console.log('\n🎉 ALL TESTS PASSED! 🎉'.green);
      console.log('The DM system is fully functional and ready for production!');
    } else if (successRate >= 50) {
      console.log('\n⚠️  PARTIAL SUCCESS'.yellow);
      console.log('Some tests failed. Please review the output above.');
    } else {
      console.log('\n💥 MAJOR FAILURES'.red);
      console.log('Multiple test categories failed. Please check your implementation.');
    }
    
    console.log('\n💡 Next Steps:');
    if (!this.results.api) {
      console.log('• Fix REST API endpoint issues');
      console.log('• Check authentication and permissions');
      console.log('• Verify database connectivity');
    }
    if (!this.results.socket) {
      console.log('• Check Socket.IO server configuration');
      console.log('• Verify real-time event handlers');
      console.log('• Test WebSocket connectivity');
    }
    
    console.log('='.repeat(80));
  }

  async run() {
    this.printBanner();
    
    // Check if server is running
    const serverHealthy = await this.checkServerHealth();
    if (!serverHealthy) {
      console.log('\n💥 Cannot proceed with tests - server is not responding');
      console.log('Please start the server with: npm run dev');
      process.exit(1);
    }

    // Parse command line arguments
    const apiOnly = this.args.includes('--api-only');
    const socketOnly = this.args.includes('--socket-only');
    const quick = this.args.includes('--quick');

    console.log('\n🎬 Starting test execution...');
    
    try {
      // Run API tests unless socket-only is specified
      if (!socketOnly) {
        await this.runAPITests();
        
        if (!quick && !apiOnly) {
          console.log('\n⏳ Waiting 3 seconds before Socket.IO tests...');
          await this.wait(3000);
        }
      }
      
      // Run Socket.IO tests unless api-only is specified
      if (!apiOnly) {
        await this.runSocketTests();
      }
      
    } catch (error) {
      console.error('\n💥 Test execution failed:', error);
    }
    
    this.generateTestReport();
    
    // Exit with error code if any tests failed
    const allPassed = this.results.api !== false && this.results.socket !== false;
    process.exit(allPassed ? 0 : 1);
  }
}

// Color output helpers (simple implementation)
String.prototype.bold = String.prototype.bold || function() {
  return `\x1b[1m${this}\x1b[0m`;
};

String.prototype.red = String.prototype.red || function() {
  return `\x1b[31m${this}\x1b[0m`;
};

String.prototype.green = String.prototype.green || function() {
  return `\x1b[32m${this}\x1b[0m`;
};

String.prototype.yellow = String.prototype.yellow || function() {
  return `\x1b[33m${this}\x1b[0m`;
};

String.prototype.blue = String.prototype.blue || function() {
  return `\x1b[34m${this}\x1b[0m`;
};

String.prototype.cyan = String.prototype.cyan || function() {
  return `\x1b[36m${this}\x1b[0m`;
};

String.prototype.rainbow = String.prototype.rainbow || function() {
  return `\x1b[35m${this}\x1b[0m`;
};

// Help text
function showHelp() {
  console.log('DM System Test Runner');
  console.log('');
  console.log('Usage: node masterTestRunner.js [options]');
  console.log('');
  console.log('Options:');
  console.log('  --api-only     Run only REST API tests');
  console.log('  --socket-only  Run only Socket.IO tests');
  console.log('  --quick        Skip delays between test suites');
  console.log('  --help         Show this help message');
  console.log('');
  console.log('Examples:');
  console.log('  node masterTestRunner.js                # Run all tests');
  console.log('  node masterTestRunner.js --api-only     # Test only REST API');
  console.log('  node masterTestRunner.js --socket-only  # Test only Socket.IO');
  console.log('  node masterTestRunner.js --quick        # Run all tests quickly');
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  
  if (args.includes('--help') || args.includes('-h')) {
    showHelp();
    process.exit(0);
  }
  
  const runner = new MasterTestRunner();
  runner.run().catch(console.error);
}

export default MasterTestRunner;
