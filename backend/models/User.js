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
  googleId: {
    type: String,
    unique: true,
    sparse: true
  },
  isActive: {
    type: Boolean,
    default: true
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

export default mongoose.model('User', userSchema);
