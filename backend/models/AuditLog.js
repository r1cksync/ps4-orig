const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      // Server actions
      'SERVER_CREATE',
      'SERVER_UPDATE',
      'SERVER_DELETE',
      
      // Member actions
      'MEMBER_JOIN',
      'MEMBER_LEAVE',
      'MEMBER_KICK',
      'MEMBER_BAN',
      'MEMBER_UNBAN',
      'MEMBER_UPDATE',
      'MEMBER_ROLE_UPDATE',
      
      // Role actions
      'ROLE_CREATE',
      'ROLE_UPDATE',
      'ROLE_DELETE',
      
      // Channel actions
      'CHANNEL_CREATE',
      'CHANNEL_UPDATE',
      'CHANNEL_DELETE',
      'CHANNEL_PERMISSION_UPDATE',
      
      // Message actions
      'MESSAGE_DELETE',
      'MESSAGE_BULK_DELETE',
      'MESSAGE_PIN',
      'MESSAGE_UNPIN',
      
      // Invite actions
      'INVITE_CREATE',
      'INVITE_DELETE',
      'INVITE_USE',
      
      // Emoji actions
      'EMOJI_CREATE',
      'EMOJI_UPDATE',
      'EMOJI_DELETE',
      
      // Settings actions
      'SETTINGS_UPDATE',
      'PERMISSION_UPDATE'
    ]
  },
  executor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  target: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: false // Not all actions have a target user
  },
  targetType: {
    type: String,
    enum: ['User', 'Role', 'Channel', 'Message', 'Invite', 'Emoji', 'Server'],
    required: false
  },
  targetId: {
    type: mongoose.Schema.Types.ObjectId,
    required: false // For non-user targets
  },
  reason: {
    type: String,
    maxlength: 512
  },
  changes: {
    type: mongoose.Schema.Types.Mixed, // Store before/after values
    default: {}
  },
  metadata: {
    type: mongoose.Schema.Types.Mixed, // Additional action-specific data
    default: {}
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Indexes for efficient querying
auditLogSchema.index({ server: 1, createdAt: -1 });
auditLogSchema.index({ executor: 1, createdAt: -1 });
auditLogSchema.index({ target: 1, createdAt: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

// Helper method to create audit log entries
auditLogSchema.statics.log = async function(data) {
  try {
    const logEntry = new this(data);
    await logEntry.save();
    return logEntry;
  } catch (error) {
    console.error('Error creating audit log:', error);
    throw error;
  }
};

// Helper method to get audit logs for a server
auditLogSchema.statics.getServerLogs = async function(serverId, options = {}) {
  const {
    limit = 50,
    skip = 0,
    action,
    executor,
    target,
    startDate,
    endDate
  } = options;

  const query = { server: serverId };

  if (action) query.action = action;
  if (executor) query.executor = executor;
  if (target) query.target = target;
  
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) query.createdAt.$gte = new Date(startDate);
    if (endDate) query.createdAt.$lte = new Date(endDate);
  }

  return this.find(query)
    .populate('executor', 'username avatar')
    .populate('target', 'username avatar')
    .sort({ createdAt: -1 })
    .limit(limit)
    .skip(skip);
};

// Helper method to get user action history
auditLogSchema.statics.getUserHistory = async function(userId, serverId = null, limit = 50) {
  const query = { executor: userId };
  if (serverId) query.server = serverId;

  return this.find(query)
    .populate('server', 'name icon')
    .populate('target', 'username avatar')
    .sort({ createdAt: -1 })
    .limit(limit);
};

// Virtual for formatted action description
auditLogSchema.virtual('description').get(function() {
  const actionDescriptions = {
    'SERVER_CREATE': 'Created the server',
    'SERVER_UPDATE': 'Updated server settings',
    'SERVER_DELETE': 'Deleted the server',
    'MEMBER_JOIN': 'Joined the server',
    'MEMBER_LEAVE': 'Left the server',
    'MEMBER_KICK': 'Kicked a member',
    'MEMBER_BAN': 'Banned a member',
    'MEMBER_UNBAN': 'Unbanned a member',
    'MEMBER_UPDATE': 'Updated member settings',
    'MEMBER_ROLE_UPDATE': 'Updated member roles',
    'ROLE_CREATE': 'Created a role',
    'ROLE_UPDATE': 'Updated a role',
    'ROLE_DELETE': 'Deleted a role',
    'CHANNEL_CREATE': 'Created a channel',
    'CHANNEL_UPDATE': 'Updated a channel',
    'CHANNEL_DELETE': 'Deleted a channel',
    'CHANNEL_PERMISSION_UPDATE': 'Updated channel permissions',
    'MESSAGE_DELETE': 'Deleted a message',
    'MESSAGE_BULK_DELETE': 'Bulk deleted messages',
    'MESSAGE_PIN': 'Pinned a message',
    'MESSAGE_UNPIN': 'Unpinned a message',
    'INVITE_CREATE': 'Created an invite',
    'INVITE_DELETE': 'Deleted an invite',
    'INVITE_USE': 'Used an invite',
    'EMOJI_CREATE': 'Added an emoji',
    'EMOJI_UPDATE': 'Updated an emoji',
    'EMOJI_DELETE': 'Deleted an emoji',
    'SETTINGS_UPDATE': 'Updated server settings',
    'PERMISSION_UPDATE': 'Updated permissions'
  };

  return actionDescriptions[this.action] || this.action;
});

// Method to format changes for display
auditLogSchema.methods.formatChanges = function() {
  if (!this.changes || Object.keys(this.changes).length === 0) {
    return null;
  }

  const formatted = [];
  for (const [key, change] of Object.entries(this.changes)) {
    if (change.old !== undefined && change.new !== undefined) {
      formatted.push(`${key}: ${change.old} → ${change.new}`);
    } else if (change.new !== undefined) {
      formatted.push(`${key}: ${change.new}`);
    }
  }

  return formatted.length > 0 ? formatted : null;
};

const AuditLog = mongoose.model('AuditLog', auditLogSchema);

module.exports = AuditLog;
