import mongoose from 'mongoose';

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    select: false
  },
  name: {
    type: String,
    trim: true
  },
  avatar: {
    type: String
  },
  banner: {
    type: String // Profile banner
  },
  bio: {
    type: String,
    maxlength: 190
  },
  status: {
    type: String,
    enum: ['ONLINE', 'IDLE', 'DND', 'INVISIBLE', 'OFFLINE'],
    default: 'OFFLINE'
  },
  customStatus: {
    text: {
      type: String,
      maxlength: 128
    },
    emoji: {
      name: String,
      id: String
    },
    expiresAt: Date
  },
  displayName: {
    type: String,
    maxlength: 32
  },
  username: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    minlength: 2,
    maxlength: 32,
    match: /^[a-zA-Z0-9_-]+$/
  },
  discriminator: {
    type: String,
    required: true,
    length: 4,
    match: /^\d{4}$/
  },
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  isActive: {
    type: Boolean,
    default: true
  },
  // Discord-like features
  badges: [{
    type: String,
    enum: [
      'STAFF',
      'PARTNER',
      'HYPESQUAD',
      'BUG_HUNTER_LEVEL_1',
      'BUG_HUNTER_LEVEL_2',
      'EARLY_SUPPORTER',
      'VERIFIED_DEVELOPER',
      'NITRO',
      'BOOST'
    ]
  }],
  lastSeen: {
    type: Date,
    default: Date.now
  },
  // Voice settings
  voiceSettings: {
    inputVolume: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    outputVolume: {
      type: Number,
      min: 0,
      max: 100,
      default: 100
    },
    inputDevice: String,
    outputDevice: String,
    isDeafened: {
      type: Boolean,
      default: false
    },
    isMuted: {
      type: Boolean,
      default: false
    },
    pushToTalk: {
      enabled: {
        type: Boolean,
        default: false
      },
      key: String
    }
  },
  
  // Gmail integration
  gmailToken: {
    type: String,
    select: false
  },
  gmailRefresh: {
    type: String,
    select: false
  },
  gmailExpiry: {
    type: Date
  },
  
  // WhatsApp integration
  whatsappPhone: {
    type: String
  },
  whatsappToken: {
    type: String,
    select: false
  },
  
  // User preferences
  settings: {
    // Notification preferences
    emailAlerts: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    slackIntegration: { type: Boolean, default: false },
    
    // Scanning preferences
    autoScanGmail: { type: Boolean, default: true },
    autoScanWhatsApp: { type: Boolean, default: true },
    scanImages: { type: Boolean, default: true },
    scanAudio: { type: Boolean, default: true },
    scanUrls: { type: Boolean, default: true },
    
    // Risk thresholds
    lowRiskThreshold: { type: Number, default: 0.3 },
    mediumRiskThreshold: { type: Number, default: 0.6 },
    highRiskThreshold: { type: Number, default: 0.8 }
  }
}, {
  timestamps: true
});

// Index for efficient queries
userSchema.index({ email: 1 });
userSchema.index({ googleId: 1 });
userSchema.index({ isActive: 1 });
userSchema.index({ username: 1, discriminator: 1 }, { unique: true });
userSchema.index({ status: 1 });
userSchema.index({ lastSeen: 1 });

// Password hashing middleware
userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const bcrypt = await import('bcryptjs');
    const salt = await bcrypt.default.genSalt(12);
    this.password = await bcrypt.default.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Instance methods
userSchema.methods.comparePassword = async function (password) {
  try {
    const bcrypt = await import('bcryptjs');
    return await bcrypt.default.compare(password, this.password);
  } catch (error) {
    throw new Error('Password comparison failed');
  }
};

userSchema.methods.generateAuthToken = function () {
  const jwt = require('jsonwebtoken');
  const payload = {
    userId: this._id,
    email: this.email,
    username: this.username
  };
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// Discord-like user methods
userSchema.methods.getDisplayName = function() {
  return this.displayName || this.username;
};

userSchema.methods.getTag = function() {
  return `${this.username}#${this.discriminator}`;
};

userSchema.methods.updateStatus = function(status, customStatus = null) {
  this.status = status;
  this.lastSeen = new Date();
  if (customStatus) {
    this.customStatus = customStatus;
  } else if (status === 'OFFLINE') {
    this.customStatus = undefined;
  }
  return this.save();
};

userSchema.methods.updateVoiceSettings = function(settings) {
  this.voiceSettings = { ...this.voiceSettings, ...settings };
  return this.save();
};

userSchema.methods.addBadge = function(badge) {
  if (!this.badges.includes(badge)) {
    this.badges.push(badge);
    return this.save();
  }
  return Promise.resolve(this);
};

userSchema.methods.removeBadge = function(badge) {
  this.badges = this.badges.filter(b => b !== badge);
  return this.save();
};

// Get user's servers
userSchema.methods.getServers = async function() {
  const Server = mongoose.model('Server');
  return await Server.find({
    'members.user': this._id
  }).select('name description icon banner memberCount');
};

// Get user's friends
userSchema.methods.getFriends = async function() {
  const Friendship = mongoose.model('Friendship');
  const friendships = await Friendship.find({
    $or: [
      { requester: this._id },
      { recipient: this._id }
    ],
    status: 'ACCEPTED'
  }).populate('requester recipient', 'username discriminator displayName avatar status lastSeen');
  
  return friendships.map(friendship => {
    return friendship.requester._id.equals(this._id) 
      ? friendship.recipient 
      : friendship.requester;
  });
};

// Get user's direct message channels
userSchema.methods.getDMChannels = async function() {
  const DirectMessageChannel = mongoose.model('DirectMessageChannel');
  return await DirectMessageChannel.find({
    participants: this._id
  }).populate('participants', 'username discriminator displayName avatar status');
};

// Static methods
userSchema.statics.findByTag = function(tag) {
  const [username, discriminator] = tag.split('#');
  return this.findOne({ username, discriminator });
};

userSchema.statics.generateDiscriminator = async function() {
  // Generate a random 4-digit discriminator
  let discriminator;
  let exists = true;
  
  while (exists) {
    discriminator = Math.floor(1000 + Math.random() * 9000).toString();
    exists = await this.findOne({ discriminator });
  }
  
  return discriminator;
};

userSchema.statics.searchUsers = function(query, excludeIds = []) {
  const searchRegex = new RegExp(query, 'i');
  return this.find({
    _id: { $nin: excludeIds },
    $or: [
      { username: searchRegex },
      { displayName: searchRegex },
      { email: searchRegex }
    ]
  }).select('username discriminator displayName avatar status').limit(20);
};

export default mongoose.model('User', userSchema);
