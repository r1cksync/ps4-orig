import mongoose from 'mongoose';

const fraudPatternSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true
  },
  description: {
    type: String,
    required: true
  },
  category: {
    type: String,
    enum: [
      'URGENCY',
      'FINANCIAL',
      'PERSONAL_INFO',
      'SOCIAL_ENGINEERING',
      'TECHNICAL_SCAM',
      'ROMANCE_SCAM',
      'INVESTMENT_SCAM',
      'PHISHING',
      'MALWARE'
    ],
    required: true
  },
  
  // Pattern matching
  keywords: [String],
  regexPatterns: [String],
  mlModel: String,
  
  // Scoring
  weight: {
    type: Number,
    default: 1.0,
    min: 0,
    max: 1
  },
  severity: {
    type: String,
    enum: ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    default: 'MEDIUM'
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true
});

// Indexes
fraudPatternSchema.index({ category: 1 });
fraudPatternSchema.index({ isActive: 1 });

export default mongoose.model('FraudPattern', fraudPatternSchema);
