# Manual API Testing Guide

This guide provides curl commands to manually test all Discord-like chat backend endpoints.

## Prerequisites

1. Start the backend server:
```bash
cd backend
npm run dev
```

2. Make sure MongoDB is running and accessible

## Environment Variables

Set these variables for easier testing:
```bash
export BASE_URL="http://localhost:5000"
export API_URL="$BASE_URL/api"
export TOKEN=""  # Will be set after login
```

## 1. Health Check

```bash
curl -X GET "$BASE_URL/health"
```

Expected response:
```json
{
  "status": "OK",
  "timestamp": "2025-09-08T...",
  "uptime": 123.456,
  "database": "connected"
}
```

## 2. Authentication

### Register User 1
```bash
curl -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser1@example.com",
    "password": "testpassword123",
    "name": "Test User 1",
    "username": "testuser1"
  }'
```

### Login User 1
```bash
curl -X POST "$API_URL/auth/login" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser1@example.com",
    "password": "testpassword123"
  }'
```

**Copy the token from response and set it:**
```bash
export TOKEN="your_jwt_token_here"
```

### Register User 2 (for friend testing)
```bash
curl -X POST "$API_URL/auth/register" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser2@example.com",
    "password": "testpassword123",
    "name": "Test User 2",
    "username": "testuser2"
  }'
```

## 3. Server Management

### Create Server
```bash
curl -X POST "$API_URL/servers" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Test Server",
    "description": "A test server for API testing",
    "icon": "https://example.com/icon.png"
  }'
```

**Save the server ID from response:**
```bash
export SERVER_ID="your_server_id_here"
```

### Get User Servers
```bash
curl -X GET "$API_URL/servers" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Server Details
```bash
curl -X GET "$API_URL/servers/$SERVER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Update Server
```bash
curl -X PUT "$API_URL/servers/$SERVER_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "Updated Test Server",
    "description": "Updated description"
  }'
```

### Create Invite Code
```bash
curl -X POST "$API_URL/servers/$SERVER_ID/invites" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "maxUses": 10,
    "expiresAt": "2025-09-09T12:00:00.000Z"
  }'
```

### Get Server Channels
```bash
curl -X GET "$API_URL/servers/$SERVER_ID/channels" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Server Roles
```bash
curl -X GET "$API_URL/servers/$SERVER_ID/roles" \
  -H "Authorization: Bearer $TOKEN"
```

## 4. Channel Management

### Create Text Channel
```bash
curl -X POST "$API_URL/channels" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "test-channel",
    "type": "TEXT",
    "serverId": "'$SERVER_ID'",
    "topic": "Test channel for API testing"
  }'
```

**Save the channel ID:**
```bash
export CHANNEL_ID="your_channel_id_here"
```

### Create Voice Channel
```bash
curl -X POST "$API_URL/channels" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "voice-channel",
    "type": "VOICE",
    "serverId": "'$SERVER_ID'"
  }'
```

**Save the voice channel ID:**
```bash
export VOICE_CHANNEL_ID="your_voice_channel_id_here"
```

### Get Channel Details
```bash
curl -X GET "$API_URL/channels/$CHANNEL_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Update Channel
```bash
curl -X PUT "$API_URL/channels/$CHANNEL_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "updated-test-channel",
    "topic": "Updated topic"
  }'
```

## 5. Messaging

### Send Message
```bash
curl -X POST "$API_URL/channels/$CHANNEL_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "content": "Hello, this is a test message!",
    "attachments": [],
    "embeds": []
  }'
```

**Save the message ID:**
```bash
export MESSAGE_ID="your_message_id_here"
```

### Get Channel Messages
```bash
curl -X GET "$API_URL/channels/$CHANNEL_ID/messages?limit=20" \
  -H "Authorization: Bearer $TOKEN"
```

### Edit Message
```bash
curl -X PUT "$API_URL/messages/$MESSAGE_ID" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "content": "This message has been edited!"
  }'
```

### Add Reaction
```bash
curl -X POST "$API_URL/messages/$MESSAGE_ID/reactions" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "emoji": {
      "name": "👍",
      "id": null
    }
  }'
```

### Remove Reaction
```bash
curl -X DELETE "$API_URL/messages/$MESSAGE_ID/reactions/👍" \
  -H "Authorization: Bearer $TOKEN"
```

### Pin Message
```bash
curl -X POST "$API_URL/messages/$MESSAGE_ID/pin" \
  -H "Authorization: Bearer $TOKEN"
```

### Unpin Message
```bash
curl -X DELETE "$API_URL/messages/$MESSAGE_ID/pin" \
  -H "Authorization: Bearer $TOKEN"
```

