import mongoose from 'mongoose';

const callSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['DM', 'GROUP_DM', 'VOICE_CHANNEL'],
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'ENDED', 'MISSED'],
    default: 'ACTIVE'
  },
  // For DM/Group DM calls
  dmChannel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DirectMessageChannel'
  },
  // For voice channel calls
  voiceChannel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel'
  },
  // Call initiator
  initiator: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  // All participants in the call
  participants: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    leftAt: {
      type: Date
    },
    // Voice state
    isMuted: {
      type: Boolean,
      default: false
    },
    isDeafened: {
      type: Boolean,
      default: false
    },
    // Video state
    hasVideo: {
      type: Boolean,
      default: false
    },
    isScreenSharing: {
      type: Boolean,
      default: false
    },
    // Connection state
    connectionState: {
      type: String,
      enum: ['CONNECTING', 'CONNECTED', 'DISCONNECTED', 'RECONNECTING'],
      default: 'CONNECTING'
    }
  }],
  // Call settings
  settings: {
    hasVideo: {
      type: Boolean,
      default: false
    },
    isScreenShare: {
      type: Boolean,
      default: false
    },
    maxParticipants: {
      type: Number,
      default: 25 // Discord default for voice channels
    }
  },
  // Call statistics
  stats: {
    startedAt: {
      type: Date,
      default: Date.now
    },
    endedAt: {
      type: Date
    },
    duration: {
      type: Number, // in seconds
      default: 0
    },
    peakParticipants: {
      type: Number,
      default: 1
    }
  },
  // WebRTC connection details (will be managed by signaling server)
  rtcData: {
    roomId: {
      type: String,
      unique: true,
      required: true
    },
    signalingServer: {
      type: String,
      default: 'default'
    }
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
callSchema.index({ dmChannel: 1, status: 1 });
callSchema.index({ voiceChannel: 1, status: 1 });
callSchema.index({ initiator: 1, status: 1 });
callSchema.index({ 'participants.user': 1 });
callSchema.index({ 'stats.startedAt': -1 });
callSchema.index({ 'rtcData.roomId': 1 });

// Virtual for active participants
callSchema.virtual('activeParticipants').get(function() {
  return this.participants.filter(p => !p.leftAt && p.connectionState === 'CONNECTED');
});

// Virtual for call duration
callSchema.virtual('currentDuration').get(function() {
  if (this.status === 'ENDED' && this.stats.endedAt) {
    return Math.floor((this.stats.endedAt - this.stats.startedAt) / 1000);
  }
  return Math.floor((Date.now() - this.stats.startedAt) / 1000);
});

// Methods
callSchema.methods.addParticipant = function(userId, hasVideo = false) {
  const existingParticipant = this.participants.find(p => 
    p.user.toString() === userId.toString() && !p.leftAt
  );
  
  if (!existingParticipant) {
    this.participants.push({
      user: userId,
      joinedAt: new Date(),
      hasVideo: hasVideo,
      connectionState: 'CONNECTING'
    });
    
    // Update peak participants
    const currentActive = this.participants.filter(p => !p.leftAt).length;
    if (currentActive > this.stats.peakParticipants) {
      this.stats.peakParticipants = currentActive;
    }
    
    return this.save();
  }
  return this;
};

callSchema.methods.removeParticipant = function(userId) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString() && !p.leftAt
  );
  
  if (participant) {
    participant.leftAt = new Date();
    participant.connectionState = 'DISCONNECTED';
    
    // Check if call should end (no active participants)
    const activeCount = this.participants.filter(p => !p.leftAt).length;
    if (activeCount === 0 && this.status === 'ACTIVE') {
      this.endCall();
    }
    
    return this.save();
  }
  return this;
};

callSchema.methods.updateParticipantState = function(userId, updates) {
  const participant = this.participants.find(p => 
    p.user.toString() === userId.toString() && !p.leftAt
  );
  
  if (participant) {
    Object.assign(participant, updates);
    return this.save();
  }
  return this;
};

callSchema.methods.endCall = function() {
  this.status = 'ENDED';
  this.stats.endedAt = new Date();
  this.stats.duration = Math.floor((this.stats.endedAt - this.stats.startedAt) / 1000);
  
  // Mark all participants as left
  this.participants.forEach(p => {
    if (!p.leftAt) {
      p.leftAt = new Date();
      p.connectionState = 'DISCONNECTED';
    }
  });
  
  return this.save();
};

// Static methods
callSchema.statics.getActiveCall = function(channelId, type = 'VOICE_CHANNEL') {
  const query = { status: 'ACTIVE', isDeleted: false };
  
  if (type === 'VOICE_CHANNEL') {
    query.voiceChannel = channelId;
  } else {
    query.dmChannel = channelId;
  }
  
  return this.findOne(query)
    .populate('participants.user', 'username avatar')
    .populate('initiator', 'username avatar');
};

callSchema.statics.getUserActiveCalls = function(userId) {
  return this.find({
    'participants.user': userId,
    status: 'ACTIVE',
    isDeleted: false
  })
    .populate('participants.user', 'username avatar')
    .populate('initiator', 'username avatar')
    .populate('dmChannel', 'participants type name')
    .populate('voiceChannel', 'name server');
};

callSchema.statics.getCallHistory = function(channelId, type = 'VOICE_CHANNEL', limit = 50) {
  const query = { isDeleted: false };
  
  if (type === 'VOICE_CHANNEL') {
    query.voiceChannel = channelId;
  } else {
    query.dmChannel = channelId;
  }
  
  return this.find(query)
    .sort({ 'stats.startedAt': -1 })
    .limit(limit)
    .populate('participants.user', 'username avatar')
    .populate('initiator', 'username avatar');
};

export default mongoose.model('Call', callSchema);