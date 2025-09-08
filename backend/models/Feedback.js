import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
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
  
  feedbackType: {
    type: String,
    enum: ['FALSE_POSITIVE', 'FALSE_NEGATIVE', 'CORRECT_DETECTION', 'SUGGESTION', 'BUG_REPORT'],
    required: true
  },
  isCorrect: {
    type: Boolean,
    required: true
  },
  actualRisk: {
    type: String,
    enum: ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL']
  },
  comments: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes
feedbackSchema.index({ userId: 1, createdAt: -1 });
feedbackSchema.index({ feedbackType: 1 });

export default mongoose.model('Feedback', feedbackSchema);
