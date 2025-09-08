import express from 'express';
import crypto from 'crypto';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { memoryUpload } from '../services/s3Service.js';
import aiService from '../services/aiService.js';
import s3Service from '../services/s3Service.js';
import ScanResult from '../models/ScanResult.js';
import Alert from '../models/Alert.js';
import { config, fraudPatterns } from '../config/index.js';

const router = express.Router();

// Text analysis endpoint
router.post('/text', authenticate, asyncHandler(async (req, res) => {
  const { content, source = 'API_SUBMISSION', sourceId, metadata } = req.body;

  if (!content || content.trim().length === 0) {
    throw new ApiError('Content is required', 400);
  }

  // Perform rule-based analysis first
  const ruleBasedAnalysis = performRuleBasedAnalysis(content);
  
  // Get AI analysis
  const aiAnalysis = await aiService.analyzeText(content, {
    source,
    contentType: 'text',
    ...metadata
  });

  // Combine analyses
  const combinedAnalysis = combineAnalyses(ruleBasedAnalysis, aiAnalysis);

  // Save scan result
  const scanResult = new ScanResult({
    userId: req.user.id,
    source: source.toUpperCase(),
    sourceId: sourceId || `text_${Date.now()}`,
    sourceMetadata: metadata,
    contentType: 'TEXT',
    originalContent: content,
    processedContent: content.trim(),
    riskScore: combinedAnalysis.riskScore,
    riskLevel: combinedAnalysis.riskLevel,
    detectedPatterns: combinedAnalysis.detectedPatterns,
    confidence: combinedAnalysis.confidence,
    aiAnalysis: combinedAnalysis.explanation,
    flaggedKeywords: combinedAnalysis.flaggedKeywords,
    entities: combinedAnalysis.entities,
    textAnalysis: combinedAnalysis.textAnalysis,
    status: 'COMPLETED'
  });

  await scanResult.save();

  // Create alert if high risk
  if (combinedAnalysis.riskScore >= config.riskThresholds.high) {
    await createAlert(req.user.id, scanResult._id, combinedAnalysis);
  }

  // Send real-time notification
  const io = req.app.get('io');
  io.to(`user_${req.user.id}`).emit('scanComplete', {
    scanId: scanResult._id,
    riskLevel: combinedAnalysis.riskLevel,
    riskScore: combinedAnalysis.riskScore
  });

  res.json({
    success: true,
    data: {
      scanId: scanResult._id,
      riskScore: combinedAnalysis.riskScore,
      riskLevel: combinedAnalysis.riskLevel,
      detectedPatterns: combinedAnalysis.detectedPatterns,
      flaggedKeywords: combinedAnalysis.flaggedKeywords,
      explanation: combinedAnalysis.explanation,
      recommendations: combinedAnalysis.recommendations
    }
  });
}));

