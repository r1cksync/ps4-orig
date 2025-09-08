import mongoose from 'mongoose';

const directMessageSchema = new mongoose.Schema({
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }],
  type: {
    type: String,
    enum: ['DM', 'GROUP_DM'],
    default: 'DM'
  },
  name: {
    type: String, // For group DMs
    maxlength: 100
  },
  icon: {
    type: String // For group DMs
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User' // For group DMs
  },
  lastMessage: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'DirectMessage'
  },
  lastMessageAt: {
    type: Date
  },
  // Read status for each participant
  readStatus: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    lastReadMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'DirectMessage'
    },
    lastReadAt: {
      type: Date
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
directMessageSchema.index({ participants: 1 });
directMessageSchema.index({ lastMessageAt: -1 });
directMessageSchema.index({ isDeleted: 1, lastMessageAt: -1 });

// Methods
directMessageSchema.methods.addParticipant = function(userId) {
  if (!this.participants.includes(userId) && this.type === 'GROUP_DM') {
    this.participants.push(userId);
    this.readStatus.push({
      user: userId,
      lastReadAt: new Date()
    });
    return this.save();
  }
  return this;
};

directMessageSchema.methods.removeParticipant = function(userId) {
  if (this.type === 'GROUP_DM') {
    this.participants = this.participants.filter(p => p.toString() !== userId.toString());
    this.readStatus = this.readStatus.filter(r => r.user.toString() !== userId.toString());
    return this.save();
  }
  return this;
};

directMessageSchema.methods.updateReadStatus = function(userId, messageId) {
  const status = this.readStatus.find(r => r.user.toString() === userId.toString());
  if (status) {
    status.lastReadMessageId = messageId;
    status.lastReadAt = new Date();
  } else {
    this.readStatus.push({
      user: userId,
      lastReadMessageId: messageId,
      lastReadAt: new Date()
    });
  }
  return this.save();
};

directMessageSchema.methods.getUnreadCount = function(userId) {
  const userReadStatus = this.readStatus.find(r => r.user.toString() === userId.toString());
  if (!userReadStatus || !userReadStatus.lastReadMessageId) {
    return this.messageCount || 0;
  }
  
  // This would typically require a separate query to count messages after the last read message
  return 0; // Placeholder
};

// Static methods
directMessageSchema.statics.findOrCreateDM = async function(user1Id, user2Id) {
  // Find existing DM between two users
  let dm = await this.findOne({
    type: 'DM',
    participants: { $all: [user1Id, user2Id], $size: 2 },
    isDeleted: false
  });
  
  if (!dm) {
    // Create new DM
    dm = await this.create({
      type: 'DM',
      participants: [user1Id, user2Id],
      readStatus: [
        { user: user1Id, lastReadAt: new Date() },
        { user: user2Id, lastReadAt: new Date() }
      ]
    });
  }
  
  return dm;
};

directMessageSchema.statics.getUserDMs = function(userId) {
  return this.find({
    participants: userId,
    isDeleted: false
  }).populate('participants', 'name email avatar status')
    .populate('lastMessage', 'content author createdAt type')
    .sort({ lastMessageAt: -1 });
};

directMessageSchema.statics.createGroupDM = function(creatorId, participantIds, name) {
  const allParticipants = [creatorId, ...participantIds];
  const readStatus = allParticipants.map(userId => ({
    user: userId,
    lastReadAt: new Date()
  }));
  
  return this.create({
    type: 'GROUP_DM',
    participants: allParticipants,
    name: name,
    owner: creatorId,
    readStatus: readStatus
  });
};

export default mongoose.model('DirectMessageChannel', directMessageSchema);
