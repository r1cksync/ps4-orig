import mongoose from 'mongoose';

const urlReputationSchema = new mongoose.Schema({
  url: {
    type: String,
    required: true,
    unique: true
  },
  domain: {
    type: String,
    required: true,
    index: true
  },
  
  // Reputation data
  reputation: {
    type: Number,
    min: -1,
    max: 1,
    default: 0
  },
  isPhishing: {
    type: Boolean,
    default: false
  },
  isMalware: {
    type: Boolean,
    default: false
  },
  isScam: {
    type: Boolean,
    default: false
  },
  
  // External data
  virusTotalScore: Number,
  safeBrowsingResult: mongoose.Schema.Types.Mixed,
  whoisData: mongoose.Schema.Types.Mixed,
  
  // Analysis
  contentAnalysis: mongoose.Schema.Types.Mixed,
  screenshot: String, // Base64 or S3 URL
  
  lastChecked: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes
urlReputationSchema.index({ domain: 1 });
urlReputationSchema.index({ reputation: 1 });
urlReputationSchema.index({ lastChecked: 1 });

export default mongoose.model('UrlReputation', urlReputationSchema);