// File upload and analysis endpoint
router.post('/file', authenticate, memoryUpload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) {
    throw new ApiError('No file uploaded', 400);
  }

  const { source = 'FILE_UPLOAD', sourceId, metadata } = req.body;
  const file = req.file;

  // Upload to S3
  const s3Upload = await s3Service.uploadFile(file, req.user.id, 'scans');

  let analysisResult = {
    riskScore: 0,
    riskLevel: 'VERY_LOW',
    confidence: 0,
    detectedPatterns: [],
    flaggedKeywords: [],
    entities: [],
    explanation: 'File uploaded successfully'
  };

  // Analyze based on file type
  if (file.mimetype.startsWith('image/')) {
    analysisResult = await analyzeImage(file, s3Upload);
  } else if (file.mimetype.startsWith('audio/')) {
    analysisResult = await analyzeAudio(file, s3Upload);
  } else if (file.mimetype === 'application/pdf' || file.mimetype === 'text/plain') {
    analysisResult = await analyzeDocument(file, s3Upload);
  }

  // Save scan result
  const scanResult = new ScanResult({
    userId: req.user.id,
    source: source.toUpperCase(),
    sourceId: sourceId || `file_${Date.now()}`,
    sourceMetadata: metadata,
    contentType: getContentType(file.mimetype),
    attachments: [{
      filename: file.originalname,
      mimeType: file.mimetype,
      size: file.size,
      s3Key: s3Upload.key,
      s3Url: s3Upload.url,
      hash: generateFileHash(file.buffer)
    }],
    riskScore: analysisResult.riskScore,
    riskLevel: analysisResult.riskLevel,
    detectedPatterns: analysisResult.detectedPatterns,
    confidence: analysisResult.confidence,
    aiAnalysis: analysisResult.explanation,
    flaggedKeywords: analysisResult.flaggedKeywords,
    entities: analysisResult.entities,
    imageAnalysis: analysisResult.imageAnalysis,
    audioAnalysis: analysisResult.audioAnalysis,
    status: 'COMPLETED'
  });

  await scanResult.save();

  // Create alert if high risk
  if (analysisResult.riskScore >= config.riskThresholds.high) {
    await createAlert(req.user.id, scanResult._id, analysisResult);
  }

  res.json({
    success: true,
    data: {
      scanId: scanResult._id,
      fileUrl: s3Upload.url,
      riskScore: analysisResult.riskScore,
      riskLevel: analysisResult.riskLevel,
      detectedPatterns: analysisResult.detectedPatterns,
      explanation: analysisResult.explanation
    }
  });
}));

// Get scan results
router.get('/results', authenticate, asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, riskLevel, source, status } = req.query;

  const filter = { userId: req.user.id };
  
  if (riskLevel) filter.riskLevel = riskLevel;
  if (source) filter.source = source.toUpperCase();
  if (status) filter.status = status.toUpperCase();

  const scanResults = await ScanResult.find(filter)
    .sort({ createdAt: -1 })
    .limit(limit * 1)
    .skip((page - 1) * limit)
    .populate('userId', 'name email');

  const total = await ScanResult.countDocuments(filter);

  res.json({
    success: true,
    data: scanResults,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      totalPages: Math.ceil(total / limit)
    }
  });
}));

// Get specific scan result
router.get('/results/:id', authenticate, asyncHandler(async (req, res) => {
  const scanResult = await ScanResult.findOne({
    _id: req.params.id,
    userId: req.user.id
  });

  if (!scanResult) {
    throw new ApiError('Scan result not found', 404);
  }

  res.json({
    success: true,
    data: scanResult
  });
}));

// Helper functions
function performRuleBasedAnalysis(content) {
  const detectedPatterns = [];
  const flaggedKeywords = [];
  let totalScore = 0;
  let patternCount = 0;

  // Check each fraud pattern category
  Object.entries(fraudPatterns).forEach(([category, pattern]) => {
    pattern.keywords.forEach(keyword => {
      const regex = new RegExp(keyword, 'gi');
      const matches = content.match(regex);
      
      if (matches) {
        flaggedKeywords.push(keyword);
        const confidence = Math.min(matches.length * 0.2, 1);
        
        detectedPatterns.push({
          name: keyword,
          category: category.toUpperCase(),
          confidence,
          description: `Found suspicious keyword: ${keyword}`,
          matchedText: keyword
        });

        totalScore += pattern.weight * confidence;
        patternCount++;
      }
    });
  });

  const riskScore = Math.min(totalScore / Math.max(patternCount, 1), 1);
  const riskLevel = getRiskLevel(riskScore);

  return {
    riskScore,
    riskLevel,
    confidence: patternCount > 0 ? 0.8 : 0.1,
    detectedPatterns,
    flaggedKeywords: [...new Set(flaggedKeywords)],
    entities: [],
    textAnalysis: {
      sentiment: { score: 0, label: 'neutral', confidence: 0.5 },
      urgencyScore: calculateUrgencyScore(content),
      emotionalManipulation: calculateEmotionalScore(content),
      grammarQuality: 0.5,
      spamIndicators: flaggedKeywords.slice(0, 5)
    }
  };
}

