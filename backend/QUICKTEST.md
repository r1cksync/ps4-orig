# Quick Test Guide

## 🚀 Quick Start

1. **Start the backend server:**
```bash
cd backend
npm run dev
```

2. **Run automated tests:**
```bash
npm test
```

3. **Check server health:**
```bash
npm run health
```

## 🧪 Test Scripts Available

### 1. Simple Automated Test (Recommended)
```bash
node test-simple.js
```
- Tests core functionality
- No external dependencies
- Quick execution (~30 seconds)

### 2. Comprehensive Test Suite
```bash
node test-backend.js
```
- Tests all endpoints and features
- Requires additional npm packages
- Full feature coverage (~2 minutes)

### 3. PowerShell Test Runner (Windows)
```powershell
.\test-runner.ps1
```

### 4. Bash Test Runner (Linux/Mac)
```bash
./test-runner.sh
```

## 📋 Manual Testing

See `TESTING.md` for comprehensive curl commands to test all endpoints manually.

### Quick Manual Tests

1. **Health Check:**
```bash
curl http://localhost:5000/health
```

2. **Register User:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@example.com","password":"test123","username":"testuser"}'
```

3. **Test API Root:**
```bash
curl http://localhost:5000/
```

## 🔧 What Gets Tested

### Authentication System
- ✅ User registration with Discord-like username#discriminator
- ✅ User login with JWT token generation
- ✅ Token validation and user authentication

### Discord-like Features
- ✅ Server creation and management
- ✅ Channel creation (text/voice)
- ✅ Real-time messaging
- ✅ Message reactions and editing
- ✅ Direct messages
- ✅ Friend system (requests, accept/decline)
- ✅ User presence and status

### Real-time Features
- ✅ WebSocket connection
- ✅ Message broadcasting
- ✅ Typing indicators
- ✅ Voice channel join/leave
- ✅ Status updates

### Fraud Detection Integration
- ✅ Message content analysis
- ✅ URL reputation checking
- ✅ Risk scoring for all messages

## 📊 Expected Test Results

**Successful run should show:**
- ✅ 15+ tests passing
- ✅ All major endpoints working
- ✅ Authentication flow complete
- ✅ Discord-like features functional
- ✅ WebSocket connection established

## 🐛 Troubleshooting

### Common Issues

1. **"Backend not running"**
   - Start server: `npm run dev`
   - Check port 5000 is available

2. **"Database connection failed"**
   - Ensure MongoDB is running
   - Check MONGODB_URI in .env

3. **"Authentication failed"**
   - Check JWT_SECRET in .env
   - Verify token format

4. **"Permission denied"**
   - Check user roles and permissions
   - Verify server membership

### Debug Commands

```bash
# Check if server is running
curl -I http://localhost:5000/health

# Check MongoDB connection
mongosh --eval "db.runCommand('ping')"

# View server logs
npm run dev
```

## 🔗 Testing URLs

- **Health:** http://localhost:5000/health
- **API Root:** http://localhost:5000/
- **Register:** POST http://localhost:5000/api/auth/register
- **Servers:** GET http://localhost:5000/api/servers
- **WebSocket:** ws://localhost:5000

## 🎯 Success Criteria

Your backend is working correctly if:
- Health check returns "OK"
- User registration creates username#discriminator
- Server creation works with owner permissions
- Messages can be sent and received
- Friend requests can be sent/accepted
- WebSocket connection authenticates properly

Ready to test? Run `npm test` to get started! 🚀
