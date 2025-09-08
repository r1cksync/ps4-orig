import mongoose from 'mongoose';

const messageSchema = new mongoose.Schema({
  content: {
    type: String,
    maxlength: 2000
  },
  author: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  channel: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel',
    required: true
  },
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server'
  },
  // Message types
  type: {
    type: String,
    enum: [
      'DEFAULT',
      'RECIPIENT_ADD',
      'RECIPIENT_REMOVE', 
      'CALL',
      'CHANNEL_NAME_CHANGE',
      'CHANNEL_ICON_CHANGE',
      'CHANNEL_PINNED_MESSAGE',
      'GUILD_MEMBER_JOIN',
      'USER_PREMIUM_GUILD_SUBSCRIPTION',
      'SYSTEM'
    ],
    default: 'DEFAULT'
  },
  // Attachments
  attachments: [{
    id: String,
    filename: String,
    contentType: String,
    size: Number,
    url: String,
    proxyUrl: String,
    height: Number, // For images/videos
    width: Number   // For images/videos
  }],
  // Embeds
  embeds: [{
    title: String,
    description: String,
    url: String,
    timestamp: Date,
    color: Number,
    footer: {
      text: String,
      iconUrl: String
    },
    image: {
      url: String,
      height: Number,
      width: Number
    },
    thumbnail: {
      url: String,
      height: Number,
      width: Number
    },
    author: {
      name: String,
      url: String,
      iconUrl: String
    },
    fields: [{
      name: String,
      value: String,
      inline: Boolean
    }]
  }],
  // Mentions
  mentions: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    everyone: {
      type: Boolean,
      default: false
    },
    roles: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role'
    }]
  }],
  // Message reference (for replies)
  reference: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel'
    },
    serverId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Server'
    }
  },
  // Reactions
  reactions: [{
    emoji: {
      name: String,
      id: String, // For custom emojis
      animated: Boolean
    },
    count: {
      type: Number,
      default: 0
    },
    users: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    }]
  }],
  // Message state
  isPinned: {
    type: Boolean,
    default: false
  },
  isEdited: {
    type: Boolean,
    default: false
  },
  editedAt: {
    type: Date
  },
  isDeleted: {
    type: Boolean,
    default: false
  },
  deletedAt: {
    type: Date
  },
  // Fraud detection integration
  fraudCheck: {
    isScanned: {
      type: Boolean,
      default: false
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    riskLevel: {
      type: String,
      enum: ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
      default: 'VERY_LOW'
    },
    flags: [{
      type: String,
      enum: ['SPAM', 'PHISHING', 'MALWARE', 'INAPPROPRIATE', 'SCAM', 'SUSPICIOUS_LINK']
    }],
    scanResult: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ScanResult'
    }
  }
}, {
  timestamps: true
});

// Indexes
messageSchema.index({ channel: 1, createdAt: -1 });
messageSchema.index({ author: 1, createdAt: -1 });
messageSchema.index({ server: 1, createdAt: -1 });
messageSchema.index({ isPinned: 1, channel: 1 });
messageSchema.index({ 'mentions.user': 1 });
messageSchema.index({ content: 'text' });
messageSchema.index({ isDeleted: 1, createdAt: -1 });

// Virtual for reply information
messageSchema.virtual('replyTo', {
  ref: 'Message',
  localField: 'reference.messageId',
  foreignField: '_id',
  justOne: true
});

// Methods
messageSchema.methods.addReaction = function(emoji, userId) {
  let reaction = this.reactions.find(r => 
    r.emoji.name === emoji.name && 
    r.emoji.id === emoji.id
  );
  
  if (!reaction) {
    reaction = {
      emoji: emoji,
      count: 0,
      users: []
    };
    this.reactions.push(reaction);
  }
  
  if (!reaction.users.includes(userId)) {
    reaction.users.push(userId);
    reaction.count = reaction.users.length;
    return this.save();
  }
  
  return this;
};

messageSchema.methods.removeReaction = function(emoji, userId) {
  const reaction = this.reactions.find(r => 
    r.emoji.name === emoji.name && 
    r.emoji.id === emoji.id
  );
  
  if (reaction) {
    reaction.users = reaction.users.filter(u => u.toString() !== userId.toString());
    reaction.count = reaction.users.length;
    
    if (reaction.count === 0) {
      this.reactions = this.reactions.filter(r => r !== reaction);
    }
    
    return this.save();
  }
  
  return this;
};

messageSchema.methods.pin = function() {
  this.isPinned = true;
  return this.save();
};

messageSchema.methods.unpin = function() {
  this.isPinned = false;
  return this.save();
};

messageSchema.methods.edit = function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

messageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

// Static methods
messageSchema.statics.getChannelMessages = function(channelId, limit = 50, before = null) {
  const query = {
    channel: channelId,
    isDeleted: false
  };
  
  if (before) {
    query.createdAt = { $lt: before };
  }
  
  return this.find(query)
    .populate('author', 'name email avatar')
    .populate('mentions.user', 'name avatar')
    .populate('reference.messageId', 'content author')
    .sort({ createdAt: -1 })
    .limit(limit);
};

messageSchema.statics.searchMessages = function(serverId, query, limit = 25) {
  return this.find({
    server: serverId,
    $text: { $search: query },
    isDeleted: false
  }).populate('author', 'name avatar')
    .populate('channel', 'name')
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .limit(limit);
};

messageSchema.statics.getPinnedMessages = function(channelId) {
  return this.find({
    channel: channelId,
    isPinned: true,
    isDeleted: false
  }).populate('author', 'name avatar')
    .sort({ createdAt: -1 });
};

export default mongoose.model('Message', messageSchema);