function combineAnalyses(ruleBasedAnalysis, aiAnalysis) {
  // Weight: 40% rule-based, 60% AI
  const combinedScore = (ruleBasedAnalysis.riskScore * 0.4) + (aiAnalysis.riskScore * 0.6);
  
  return {
    riskScore: combinedScore,
    riskLevel: getRiskLevel(combinedScore),
    confidence: Math.max(ruleBasedAnalysis.confidence, aiAnalysis.confidence),
    detectedPatterns: [...ruleBasedAnalysis.detectedPatterns, ...aiAnalysis.detectedPatterns],
    flaggedKeywords: [...new Set([...ruleBasedAnalysis.flaggedKeywords, ...aiAnalysis.flaggedKeywords])],
    entities: aiAnalysis.entities || [],
    explanation: aiAnalysis.explanation,
    recommendations: aiAnalysis.recommendations || [],
    textAnalysis: ruleBasedAnalysis.textAnalysis
  };
}

function getRiskLevel(score) {
  if (score >= 0.8) return 'CRITICAL';
  if (score >= 0.6) return 'HIGH';
  if (score >= 0.3) return 'MEDIUM';
  if (score >= 0.1) return 'LOW';
  return 'VERY_LOW';
}

function calculateUrgencyScore(content) {
  const urgencyWords = ['urgent', 'immediately', 'asap', 'deadline', 'expires'];
  const matches = urgencyWords.filter(word => 
    content.toLowerCase().includes(word)
  ).length;
  return Math.min(matches * 0.3, 1);
}

function calculateEmotionalScore(content) {
  const emotionalWords = ['help', 'emergency', 'trouble', 'desperate', 'please'];
  const matches = emotionalWords.filter(word => 
    content.toLowerCase().includes(word)
  ).length;
  return Math.min(matches * 0.25, 1);
}

async function createAlert(userId, scanResultId, analysis) {
  const alert = new Alert({
    userId,
    scanResultId,
    title: `${analysis.riskLevel} Risk Content Detected`,
    message: `Potential fraud detected with ${Math.round(analysis.riskScore * 100)}% confidence`,
    severity: analysis.riskLevel === 'CRITICAL' ? 'EMERGENCY' : 
             analysis.riskLevel === 'HIGH' ? 'CRITICAL' : 'WARNING',
    alertType: 'FRAUD_DETECTED'
  });

  await alert.save();
  return alert;
}

async function analyzeImage(file, s3Upload) {
  // TODO: Implement OCR and image analysis
  return {
    riskScore: 0.1,
    riskLevel: 'LOW',
    confidence: 0.5,
    detectedPatterns: [],
    flaggedKeywords: [],
    entities: [],
    explanation: 'Image analysis not yet implemented',
    imageAnalysis: {
      ocrText: '',
      ocrConfidence: 0,
      textInImage: false,
      isScreenshot: false
    }
  };
}

async function analyzeAudio(file, s3Upload) {
  // TODO: Implement speech-to-text and audio analysis
  return {
    riskScore: 0.1,
    riskLevel: 'LOW',
    confidence: 0.5,
    detectedPatterns: [],
    flaggedKeywords: [],
    entities: [],
    explanation: 'Audio analysis not yet implemented',
    audioAnalysis: {
      transcription: '',
      transcriptionConfidence: 0,
      speakerCount: 1
    }
  };
}

async function analyzeDocument(file, s3Upload) {
  // TODO: Implement document text extraction and analysis
  return {
    riskScore: 0.1,
    riskLevel: 'LOW',
    confidence: 0.5,
    detectedPatterns: [],
    flaggedKeywords: [],
    entities: [],
    explanation: 'Document analysis not yet implemented'
  };
}

function getContentType(mimeType) {
  if (mimeType.startsWith('image/')) return 'IMAGE';
  if (mimeType.startsWith('audio/')) return 'AUDIO';
  if (mimeType.startsWith('video/')) return 'VIDEO';
  if (mimeType === 'application/pdf') return 'TEXT';
  if (mimeType === 'text/plain') return 'TEXT';
  return 'MIXED';
}

function generateFileHash(buffer) {
  return crypto.createHash('md5').update(buffer).digest('hex');
}

export default router;
