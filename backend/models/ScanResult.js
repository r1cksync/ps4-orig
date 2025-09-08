import mongoose from 'mongoose';

const scanResultSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  
  // Source information
  source: {
    type: String,
    enum: ['GMAIL', 'WHATSAPP', 'URL_SUBMISSION', 'FILE_UPLOAD', 'API_SUBMISSION'],
    required: true
  },
  sourceId: {
    type: String,
    required: true
  },
  sourceMetadata: {
    type: mongoose.Schema.Types.Mixed
  },
  
  // Content information
  contentType: {
    type: String,
    enum: ['TEXT', 'IMAGE', 'AUDIO', 'VIDEO', 'URL', 'EMAIL', 'MIXED'],
    required: true
  },
  originalContent: {
    type: String
  },
  processedContent: {
    type: String
  },
  attachments: [{
    filename: String,
    mimeType: String,
    size: Number,
    s3Key: String,
    s3Url: String,
    hash: String
  }],
  
  // Analysis results
  riskScore: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  riskLevel: {
    type: String,
    enum: ['VERY_LOW', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'],
    required: true
  },
  detectedPatterns: [{
    id: String,
    name: String,
    category: String,
    description: String,
    confidence: Number,
    severity: String,
    matchedText: String,
    position: Number
  }],
  confidence: {
    type: Number,
    required: true,
    min: 0,
    max: 1
  },
  
  // AI Analysis
  aiAnalysis: {
    type: String
  },
  flaggedKeywords: [String],
  entities: [{
    type: String,
    value: String,
    confidence: Number,
    position: Number,
    context: String
  }],
  
  // Multimodal results
  textAnalysis: {
    sentiment: {
      score: Number,
      label: String,
      confidence: Number
    },
    urgencyScore: Number,
    emotionalManipulation: Number,
    grammarQuality: Number,
    spamIndicators: [String],
    languageDetection: {
      language: String,
      confidence: Number
    }
  },
  
  imageAnalysis: {
    ocrText: String,
    ocrConfidence: Number,
    faceDetection: [{
      boundingBox: {
        x: Number,
        y: Number,
        width: Number,
        height: Number
      },
      confidence: Number,
      age: Number,
      gender: String,
      emotion: String
    }],
    objectDetection: [{
      label: String,
      confidence: Number,
      boundingBox: {
        x: Number,
        y: Number,
        width: Number,
        height: Number
      }
    }],
    textInImage: Boolean,
    isScreenshot: Boolean,
    reverseImageSearch: [{
      source: String,
      url: String,
      similarity: Number,
      title: String
    }],
    metadata: {
      width: Number,
      height: Number,
      format: String,
      exif: mongoose.Schema.Types.Mixed,
      hasAlpha: Boolean,
      colorSpace: String
    }
  },
  
  audioAnalysis: {
    transcription: String,
    transcriptionConfidence: Number,
    speakerCount: Number,
    languageDetection: {
      language: String,
      confidence: Number
    },
    emotionDetection: {
      emotion: String,
      confidence: Number
    },
    deepfakeDetection: {
      isDeepfake: Boolean,
      confidence: Number
    }
  },
  
  urlAnalysis: {
    finalUrl: String,
    redirectChain: [String],
    domainAge: Number,
    sslInfo: {
      isValid: Boolean,
      issuer: String,
      validFrom: Date,
      validTo: Date,
      subject: String
    },
    whoisData: {
      registrar: String,
      registrationDate: Date,
      expirationDate: Date,
      registrantCountry: String,
      nameServers: [String]
    },
    reputation: {
      score: Number,
      sources: [{
        name: String,
        score: Number,
        category: String
      }]
    },
    contentAnalysis: {
      title: String,
      description: String,
      keywords: [String],
      hasPaymentForms: Boolean,
      hasLoginForms: Boolean,
      suspiciousElements: [String]
    },
    safeBrowsing: {
      isSafe: Boolean,
      threats: [String],
      timestamp: Date
    },
    virusTotal: {
      positives: Number,
      total: Number,
      scanDate: Date,
      permalink: String
    }
  },
  
  // Status
  status: {
    type: String,
    enum: ['PENDING', 'PROCESSING', 'COMPLETED', 'FAILED', 'MANUAL_REVIEW'],
    default: 'PENDING'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  reviewNotes: {
    type: String
  },
  
  // Actions taken
  blocked: {
    type: Boolean,
    default: false
  },
  reported: {
    type: Boolean,
    default: false
  },
  whitelisted: {
    type: Boolean,
    default: false
  }
}, {
  timestamps: true
});

// Indexes for efficient queries
scanResultSchema.index({ userId: 1, createdAt: -1 });
scanResultSchema.index({ source: 1, sourceId: 1 });
scanResultSchema.index({ riskLevel: 1 });
scanResultSchema.index({ status: 1 });
scanResultSchema.index({ 'detectedPatterns.category': 1 });

export default mongoose.model('ScanResult', scanResultSchema);
