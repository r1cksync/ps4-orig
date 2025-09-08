import mongoose from 'mongoose';

const serverSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    maxlength: 500
  },
  icon: {
    type: String, // URL to server icon
    default: null
  },
  banner: {
    type: String, // URL to server banner
    default: null
  },
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  members: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    joinedAt: {
      type: Date,
      default: Date.now
    },
    roles: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role'
    }],
    nickname: {
      type: String,
      maxlength: 32
    }
  }],
  channels: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Channel'
  }],
  roles: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Role'
  }],
  settings: {
    isPublic: {
      type: Boolean,
      default: false
    },
    inviteCode: {
      type: String,
      unique: true,
      sparse: true
    },
    verificationLevel: {
      type: String,
      enum: ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'VERY_HIGH'],
      default: 'NONE'
    },
    explicitContentFilter: {
      type: String,
      enum: ['DISABLED', 'MEMBERS_WITHOUT_ROLES', 'ALL_MEMBERS'],
      default: 'DISABLED'
    },
    systemChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel'
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
serverSchema.index({ owner: 1 });
serverSchema.index({ 'members.user': 1 });
serverSchema.index({ name: 'text', description: 'text' });
serverSchema.index({ inviteCode: 1 });
serverSchema.index({ isDeleted: 1, createdAt: -1 });

// Virtual for member count
serverSchema.virtual('memberCount').get(function() {
  return this.members.length;
});

// Methods
serverSchema.methods.addMember = function(userId, roles = []) {
  const existingMember = this.members.find(member => member.user.toString() === userId.toString());
  if (!existingMember) {
    this.members.push({
      user: userId,
      roles: roles,
      joinedAt: new Date()
    });
    return this.save();
  }
  return this;
};

serverSchema.methods.removeMember = function(userId) {
  this.members = this.members.filter(member => member.user.toString() !== userId.toString());
  return this.save();
};

serverSchema.methods.updateMemberRoles = function(userId, roles) {
  const member = this.members.find(member => member.user.toString() === userId.toString());
  if (member) {
    member.roles = roles;
    return this.save();
  }
  return this;
};

serverSchema.methods.generateInviteCode = function() {
  this.settings.inviteCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return this.save();
};

// Static methods
serverSchema.statics.getServersByUser = function(userId) {
  return this.find({
    $or: [
      { owner: userId },
      { 'members.user': userId }
    ],
    isDeleted: false
  }).populate('owner', 'name email avatar')
    .populate('members.user', 'name email avatar')
    .sort({ updatedAt: -1 });
};

serverSchema.statics.getPublicServers = function(limit = 50) {
  return this.find({
    'settings.isPublic': true,
    isDeleted: false
  }).populate('owner', 'name avatar')
    .sort({ memberCount: -1, updatedAt: -1 })
    .limit(limit);
};

export default mongoose.model('Server', serverSchema);
