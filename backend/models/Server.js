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
    },
    rulesChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel'
    },
    afkChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel'
    },
    afkTimeout: {
      type: Number,
      default: 300 // 5 minutes in seconds
    },
    defaultMessageNotifications: {
      type: String,
      enum: ['ALL_MESSAGES', 'ONLY_MENTIONS'],
      default: 'ALL_MESSAGES'
    },
    mfaLevel: {
      type: String,
      enum: ['NONE', 'ELEVATED'],
      default: 'NONE'
    },
    premiumTier: {
      type: Number,
      enum: [0, 1, 2, 3],
      default: 0
    },
    premiumSubscriptionCount: {
      type: Number,
      default: 0
    },
    preferredLocale: {
      type: String,
      default: 'en-US'
    },
    publicUpdatesChannelId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel'
    },
    maxMembers: {
      type: Number,
      default: 500000
    },
    maxPresences: {
      type: Number,
      default: 40000
    },
    vanityUrlCode: {
      type: String,
      unique: true,
      sparse: true
    }
  },
  // Ban list
  bans: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    bannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    reason: {
      type: String,
      maxlength: 512
    },
    bannedAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date
    }
  }],
  // Invite codes
  invites: [{
    code: {
      type: String,
      required: true,
      unique: true
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    channel: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Channel'
    },
    uses: {
      type: Number,
      default: 0
    },
    maxUses: {
      type: Number,
      default: 0 // 0 means unlimited
    },
    maxAge: {
      type: Number,
      default: 86400 // 24 hours in seconds
    },
    temporary: {
      type: Boolean,
      default: false
    },
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: {
      type: Date
    }
  }],
  // Emojis
  emojis: [{
    name: {
      type: String,
      required: true
    },
    id: {
      type: String,
      required: true
    },
    url: {
      type: String,
      required: true
    },
    creator: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'
    },
    animated: {
      type: Boolean,
      default: false
    },
    manageable: {
      type: Boolean,
      default: true
    },
    available: {
      type: Boolean,
      default: true
    },
    createdAt: {
      type: Date,
      default: Date.now
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

serverSchema.methods.kickMember = function(userId, kickedBy, reason) {
  this.members = this.members.filter(member => member.user.toString() !== userId.toString());
  // Could emit socket event here for real-time updates
  return this.save();
};

serverSchema.methods.banMember = function(userId, bannedBy, reason, expiresAt = null) {
  // Remove from members if present
  this.members = this.members.filter(member => {
    const memberUserId = member.user._id || member.user;
    return memberUserId.toString() !== userId.toString();
  });
  
  // Add to ban list
  const existingBan = this.bans.find(ban => {
    const banUserId = ban.user._id || ban.user;
    return banUserId.toString() === userId.toString();
  });
  if (!existingBan) {
    this.bans.push({
      user: userId,
      bannedBy,
      reason: reason || 'No reason provided',
      expiresAt
    });
  }
  return this.save();
};

serverSchema.methods.unbanMember = function(userId) {
  this.bans = this.bans.filter(ban => {
    const banUserId = ban.user._id || ban.user;
    return banUserId.toString() !== userId.toString();
  });
  return this.save();
};

serverSchema.methods.isBanned = function(userId) {
  const ban = this.bans.find(ban => ban.user.toString() === userId.toString());
  if (!ban) return false;
  
  // Check if ban has expired
  if (ban.expiresAt && new Date() > ban.expiresAt) {
    this.unbanMember(userId);
    return false;
  }
  return true;
};

serverSchema.methods.isMember = function(userId) {
  return this.members.some(member => {
    const memberUserId = member.user._id || member.user;
    return memberUserId.toString() === userId.toString();
  });
};

serverSchema.methods.isOwner = function(userId) {
  const ownerId = this.owner._id || this.owner;
  return ownerId.toString() === userId.toString();
};

serverSchema.methods.getMember = function(userId) {
  return this.members.find(member => {
    const memberUserId = member.user._id || member.user;
    return memberUserId.toString() === userId.toString();
  });
};

serverSchema.methods.updateMemberRoles = function(userId, roles) {
  const member = this.members.find(member => member.user.toString() === userId.toString());
  if (member) {
    member.roles = roles;
    return this.save();
  }
  return this;
};

serverSchema.methods.updateMemberNickname = function(userId, nickname) {
  const member = this.members.find(member => member.user.toString() === userId.toString());
  if (member) {
    member.nickname = nickname;
    return this.save();
  }
  return this;
};

serverSchema.methods.createInvite = function(creatorId, channelId, options = {}) {
  const {
    maxUses = 0,
    maxAge = 86400,
    temporary = false
  } = options;

  const code = Math.random().toString(36).substring(2, 8).toUpperCase();
  const expiresAt = maxAge > 0 ? new Date(Date.now() + maxAge * 1000) : null;

  const invite = {
    code,
    creator: creatorId,
    channel: channelId,
    maxUses,
    maxAge,
    temporary,
    expiresAt
  };

  this.invites.push(invite);
  return this.save();
};

serverSchema.methods.getValidInvites = function() {
  const now = new Date();
  return this.invites.filter(invite => {
    // Remove expired invites
    if (invite.expiresAt && now > invite.expiresAt) {
      this.invites = this.invites.filter(i => i.code !== invite.code);
      return false;
    }
    // Remove invites that reached max uses
    if (invite.maxUses > 0 && invite.uses >= invite.maxUses) {
      this.invites = this.invites.filter(i => i.code !== invite.code);
      return false;
    }
    return true;
  });
};

serverSchema.methods.useInvite = function(code) {
  const invite = this.invites.find(i => i.code === code);
  if (invite) {
    invite.uses += 1;
    return this.save();
  }
  return this;
};

serverSchema.methods.deleteInvite = function(code) {
  this.invites = this.invites.filter(i => i.code !== code);
  return this.save();
};

serverSchema.methods.addEmoji = function(name, id, url, creatorId, animated = false) {
  const emoji = {
    name,
    id,
    url,
    creator: creatorId,
    animated
  };
  this.emojis.push(emoji);
  return this.save();
};

serverSchema.methods.removeEmoji = function(emojiId) {
  this.emojis = this.emojis.filter(e => e.id !== emojiId);
  return this.save();
};

serverSchema.methods.hasPermission = async function(userId, permission, channelId = null) {
  // Owner has all permissions
  if (this.isOwner(userId)) return true;
  
  const member = this.getMember(userId);
  if (!member) return false;

  // Load roles with permissions
  const Role = mongoose.model('Role');
  const roles = await Role.find({ _id: { $in: member.roles } });
  
  // Check if any role has ADMINISTRATOR permission
  const hasAdmin = roles.some(role => role.permissions.includes('ADMINISTRATOR'));
  if (hasAdmin) return true;

  // Check specific permission
  const hasPermission = roles.some(role => role.permissions.includes(permission));
  return hasPermission;
};

serverSchema.methods.generateInviteCode = function() {
  this.settings.inviteCode = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  return this.save();
};

serverSchema.methods.createInviteCode = async function(createdBy, maxUses = null, expiresAt = null) {
  const code = Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
  
  const invite = {
    code,
    creator: createdBy,
    maxUses,
    uses: 0,
    expiresAt,
    createdAt: new Date()
  };
  
  this.invites.push(invite);
  await this.save();
  
  return code;
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
