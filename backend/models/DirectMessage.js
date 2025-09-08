import mongoose from 'mongoose';

const directMessageSchema = new mongoose.Schema({
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
    ref: 'DirectMessageChannel',
    required: true
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
    height: Number,
    width: Number
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
  // Message reference (for replies)
  reference: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DirectMessage'
    },
    channelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DirectMessageChannel'
    }
  },
  // Referenced message for replies
  referencedMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DirectMessage'
  },
  // Reactions
  reactions: [{
    emoji: {
      name: String,
      id: String,
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
  // Read by recipients
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    readAt: {
      type: Date,
      default: Date.now
    }
  }],
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
directMessageSchema.index({ channel: 1, createdAt: -1 });
directMessageSchema.index({ author: 1, createdAt: -1 });
directMessageSchema.index({ 'readBy.user': 1 });
directMessageSchema.index({ content: 'text' });
directMessageSchema.index({ isDeleted: 1, createdAt: -1 });

// Methods
directMessageSchema.methods.addReaction = function(emoji, userId) {
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

directMessageSchema.methods.removeReaction = function(emoji, userId) {
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

directMessageSchema.methods.edit = function(newContent) {
  this.content = newContent;
  this.isEdited = true;
  this.editedAt = new Date();
  return this.save();
};

directMessageSchema.methods.softDelete = function() {
  this.isDeleted = true;
  this.deletedAt = new Date();
  return this.save();
};

directMessageSchema.methods.markAsRead = function(userId) {
  const existingRead = this.readBy.find(r => r.user.toString() === userId.toString());
  if (!existingRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });
    return this.save();
  }
  return this;
};

// Static methods
directMessageSchema.statics.getChannelMessages = function(channelId, limit = 50, before = null) {
  const query = {
    channel: channelId,
    isDeleted: false
  };
  
  if (before) {
    query.createdAt = { $lt: before };
  }
  
  return this.find(query)
    .populate('author', 'name email avatar')
    .populate('reference.messageId', 'content author')
    .sort({ createdAt: -1 })
    .limit(limit);
};

directMessageSchema.statics.searchMessages = function(channelId, query, limit = 25) {
  return this.find({
    channel: channelId,
    $text: { $search: query },
    isDeleted: false
  }).populate('author', 'name avatar')
    .sort({ score: { $meta: 'textScore' }, createdAt: -1 })
    .limit(limit);
};

export default mongoose.model('DirectMessage', directMessageSchema);
