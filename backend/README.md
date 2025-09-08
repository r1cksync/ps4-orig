# IntelliHack Chat & Fraud Detection Backend

A comprehensive Discord-like chat application backend with integrated real-time fraud detection capabilities.

## 🌟 Features

### 💬 Discord-like Chat System
- **Servers & Channels**: Create servers with text/voice channels, categories, and permissions
- **Real-time Messaging**: Socket.IO powered instant messaging with typing indicators
- **Voice Channels**: Connect/disconnect from voice channels with user state tracking
- **Direct Messages**: Private 1-on-1 and group DM conversations
- **Friend System**: Send/accept friend requests, block users, search for friends
- **User Presence**: Online/idle/DND/invisible status with custom status messages
- **Message Features**: Reactions, replies, message editing, pinning, search
- **Permissions System**: Role-based access control with Discord-like permissions
- **Rich Content**: Support for attachments, embeds, and rich message content

### 🛡️ Fraud Detection Integration
- **Real-time Scam Detection**: Every message analyzed for potential fraud/scams
- **URL Reputation Checking**: Automatic scanning of shared links
- **Content Analysis**: AI-powered analysis of text, images, and attachments
- **Risk Scoring**: Messages flagged with risk levels (low/medium/high)
- **Alert System**: Real-time notifications for detected threats

## 🏗️ Architecture

### Models
- **User**: Discord-like user profiles with username#discriminator system
- **Server**: Chat servers with member management and settings
- **Channel**: Text/voice channels with permissions and categories
- **Message**: Rich messaging with reactions, replies, and fraud detection
- **Role**: Permission-based role system
- **DirectMessage**: Private messaging system
- **Friendship**: Friend request and relationship management

### API Endpoints

#### Authentication
- `POST /api/auth/register` - Register new user
- `POST /api/auth/login` - User login
- `POST /api/auth/google` - Google OAuth login

#### Servers
- `GET /api/servers` - Get user's servers
- `POST /api/servers` - Create new server
- `GET /api/servers/:id` - Get server details
- `PUT /api/servers/:id` - Update server
- `DELETE /api/servers/:id` - Delete server
- `POST /api/servers/:id/join` - Join server with invite
- `POST /api/servers/:id/leave` - Leave server

#### Channels
- `POST /api/channels` - Create channel
- `GET /api/channels/:id` - Get channel details
- `PUT /api/channels/:id` - Update channel
- `DELETE /api/channels/:id` - Delete channel
- `GET /api/channels/:id/messages` - Get channel messages
- `POST /api/channels/:id/messages` - Send message
- `POST /api/channels/:id/voice/join` - Join voice channel
- `POST /api/channels/:id/voice/leave` - Leave voice channel

#### Messages
- `GET /api/messages/:id` - Get specific message
- `PUT /api/messages/:id` - Edit message
- `DELETE /api/messages/:id` - Delete message
- `POST /api/messages/:id/reactions` - Add reaction
- `DELETE /api/messages/:id/reactions/:emoji` - Remove reaction
- `POST /api/messages/:id/pin` - Pin message
- `GET /api/messages/search` - Search messages

#### Direct Messages
- `GET /api/dms` - Get DM channels
- `POST /api/dms` - Create/get DM channel
- `GET /api/dms/:id` - Get DM channel details
- `GET /api/dms/:id/messages` - Get DM messages
- `POST /api/dms/:id/messages` - Send DM message

#### Friends
- `GET /api/friends` - Get friends and requests
- `POST /api/friends/request` - Send friend request
- `PUT /api/friends/:id/accept` - Accept friend request
- `PUT /api/friends/:id/decline` - Decline friend request
- `DELETE /api/friends/:id` - Remove friend
- `POST /api/friends/:id/block` - Block user
- `GET /api/friends/search` - Search users

### Socket.IO Events

#### Connection Management
- `connect` - User connects to WebSocket
- `disconnect` - User disconnects
- `joinServer` - Join server rooms
- `leaveServer` - Leave server rooms
- `joinChannel` - Join channel room
- `leaveChannel` - Leave channel room

#### Messaging
- `message` - New message in channel
- `messageUpdate` - Message edited
- `messageDelete` - Message deleted
- `directMessage` - New DM message
- `typing` - User typing in channel
- `dmTyping` - User typing in DM

#### Voice
- `joinVoiceChannel` - Join voice channel
- `leaveVoiceChannel` - Leave voice channel
- `voiceStateUpdate` - Voice state changes
- `userVoiceStateUpdate` - User's voice settings update

