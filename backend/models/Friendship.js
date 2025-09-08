import mongoose from 'mongoose';

const friendshipSchema = new mongoose.Schema({
  requester: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  recipient: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  status: {
    type: String,
    enum: ['PENDING', 'ACCEPTED', 'DECLINED', 'BLOCKED'],
    default: 'PENDING'
  },
  type: {
    type: String,
    enum: ['FRIEND_REQUEST', 'FRIEND', 'BLOCKED'],
    default: 'FRIEND_REQUEST'
  },
  acceptedAt: {
    type: Date
  },
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  blockedAt: {
    type: Date
  }
}, {
  timestamps: true
});

// Indexes
friendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });
friendshipSchema.index({ requester: 1, status: 1 });
friendshipSchema.index({ recipient: 1, status: 1 });
friendshipSchema.index({ status: 1, createdAt: -1 });

// Methods
friendshipSchema.methods.accept = function() {
  this.status = 'ACCEPTED';
  this.type = 'FRIEND';
  this.acceptedAt = new Date();
  return this.save();
};

friendshipSchema.methods.decline = function() {
  this.status = 'DECLINED';
  return this.save();
};

friendshipSchema.methods.block = function(blockedBy) {
  this.status = 'BLOCKED';
  this.type = 'BLOCKED';
  this.blockedBy = blockedBy;
  this.blockedAt = new Date();
  return this.save();
};

friendshipSchema.methods.unblock = function() {
  this.status = 'DECLINED';
  this.type = 'FRIEND_REQUEST';
  this.blockedBy = undefined;
  this.blockedAt = undefined;
  return this.save();
};

// Static methods
friendshipSchema.statics.sendFriendRequest = async function(requesterId, recipientId) {
  // Check if friendship already exists
  const existing = await this.findOne({
    $or: [
      { requester: requesterId, recipient: recipientId },
      { requester: recipientId, recipient: requesterId }
    ]
  });
  
  if (existing) {
    if (existing.status === 'BLOCKED') {
      throw new Error('Cannot send friend request to blocked user');
    }
    if (existing.status === 'PENDING') {
      throw new Error('Friend request already pending');
    }
    if (existing.status === 'ACCEPTED') {
      throw new Error('Users are already friends');
    }
  }
  
  return this.create({
    requester: requesterId,
    recipient: recipientId,
    status: 'PENDING',
    type: 'FRIEND_REQUEST'
  });
};

friendshipSchema.statics.getFriends = function(userId) {
  return this.find({
    $or: [
      { requester: userId, status: 'ACCEPTED' },
      { recipient: userId, status: 'ACCEPTED' }
    ]
  }).populate('requester', 'name email avatar status')
    .populate('recipient', 'name email avatar status')
    .sort({ acceptedAt: -1 });
};

friendshipSchema.statics.getPendingRequests = function(userId, type = 'incoming') {
  const query = type === 'incoming' 
    ? { recipient: userId, status: 'PENDING' }
    : { requester: userId, status: 'PENDING' };
    
  return this.find(query)
    .populate('requester', 'name email avatar')
    .populate('recipient', 'name email avatar')
    .sort({ createdAt: -1 });
};

friendshipSchema.statics.getBlockedUsers = function(userId) {
  return this.find({
    $or: [
      { requester: userId, status: 'BLOCKED' },
      { recipient: userId, status: 'BLOCKED' }
    ]
  }).populate('requester', 'name email avatar')
    .populate('recipient', 'name email avatar')
    .sort({ blockedAt: -1 });
};

friendshipSchema.statics.areFriends = async function(user1Id, user2Id) {
  const friendship = await this.findOne({
    $or: [
      { requester: user1Id, recipient: user2Id, status: 'ACCEPTED' },
      { requester: user2Id, recipient: user1Id, status: 'ACCEPTED' }
    ]
  });
  
  return !!friendship;
};

friendshipSchema.statics.isBlocked = async function(user1Id, user2Id) {
  const friendship = await this.findOne({
    $or: [
      { requester: user1Id, recipient: user2Id, status: 'BLOCKED' },
      { requester: user2Id, recipient: user1Id, status: 'BLOCKED' }
    ]
  });
  
  return !!friendship;
};

export default mongoose.model('Friendship', friendshipSchema);
