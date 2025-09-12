import mongoose from 'mongoose';

const roleSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 100
  },
  server: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Server',
    required: true
  },
  color: {
    type: Number, // RGB color as integer
    default: 0
  },
  position: {
    type: Number,
    default: 0
  },
  permissions: [{
    type: String,
    enum: [
      // General Server Permissions
      'CREATE_INSTANT_INVITE',
      'KICK_MEMBERS',
      'BAN_MEMBERS',
      'ADMINISTRATOR',
      'MANAGE_CHANNELS',
      'MANAGE_GUILD',
      'ADD_REACTIONS',
      'VIEW_AUDIT_LOG',
      'PRIORITY_SPEAKER',
      'STREAM',
      'VIEW_CHANNEL',
      'SEND_MESSAGES',
      'SEND_TTS_MESSAGES',
      'MANAGE_MESSAGES',
      'EMBED_LINKS',
      'ATTACH_FILES',
      'READ_MESSAGE_HISTORY',
      'MENTION_EVERYONE',
      'USE_EXTERNAL_EMOJIS',
      'VIEW_GUILD_INSIGHTS',
      'CONNECT',
      'SPEAK',
      'MUTE_MEMBERS',
      'DEAFEN_MEMBERS',
      'MOVE_MEMBERS',
      'USE_VAD',
      'CHANGE_NICKNAME',
      'MANAGE_NICKNAMES',
      'MANAGE_ROLES',
      'MANAGE_WEBHOOKS',
      'MANAGE_EMOJIS',
      'USE_SLASH_COMMANDS',
      'REQUEST_TO_SPEAK',
      'MANAGE_EVENTS',
      'MANAGE_THREADS',
      'CREATE_PUBLIC_THREADS',
      'CREATE_PRIVATE_THREADS',
      'USE_EXTERNAL_STICKERS',
      'SEND_MESSAGES_IN_THREADS',
      'USE_EMBEDDED_ACTIVITIES',
      'MODERATE_MEMBERS'
    ]
  }],
  settings: {
    isHoisted: {
      type: Boolean,
      default: false // Show members separately
    },
    isMentionable: {
      type: Boolean,
      default: false
    },
    isManaged: {
      type: Boolean,
      default: false // Managed by integration/bot
    }
  },
  isEveryone: {
    type: Boolean,
    default: false // @everyone role
  },
  isDeleted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
roleSchema.index({ server: 1, position: -1 });
roleSchema.index({ server: 1, isDeleted: 1 });
roleSchema.index({ name: 'text' });

// Virtual for member count
roleSchema.virtual('memberCount', {
  ref: 'Server',
  localField: '_id',
  foreignField: 'members.roles',
  count: true
});

// Methods
roleSchema.methods.hasPermission = function(permission) {
  return this.permissions.includes('ADMINISTRATOR') || this.permissions.includes(permission);
};

roleSchema.methods.addPermission = function(permission) {
  if (!this.permissions.includes(permission)) {
    this.permissions.push(permission);
    return this.save();
  }
  return this;
};

roleSchema.methods.removePermission = function(permission) {
  this.permissions = this.permissions.filter(p => p !== permission);
  return this.save();
};

// Static methods
roleSchema.statics.getServerRoles = function(serverId) {
  return this.find({
    server: serverId,
    isDeleted: false
  }).sort({ position: -1, createdAt: 1 });
};

roleSchema.statics.createEveryoneRole = function(serverId) {
  return this.create({
    name: '@everyone',
    server: serverId,
    isEveryone: true,
    permissions: [
      'VIEW_CHANNEL',
      'SEND_MESSAGES',
      'READ_MESSAGE_HISTORY',
      'CONNECT',
      'SPEAK',
      'USE_VAD',
      'ADD_REACTIONS'
    ],
    position: 0
  });
};

roleSchema.statics.getHighestRole = function(roleIds) {
  return this.findOne({
    _id: { $in: roleIds },
    isDeleted: false
  }).sort({ position: -1 });
};

export default mongoose.model('Role', roleSchema);