#### Status & Presence
- `statusUpdate` - User status change
- `customStatusUpdate` - Custom status update
- `friendStatusUpdate` - Friend's status changed
- `memberStatusUpdate` - Server member status changed

#### Friends
- `friendRequest` - New friend request
- `friendRequestAccepted` - Friend request accepted
- `friendRequestDeclined` - Friend request declined
- `friendRemoved` - Friend removed
- `userBlocked` - User blocked

## 🚀 Getting Started

### Prerequisites
- Node.js 18+ 
- MongoDB
- Redis (optional, for caching)

### Installation

1. Clone the repository
```bash
git clone <repository-url>
cd backend
```

2. Install dependencies
```bash
npm install
```

3. Configure environment variables
```bash
cp .env.example .env
```

Edit `.env` with your configuration:
```env
# Database
MONGODB_URI=mongodb://localhost:27017/intellihack
REDIS_URL=redis://localhost:6379

# JWT
JWT_SECRET=your-super-secret-jwt-key

# Google OAuth
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Server
PORT=5000
NODE_ENV=development
FRONTEND_URL=http://localhost:3000

# Fraud Detection APIs
VIRUSTOTAL_API_KEY=your-virustotal-key
PERSPECTIVE_API_KEY=your-perspective-api-key
```

4. Start the server
```bash
# Development
npm run dev

# Production
npm start
```

## 🏛️ Database Schema

### User Schema
```javascript
{
  email: String (unique),
  password: String,
  username: String (unique),
  discriminator: String (4-digit),
  displayName: String,
  avatar: String,
  banner: String,
  bio: String,
  status: 'ONLINE'|'IDLE'|'DND'|'INVISIBLE'|'OFFLINE',
  customStatus: {
    text: String,
    emoji: Object,
    expiresAt: Date
  },
  badges: [String],
  voiceSettings: Object,
  lastSeen: Date
}
```

### Server Schema
```javascript
{
  name: String,
  description: String,
  icon: String,
  banner: String,
  owner: ObjectId,
  members: [{
    user: ObjectId,
    roles: [ObjectId],
    joinedAt: Date,
    nick: String
  }],
  inviteCodes: [{
    code: String,
    createdBy: ObjectId,
    createdAt: Date,
    expiresAt: Date,
    maxUses: Number,
    uses: Number
  }]
}
```

### Channel Schema
```javascript
{
  name: String,
  type: 'TEXT'|'VOICE'|'CATEGORY',
  server: ObjectId,
  category: ObjectId,
  topic: String,
  position: Number,
  slowMode: Number,
  connectedUsers: [ObjectId], // for voice channels
  permissionOverrides: [{
    id: ObjectId,
    type: 'ROLE'|'USER',
    allow: Number,
    deny: Number
  }]
}
```

### Message Schema
```javascript
{
  content: String,
  author: ObjectId,
  channel: ObjectId,
  server: ObjectId,
  attachments: [Object],
  embeds: [Object],
  reactions: [{
    emoji: Object,
    users: [ObjectId],
    count: Number
  }],
  referencedMessage: ObjectId,
  editHistory: [Object],
  isPinned: Boolean,
  fraudScore: Number,
  isDeleted: Boolean
}
```

## 🔒 Security Features

- **JWT Authentication**: Secure token-based authentication
- **Rate Limiting**: Protection against spam and abuse
- **CORS Configuration**: Proper cross-origin resource sharing
- **Helmet Security**: Security headers and protection
- **Input Validation**: Comprehensive request validation
- **Permission System**: Role-based access control
- **Fraud Detection**: Real-time content analysis

## 🛠️ Development

### Code Structure
```
backend/
├── config/          # Configuration files
├── middleware/      # Express middleware
├── models/          # MongoDB models
├── routes/          # API route handlers
├── socketHandlers/  # Socket.IO event handlers
├── services/        # Business logic services
├── utils/           # Utility functions
└── server.js        # Main server file
```

### Socket.IO Rooms
- `user:{userId}` - Personal user room
- `server:{serverId}` - Server-wide room
- `channel:{channelId}` - Channel-specific room
- `dm:{dmChannelId}` - Direct message room

## 📊 Performance

- **Real-time Messaging**: Sub-100ms message delivery
- **Scalable Architecture**: Horizontal scaling support
- **Database Optimization**: Proper indexing and queries
- **Memory Management**: Efficient data structures
- **Caching Strategy**: Redis integration for performance

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Contact the development team
- Check the documentation

---

Built with ❤️ for secure, real-time communication with integrated fraud protection.
