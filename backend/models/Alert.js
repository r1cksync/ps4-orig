import mongoose from 'mongoose';

const alertSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  scanResultId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'ScanResult',
    required: true
  },
  
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  severity: {
    type: String,
    enum: ['INFO', 'WARNING', 'CRITICAL', 'EMERGENCY'],
    required: true
  },
  alertType: {
    type: String,
    enum: [
      'FRAUD_DETECTED',
      'HIGH_RISK_CONTENT',
      'SUSPICIOUS_URL',
      'PHISHING_ATTEMPT',
      'SOCIAL_ENGINEERING',
      'MALWARE_DETECTED',
      'SYSTEM_ERROR'
    ],
    required: true
  },
  
  // Status
  isRead: {
    type: Boolean,
    default: false
  },
  isAcknowledged: {
    type: Boolean,
    default: false
  },
  acknowledgedAt: {
    type: Date
  },
  
  // Notification tracking
  emailSent: {
    type: Boolean,
    default: false
  },
  pushSent: {
    type: Boolean,
    default: false
  },
  slackSent: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes
alertSchema.index({ userId: 1, createdAt: -1 });
alertSchema.index({ severity: 1 });
alertSchema.index({ isRead: 1 });
alertSchema.index({ alertType: 1 });

export default mongoose.model('Alert', alertSchema);
