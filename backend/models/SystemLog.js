import mongoose from 'mongoose';

const systemLogSchema = new mongoose.Schema({
  level: {
    type: String,
    enum: ['DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'],
    required: true
  },
  message: {
    type: String,
    required: true
  },
  component: {
    type: String,
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  metadata: mongoose.Schema.Types.Mixed
}, {
  timestamps: true
});

// Indexes
systemLogSchema.index({ level: 1, createdAt: -1 });
systemLogSchema.index({ component: 1 });
systemLogSchema.index({ createdAt: -1 });

export default mongoose.model('SystemLog', systemLogSchema);
