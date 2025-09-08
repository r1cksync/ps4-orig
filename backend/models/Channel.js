import mongoose from 'mongoose';

const channelSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 1000
  },
  type: {
    type: String,
    enum: ['TEXT', 'VOICE', 'CATEGORY', 'NEWS', 'STORE'],
    required: true,
    default: 'TEXT'
  },
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true
  },
  category: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel' // Reference to a CATEGORY type channel
  },
  position: {
    type: Number,
    default: 0
  },
  permissions: [{
    target: {
      type: String,
      enum: ['ROLE', 'USER']
    },
    targetId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'permissions.target' // Dynamic reference
    },
    allow: [{
      type: String,
      enum: [
        'VIEW_CHANNEL',
        'SEND_MESSAGES', 
        'READ_MESSAGE_HISTORY',
        'ATTACH_FILES',
        'EMBED_LINKS',
        'USE_EXTERNAL_EMOJIS',
        'CONNECT', // Voice
        'SPEAK', // Voice
        'MUTE_MEMBERS', // Voice
        'DEAFEN_MEMBERS', // Voice
        'MANAGE_MESSAGES',
        'MANAGE_CHANNEL',
        'MENTION_EVERYONE'
      ]
    }],
    deny: [{
      type: String,
      enum: [
        'VIEW_CHANNEL',
        'SEND_MESSAGES',
        'READ_MESSAGE_HISTORY', 
        'ATTACH_FILES',
        'EMBED_LINKS',
        'USE_EXTERNAL_EMOJIS',
        'CONNECT',
        'SPEAK',
        'MUTE_MEMBERS',
        'DEAFEN_MEMBERS',
        'MANAGE_MESSAGES',
        'MANAGE_CHANNEL',
        'MENTION_EVERYONE'
      ]
    }]
  }],
  settings: {
    isNsfw: {
      type: Boolean,
      default: false
    },
    slowMode: {
      type: Number, // Seconds between messages
      default: 0,
      min: 0,
      max: 21600 // 6 hours
    },
    topic: {
      type: String,
      maxlength: 1024
    },
    userLimit: {
      type: Number, // For voice channels
      min: 0,
      max: 99
    },
    bitrate: {
      type: Number, // For voice channels (in kbps)
      min: 8,
      max: 384,
      default: 64
    }
  },
  lastMessageId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  lastMessageAt: {
    type: Date
  },
  // Voice channel specific
  connectedUsers: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    connectedAt: {
      type: Date,
      default: Date.now
    },
    isMuted: {
      type: Boolean,
      default: false
    },
    isDeafened: {
      type: Boolean,
      default: false
    }
  }],
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
channelSchema.index({ server: 1, position: 1 });
channelSchema.index({ server: 1, type: 1 });
channelSchema.index({ server: 1, isDeleted: 1 });
channelSchema.index({ lastMessageAt: -1 });
channelSchema.index({ name: 'text' });

// Virtual for connected user count
channelSchema.virtual('connectedUserCount').get(function() {
  return this.connectedUsers.length;
});

// Methods
channelSchema.methods.addConnectedUser = function(userId) {
  const existingUser = this.connectedUsers.find(u => u.user.toString() === userId.toString());
  if (!existingUser && this.type === 'VOICE') {
    this.connectedUsers.push({
      user: userId,
      connectedAt: new Date()
    });
    return this.save();
  }
  return this;
};

channelSchema.methods.removeConnectedUser = function(userId) {
  this.connectedUsers = this.connectedUsers.filter(u => u.user.toString() !== userId.toString());
  return this.save();
};

channelSchema.methods.updateUserVoiceState = function(userId, { isMuted, isDeafened }) {
  const user = this.connectedUsers.find(u => u.user.toString() === userId.toString());
  if (user) {
    if (isMuted !== undefined) user.isMuted = isMuted;
    if (isDeafened !== undefined) user.isDeafened = isDeafened;
    return this.save();
  }
  return this;
};

// Static methods
channelSchema.statics.getServerChannels = function(serverId) {
  return this.find({
    server: serverId,
    isDeleted: false
  }).sort({ position: 1, createdAt: 1 });
};

channelSchema.statics.getTextChannels = function(serverId) {
  return this.find({
    server: serverId,
    type: 'TEXT',
    isDeleted: false
  }).sort({ position: 1 });
};

channelSchema.statics.getVoiceChannels = function(serverId) {
  return this.find({
    server: serverId,
    type: 'VOICE',
    isDeleted: false
  }).sort({ position: 1 })
    .populate('connectedUsers.user', 'name avatar');
};

export default mongoose.model('Channel', channelSchema);
