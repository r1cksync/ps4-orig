import mongoose from 'mongoose';

const voiceStateSchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // Current channel (voice channel or DM call)
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel' // For voice channels
  },
  dmChannel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DirectMessageChannel' // For DM calls
  },
  // Current call
  call: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Call'
  },
  // Voice settings
  isMuted: {
    type: Boolean,
    default: false
  },
  isDeafened: {
    type: Boolean,
    default: false
  },
  isSelfMuted: {
    type: Boolean,
    default: false
  },
  isSelfDeafened: {
    type: Boolean,
    default: false
  },
  // Video settings
  hasVideo: {
    type: Boolean,
    default: false
  },
  isScreenSharing: {
    type: Boolean,
    default: false
  },
  // Connection info
  connectionState: {
    type: String,
    enum: ['DISCONNECTED', 'CONNECTING', 'CONNECTED', 'RECONNECTING'],
    default: 'DISCONNECTED'
  },
  rtcConnectionId: {
    type: String // WebRTC connection identifier
  },
  // Session info
  joinedAt: {
    type: Date
  },
  lastActiveAt: {
    type: Date,
    default: Date.now
  },
  // Device info
  inputDevice: {
    type: String // Microphone device
  },
  outputDevice: {
    type: String // Speaker/headphone device
  },
  cameraDevice: {
    type: String // Camera device
  },
  // Quality settings
  quality: {
    bitrate: {
      type: Number,
      default: 64 // kbps
    },
    resolution: {
      type: String,
      enum: ['480p', '720p', '1080p'],
      default: '720p'
    },
    frameRate: {
      type: Number,
      enum: [15, 30, 60],
      default: 30
    }
  }
}, {
  timestamps: true
});

// Indexes
voiceStateSchema.index({ user: 1 }, { unique: true });
voiceStateSchema.index({ channel: 1 });
voiceStateSchema.index({ dmChannel: 1 });
voiceStateSchema.index({ call: 1 });
voiceStateSchema.index({ connectionState: 1 });
voiceStateSchema.index({ lastActiveAt: -1 });

// Virtual for current channel (voice or DM)
voiceStateSchema.virtual('currentChannel').get(function() {
  return this.channel || this.dmChannel;
});

// Virtual for is in call
voiceStateSchema.virtual('isInCall').get(function() {
  return this.connectionState === 'CONNECTED' && (this.channel || this.dmChannel);
});

// Methods
voiceStateSchema.methods.joinChannel = function(channelId, type = 'voice') {
  this.connectionState = 'CONNECTING';
  this.joinedAt = new Date();
  this.lastActiveAt = new Date();
  
  if (type === 'voice') {
    this.channel = channelId;
    this.dmChannel = null;
  } else {
    this.dmChannel = channelId;
    this.channel = null;
  }
  
  return this.save();
};

voiceStateSchema.methods.leaveChannel = function() {
  this.connectionState = 'DISCONNECTED';
  this.channel = null;
  this.dmChannel = null;
  this.call = null;
  this.hasVideo = false;
  this.isScreenSharing = false;
  this.rtcConnectionId = null;
  this.lastActiveAt = new Date();
  
  return this.save();
};

voiceStateSchema.methods.updateVoiceSettings = function(settings) {
  const allowedSettings = ['isMuted', 'isDeafened', 'isSelfMuted', 'isSelfDeafened'];
  
  allowedSettings.forEach(setting => {
    if (settings[setting] !== undefined) {
      this[setting] = settings[setting];
    }
  });
  
  this.lastActiveAt = new Date();
  return this.save();
};

voiceStateSchema.methods.updateVideoSettings = function(settings) {
  const allowedSettings = ['hasVideo', 'isScreenSharing'];
  
  allowedSettings.forEach(setting => {
    if (settings[setting] !== undefined) {
      this[setting] = settings[setting];
    }
  });
  
  this.lastActiveAt = new Date();
  return this.save();
};

voiceStateSchema.methods.updateConnection = function(connectionState, rtcConnectionId = null) {
  this.connectionState = connectionState;
  if (rtcConnectionId) {
    this.rtcConnectionId = rtcConnectionId;
  }
  this.lastActiveAt = new Date();
  
  if (connectionState === 'CONNECTED') {
    this.joinedAt = this.joinedAt || new Date();
  }
  
  return this.save();
};

// Static methods
voiceStateSchema.statics.getUserVoiceState = function(userId) {
  return this.findOne({ user: userId })
    .populate('user', 'username avatar')
    .populate('channel', 'name type server')
    .populate('dmChannel', 'participants type name')
    .populate('call');
};

voiceStateSchema.statics.getChannelVoiceStates = function(channelId, type = 'voice') {
  const query = {};
  if (type === 'voice') {
    query.channel = channelId;
  } else {
    query.dmChannel = channelId;
  }
  
  return this.find(query)
    .populate('user', 'username avatar')
    .sort({ joinedAt: 1 });
};

voiceStateSchema.statics.getActiveVoiceStates = function() {
  return this.find({
    connectionState: { $in: ['CONNECTING', 'CONNECTED', 'RECONNECTING'] }
  })
    .populate('user', 'username avatar')
    .populate('channel', 'name type server')
    .populate('dmChannel', 'participants type name');
};

voiceStateSchema.statics.createOrUpdateVoiceState = function(userId, data) {
  return this.findOneAndUpdate(
    { user: userId },
    { ...data, user: userId, lastActiveAt: new Date() },
    { upsert: true, new: true, runValidators: true }
  );
};

export default mongoose.model('VoiceState', voiceStateSchema);