### Send Typing Indicator
```bash
curl -X POST "$API_URL/channels/$CHANNEL_ID/typing" \
  -H "Authorization: Bearer $TOKEN"
```

### Search Messages
```bash
curl -X GET "$API_URL/messages/search?query=test&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

## 6. Voice Channels

### Join Voice Channel
```bash
curl -X POST "$API_URL/channels/$VOICE_CHANNEL_ID/voice/join" \
  -H "Authorization: Bearer $TOKEN"
```

### Leave Voice Channel
```bash
curl -X POST "$API_URL/channels/$VOICE_CHANNEL_ID/voice/leave" \
  -H "Authorization: Bearer $TOKEN"
```

## 7. Direct Messages

### Create DM Channel
```bash
curl -X POST "$API_URL/dms" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "recipientId": "recipient_user_id_here"
  }'
```

**Save the DM channel ID:**
```bash
export DM_CHANNEL_ID="your_dm_channel_id_here"
```

### Get DM Channels
```bash
curl -X GET "$API_URL/dms" \
  -H "Authorization: Bearer $TOKEN"
```

### Send DM Message
```bash
curl -X POST "$API_URL/dms/$DM_CHANNEL_ID/messages" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "content": "Hello! This is a direct message."
  }'
```

### Get DM Messages
```bash
curl -X GET "$API_URL/dms/$DM_CHANNEL_ID/messages" \
  -H "Authorization: Bearer $TOKEN"
```

### Send DM Typing Indicator
```bash
curl -X POST "$API_URL/dms/$DM_CHANNEL_ID/typing" \
  -H "Authorization: Bearer $TOKEN"
```

## 8. Friend System

### Send Friend Request
```bash
curl -X POST "$API_URL/friends/request" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "username": "testuser2",
    "discriminator": "1234"
  }'
```

### Get Friends List
```bash
curl -X GET "$API_URL/friends" \
  -H "Authorization: Bearer $TOKEN"
```

### Get Pending Friend Requests
```bash
curl -X GET "$API_URL/friends?type=pending" \
  -H "Authorization: Bearer $TOKEN"
```

### Accept Friend Request
```bash
curl -X PUT "$API_URL/friends/FRIENDSHIP_ID_HERE/accept" \
  -H "Authorization: Bearer $TOKEN"
```

### Decline Friend Request
```bash
curl -X PUT "$API_URL/friends/FRIENDSHIP_ID_HERE/decline" \
  -H "Authorization: Bearer $TOKEN"
```

### Remove Friend
```bash
curl -X DELETE "$API_URL/friends/FRIENDSHIP_ID_HERE" \
  -H "Authorization: Bearer $TOKEN"
```

### Block User
```bash
curl -X POST "$API_URL/friends/USER_ID_HERE/block" \
  -H "Authorization: Bearer $TOKEN"
```

### Unblock User
```bash
curl -X DELETE "$API_URL/friends/USER_ID_HERE/unblock" \
  -H "Authorization: Bearer $TOKEN"
```

### Search Users
```bash
curl -X GET "$API_URL/friends/search?query=test&limit=10" \
  -H "Authorization: Bearer $TOKEN"
```

## 9. Cleanup

### Delete Channel
```bash
curl -X DELETE "$API_URL/channels/$CHANNEL_ID" \
  -H "Authorization: Bearer $TOKEN"
```

### Delete Server
```bash
curl -X DELETE "$API_URL/servers/$SERVER_ID" \
  -H "Authorization: Bearer $TOKEN"
```

## Expected Response Codes

- **200**: Success (GET requests)
- **201**: Created (POST requests)
- **400**: Bad Request (validation errors)
- **401**: Unauthorized (invalid/missing token)
- **403**: Forbidden (insufficient permissions)
- **404**: Not Found
- **429**: Too Many Requests (rate limited)
- **500**: Internal Server Error

## WebSocket Testing

To test real-time features, you can use a WebSocket client and connect to:
```
ws://localhost:5000
```

Include authentication:
```javascript
const socket = io('http://localhost:5000', {
  auth: {
    token: 'your_jwt_token_here'
  }
});
```

## Error Responses

All errors follow this format:
```json
{
  "error": "Error message",
  "details": "Additional details if available"
}
```

## Notes

1. Replace placeholder values (USER_ID_HERE, FRIENDSHIP_ID_HERE, etc.) with actual IDs from previous responses
2. JWT tokens expire after 7 days by default
3. All timestamps are in ISO 8601 format
4. The fraud detection system automatically analyzes all messages
5. Rate limiting is applied to prevent abuse
6. CORS is configured for localhost origins in development
