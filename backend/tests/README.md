# DM System Test Suite

Comprehensive testing suite for the Discord-like Direct Messaging system. Tests all REST API endpoints and real-time Socket.IO functionality.

## Features Tested

### 🌐 REST API Endpoints
- **DM Channel Management**
  - Create individual DM channels
  - Create group DM channels
  - List user's DM channels
  - Update group DM settings

- **Message Operations**
  - Send messages with content/attachments
  - Retrieve message history with pagination
  - Edit existing messages
  - Delete messages
  - Add/remove reactions

- **User Interactions**
  - Mark messages as read
  - Typing indicators via API
  - Read receipts

- **Group DM Management**
  - Add/remove participants
  - Change group name and icon
  - Transfer ownership
  - Leave group

### ⚡ Socket.IO Real-time Events
- **Real-time Messaging**
  - Instant message delivery
  - Message edit notifications
  - Message delete notifications

- **Live Interactions**
  - Typing indicators (start/stop)
  - Read status updates
  - Reaction additions

- **Group Events**
  - Participant join/leave notifications
  - Group settings changes
  - Permission updates

- **Connection Management**
  - User presence updates
  - Socket room management
  - Error handling

### 🔒 Security & Permissions
- Authentication validation
- DM permission checking (friends/mutual servers)
- Blocking functionality
- Rate limiting compliance

### 🚨 Error Handling
- Invalid input validation
- Resource not found errors
- Unauthorized access prevention
- Graceful error responses

## Quick Start

### Prerequisites
- Node.js backend server running on `http://localhost:5000`
- MongoDB database connected
- Test users available (auto-created if needed)

### Run All Tests
```bash
# Navigate to tests directory
cd backend/tests

# Run comprehensive test suite
node masterTestRunner.js
```

### Run Specific Test Categories
```bash
# API tests only
node masterTestRunner.js --api-only

# Socket.IO tests only  
node masterTestRunner.js --socket-only

# Quick run (no delays)
node masterTestRunner.js --quick
```

### Individual Test Files
```bash
# REST API tests
node runDMTests.js

# Socket.IO tests
node testSocketDM.js
```

## Test Files

### `masterTestRunner.js`
Master test orchestrator that runs all test suites and generates comprehensive reports.

**Features:**
- Server health checking
- Sequential test execution
- Comprehensive reporting
- Error aggregation
- Command-line options

### `runDMTests.js` 
REST API test suite using native Node.js HTTP client (no external dependencies).

**Tests:**
- User authentication & friendship setup
- DM channel CRUD operations
- Message sending/editing/deleting
- Reactions and read receipts
- Group DM management
- Permission validation
- Error handling

### `testSocketDM.js`
Socket.IO real-time functionality tests using WebSocket connections.

**Tests:**
- Socket.IO connection establishment
- Real-time message delivery
- Typing indicators
- Live event broadcasting
- Connection management
- Event handling validation

### `dmSystemTests.js`
Advanced comprehensive test suite with external dependencies (Socket.IO client, Axios, Colors).

**Features:**
- Complete Discord-like functionality testing
- Performance benchmarking
- Stress testing
- Advanced error scenarios
- Detailed reporting with colors

## Test Data

### Auto-Generated Test Users
- **Alice** (`alice_test_dm@example.com`) - Primary test user
- **Bob** (`bob_test_dm@example.com`) - Secondary test user  
- **Charlie** (`charlie_dm_test@example.com`) - Group DM participant
- **David** (`david_dm_test@example.com`) - Permission testing

### Test Scenarios
1. **Friend-to-Friend DM** - Alice ↔ Bob
2. **Group DM** - Alice, Bob, Charlie
3. **Permission Testing** - David (non-friend) interactions
4. **Error Cases** - Invalid inputs, unauthorized access

## Expected Output

### Successful Test Run
```
🎯 COMPREHENSIVE DM SYSTEM TEST SUITE
================================================================================
🏥 Checking server health...
✅ Server is healthy and responsive

🌐 API TESTS
Testing REST endpoints for DM functionality
✅ Create/login user: alice_test_dm
✅ Create/login user: bob_test_dm  
✅ Setup friendship between users
✅ Create DM channel between friends
✅ Retrieve DM channels list
✅ Send message in DM channel
✅ Retrieve messages from DM channel
✅ Edit existing message
✅ Add reaction to message
✅ Mark messages as read
✅ Create group DM
✅ Handle invalid channel ID
✅ Handle unauthorized access
✅ Handle empty message content

⚡ SOCKET.IO TESTS  
Testing real-time functionality via WebSocket
✅ Multiple Socket.IO connections established
✅ User 1 joined DM rooms
✅ User 2 joined DM rooms
✅ Alice received DM creation success
✅ Bob received DM channel creation notification
✅ Bob received typing indicator from Alice
✅ Bob received stop typing indicator
✅ Successfully emitted joinDMRooms event
✅ Successfully emitted markDMRead event

📋 COMPREHENSIVE TEST REPORT
================================================================================
📡 REST API Tests: ✅ PASSED
⚡ Socket.IO Tests: ✅ PASSED

📊 Overall Results:
Total Categories: 2
Passed: 2
Failed: 0
Success Rate: 100.0%
Total Duration: 8.7s

🎉 ALL TESTS PASSED! 🎉
The DM system is fully functional and ready for production!
```

## Performance Benchmarks

The test suite measures:
- **Message Throughput**: > 10 messages/second
- **Socket Event Rate**: > 50 events/second  
- **API Response Time**: < 500ms average
- **Concurrent Operations**: 10+ simultaneous requests

## Troubleshooting

### Server Not Responding
```bash
# Make sure server is running
cd backend
npm run dev

# Check health endpoint manually
curl http://localhost:5000/health
```

### Authentication Errors
- Test users are auto-created on first run
- Tokens are automatically obtained via login
- Check MongoDB connection if auth fails

### Socket Connection Issues
- Verify Socket.IO server is properly configured
- Check CORS settings for WebSocket connections
- Ensure authentication middleware is working

### Permission Errors
- Friendship relationships are auto-established
- Check Friendship model and routes
- Verify user IDs are valid ObjectIds

## Integration with CI/CD

Add to your CI pipeline:

```yaml
# .github/workflows/test-dm-system.yml
name: DM System Tests

on: [push, pull_request]

jobs:
  test-dm-system:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v2
    
    - name: Setup Node.js
      uses: actions/setup-node@v2
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: |
        cd backend
        npm install
    
    - name: Start MongoDB
      run: |
        sudo systemctl start mongod
    
    - name: Start server
      run: |
        cd backend
        npm run dev &
        sleep 10
    
    - name: Run DM system tests
      run: |
        cd backend/tests
        node masterTestRunner.js --quick
```

## Contributing

When adding new DM features:

1. **Add REST API tests** to `runDMTests.js`
2. **Add Socket.IO tests** to `testSocketDM.js`  
3. **Update master runner** if new test categories needed
4. **Document test scenarios** in this README
5. **Verify all tests pass** before submitting PR

## Test Coverage

Current test coverage includes:

- ✅ Authentication & authorization
- ✅ DM channel CRUD operations  
- ✅ Message lifecycle (send/edit/delete)
- ✅ Real-time event broadcasting
- ✅ Typing indicators & read receipts
- ✅ Reactions & emoji handling
- ✅ Group DM management
- ✅ Permission validation
- ✅ Error handling & edge cases
- ✅ Performance characteristics

Target: **100% feature coverage** for production readiness.
