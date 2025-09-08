import express from 'express';
import { authenticate, optionalAuth } from '../middleware/auth.js';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import aiService from '../services/aiService.js';
import UrlReputation from '../models/UrlReputation.js';
import ScanResult from '../models/ScanResult.js';
import Alert from '../models/Alert.js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { URL } from 'url';

const router = express.Router();

// Analyze URL endpoint
router.post('/analyze', optionalAuth, asyncHandler(async (req, res) => {
  const { url } = req.body;

  if (!url) {
    throw new ApiError('URL is required', 400);
  }

  // Validate URL format
  let parsedUrl;
  try {
    parsedUrl = new URL(url);
  } catch (error) {
    throw new ApiError('Invalid URL format', 400);
  }

  // Check if URL already analyzed recently
  const existingReputation = await UrlReputation.findOne({
    url: parsedUrl.href,
    lastChecked: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // 24 hours
  });

  let analysisResult;

  if (existingReputation) {
    analysisResult = {
      url: existingReputation.url,
      domain: existingReputation.domain,
      riskScore: Math.abs(existingReputation.reputation),
      riskLevel: getRiskLevelFromScore(Math.abs(existingReputation.reputation)),
      isPhishing: existingReputation.isPhishing,
      isMalware: existingReputation.isMalware,
      isScam: existingReputation.isScam,
      cached: true,
      lastChecked: existingReputation.lastChecked
    };
  } else {
    // Perform comprehensive URL analysis
    analysisResult = await performUrlAnalysis(parsedUrl);
    
    // Save or update reputation
    await UrlReputation.findOneAndUpdate(
      { url: parsedUrl.href },
      {
        url: parsedUrl.href,
        domain: parsedUrl.hostname,
        reputation: analysisResult.riskScore * (analysisResult.isPhishing || analysisResult.isMalware || analysisResult.isScam ? -1 : 1),
        isPhishing: analysisResult.isPhishing,
        isMalware: analysisResult.isMalware,
        isScam: analysisResult.isScam,
        contentAnalysis: analysisResult.contentAnalysis,
        lastChecked: new Date()
      },
      { upsert: true, new: true }
    );
  }

  // If user is authenticated, save scan result
  if (req.user) {
    const scanResult = new ScanResult({
      userId: req.user.id,
      source: 'URL_SUBMISSION',
      sourceId: `url_${Date.now()}`,
      contentType: 'URL',
      originalContent: url,
      riskScore: analysisResult.riskScore,
      riskLevel: analysisResult.riskLevel,
      detectedPatterns: analysisResult.detectedPatterns || [],
      confidence: analysisResult.confidence || 0.8,
      aiAnalysis: analysisResult.explanation,
      urlAnalysis: analysisResult.urlAnalysis,
      status: 'COMPLETED'
    });

    await scanResult.save();

    // Create alert if high risk
    if (analysisResult.riskScore >= 0.6) {
      await createUrlAlert(req.user.id, scanResult._id, analysisResult);
    }
  }

  res.json({
    success: true,
    data: analysisResult
  });
}));

// Get URL reputation
router.get('/reputation/:domain', optionalAuth, asyncHandler(async (req, res) => {
  const { domain } = req.params;

  const reputation = await UrlReputation.findOne({ domain });

  if (!reputation) {
    return res.json({
      success: true,
      data: {
        domain,
        reputation: 0,
        isPhishing: false,
        isMalware: false,
        isScam: false,
        lastChecked: null
      }
    });
  }

  res.json({
    success: true,
    data: {
      domain: reputation.domain,
      reputation: reputation.reputation,
      isPhishing: reputation.isPhishing,
      isMalware: reputation.isMalware,
      isScam: reputation.isScam,
      lastChecked: reputation.lastChecked
    }
  });
}));

// Bulk URL check
router.post('/bulk-check', authenticate, asyncHandler(async (req, res) => {
  const { urls } = req.body;

  if (!urls || !Array.isArray(urls) || urls.length === 0) {
    throw new ApiError('URLs array is required', 400);
  }

  if (urls.length > 10) {
    throw new ApiError('Maximum 10 URLs allowed per request', 400);
  }

  const results = await Promise.all(
    urls.map(async (url) => {
      try {
        const parsedUrl = new URL(url);
        const reputation = await UrlReputation.findOne({ domain: parsedUrl.hostname });
        
        return {
          url,
          domain: parsedUrl.hostname,
          reputation: reputation ? reputation.reputation : 0,
          isPhishing: reputation ? reputation.isPhishing : false,
          isMalware: reputation ? reputation.isMalware : false,
          isScam: reputation ? reputation.isScam : false,
          riskLevel: reputation ? getRiskLevelFromScore(Math.abs(reputation.reputation)) : 'VERY_LOW'
        };
      } catch (error) {
        return {
          url,
          error: 'Invalid URL format'
        };
      }
    })
  );

  res.json({
    success: true,
    data: results
  });
}));

// Helper functions
async function performUrlAnalysis(parsedUrl) {
  const analysis = {
    url: parsedUrl.href,
    domain: parsedUrl.hostname,
    riskScore: 0,
    riskLevel: 'VERY_LOW',
    isPhishing: false,
    isMalware: false,
    isScam: false,
    detectedPatterns: [],
    confidence: 0.8,
    explanation: '',
    contentAnalysis: {},
    urlAnalysis: {
      finalUrl: parsedUrl.href,
      redirectChain: [],
      domainAge: 0,
      reputation: { score: 0, sources: [] }
    }
  };

  try {
    // 1. Basic URL pattern analysis
    const patternAnalysis = analyzeUrlPatterns(parsedUrl);
    analysis.riskScore += patternAnalysis.score;
    analysis.detectedPatterns.push(...patternAnalysis.patterns);

    // 2. Domain reputation check
    const domainAnalysis = await analyzeDomainReputation(parsedUrl.hostname);
    analysis.riskScore += domainAnalysis.score;
    analysis.urlAnalysis.domainAge = domainAnalysis.age;

    // 3. Content analysis (if accessible)
    try {
      const contentAnalysis = await analyzePageContent(parsedUrl.href);
      analysis.riskScore += contentAnalysis.score;
      analysis.contentAnalysis = contentAnalysis.analysis;
      analysis.detectedPatterns.push(...contentAnalysis.patterns);
    } catch (error) {
      console.log('Content analysis failed:', error.message);
    }

    // 4. AI analysis
    try {
      const aiAnalysis = await aiService.analyzeUrl(
        parsedUrl.href,
        analysis.contentAnalysis.text || '',
        analysis.urlAnalysis
      );
      
      // Combine AI analysis
      analysis.riskScore = Math.max(analysis.riskScore, aiAnalysis.riskScore);
      analysis.explanation = aiAnalysis.explanation;
      analysis.detectedPatterns.push(...aiAnalysis.detectedPatterns);
    } catch (error) {
      console.log('AI analysis failed:', error.message);
    }

    // Normalize risk score
    analysis.riskScore = Math.min(analysis.riskScore, 1);
    analysis.riskLevel = getRiskLevelFromScore(analysis.riskScore);

    // Set threat flags based on patterns and score
    analysis.isPhishing = analysis.detectedPatterns.some(p => p.category === 'PHISHING') || analysis.riskScore > 0.7;
    analysis.isScam = analysis.detectedPatterns.some(p => p.category === 'INVESTMENT_SCAM') || analysis.riskScore > 0.8;
    analysis.isMalware = analysis.riskScore > 0.9;

  } catch (error) {
    console.error('URL analysis error:', error);
    analysis.explanation = 'Analysis failed: ' + error.message;
  }

  return analysis;
}

function analyzeUrlPatterns(parsedUrl) {
  const patterns = [];
  let score = 0;

  // Check for suspicious patterns
  const suspiciousPatterns = [
    { pattern: /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/, name: 'IP Address', score: 0.6 },
    { pattern: /[a-z0-9]{20,}\.com/i, name: 'Random Domain', score: 0.4 },
    { pattern: /bit\.ly|tinyurl|short\.link|t\.co/i, name: 'URL Shortener', score: 0.3 },
    { pattern: /[a-z]{2,}-[a-z]{2,}-[a-z]{2,}\.(com|net|org)/i, name: 'Hyphenated Domain', score: 0.3 },
    { pattern: /paypal|amazon|microsoft|apple|google/i, name: 'Brand Impersonation', score: 0.7 },
  ];

  suspiciousPatterns.forEach(({ pattern, name, score: patternScore }) => {
    if (pattern.test(parsedUrl.href)) {
      patterns.push({
        name,
        category: 'SUSPICIOUS_URL',
        confidence: 0.8,
        description: `Suspicious URL pattern detected: ${name}`,
        matchedText: parsedUrl.href
      });
      score += patternScore;
    }
  });

  // Check TLD
  const suspiciousTlds = ['.tk', '.ml', '.ga', '.cf', '.pw', '.top'];
  if (suspiciousTlds.some(tld => parsedUrl.hostname.endsWith(tld))) {
    patterns.push({
      name: 'Suspicious TLD',
      category: 'SUSPICIOUS_URL',
      confidence: 0.6,
      description: 'Domain uses a suspicious top-level domain',
      matchedText: parsedUrl.hostname
    });
    score += 0.4;
  }

  return { patterns, score: Math.min(score, 1) };
}

async function analyzeDomainReputation(domain) {
  // Simplified domain analysis
  // In production, you'd check against threat intelligence feeds
  
  const suspiciousDomains = [
    'tempmail.org', '10minutemail.com', 'guerrillamail.com',
    'mailinator.com', 'throwaway.email'
  ];

  if (suspiciousDomains.includes(domain)) {
    return { score: 0.8, age: 0 };
  }

  // Check if domain looks suspicious
  if (domain.length > 30 || domain.split('.').length > 3) {
    return { score: 0.3, age: 0 };
  }

  return { score: 0, age: 365 }; // Default to 1 year old
}

async function analyzePageContent(url) {
  const analysis = {
    score: 0,
    patterns: [],
    analysis: {
      title: '',
      description: '',
      text: '',
      hasPaymentForms: false,
      hasLoginForms: false,
      suspiciousElements: []
    }
  };

  try {
    const response = await axios.get(url, {
      timeout: 10000,
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
      }
    });

    const $ = cheerio.load(response.data);
    
    // Extract basic info
    analysis.analysis.title = $('title').text() || '';
    analysis.analysis.description = $('meta[name="description"]').attr('content') || '';
    analysis.analysis.text = $('body').text().substring(0, 1000);

    // Check for forms
    analysis.analysis.hasPaymentForms = $('input[type="password"], input[name*="card"], input[name*="payment"]').length > 0;
    analysis.analysis.hasLoginForms = $('input[type="password"], input[name*="login"], input[name*="username"]').length > 0;

    // Check for suspicious content
    const suspiciousTexts = [
      'guaranteed profit', 'risk-free investment', 'act now', 'limited time',
      'verify your account', 'suspended account', 'urgent action required',
      'click here to claim', 'congratulations you won'
    ];

    const pageText = analysis.analysis.text.toLowerCase();
    suspiciousTexts.forEach(text => {
      if (pageText.includes(text)) {
        analysis.patterns.push({
          name: 'Suspicious Content',
          category: 'PHISHING',
          confidence: 0.7,
          description: `Found suspicious text: ${text}`,
          matchedText: text
        });
        analysis.score += 0.2;
      }
    });

    // Check for urgency indicators
    if (pageText.includes('urgent') || pageText.includes('expires') || pageText.includes('deadline')) {
      analysis.score += 0.3;
      analysis.patterns.push({
        name: 'Urgency Indicators',
        category: 'SOCIAL_ENGINEERING',
        confidence: 0.6,
        description: 'Page contains urgency indicators',
        matchedText: 'urgency keywords'
      });
    }

  } catch (error) {
    console.log('Content analysis failed:', error.message);
    analysis.score = 0.1; // Small penalty for inaccessible content
  }

  return analysis;
}

function getRiskLevelFromScore(score) {
  if (score >= 0.8) return 'CRITICAL';
  if (score >= 0.6) return 'HIGH';
  if (score >= 0.3) return 'MEDIUM';
  if (score >= 0.1) return 'LOW';
  return 'VERY_LOW';
}

async function createUrlAlert(userId, scanResultId, analysis) {
  const alert = new Alert({
    userId,
    scanResultId,
    title: `Suspicious URL Detected`,
    message: `URL flagged as ${analysis.riskLevel} risk: ${analysis.url}`,
    severity: analysis.riskLevel === 'CRITICAL' ? 'EMERGENCY' : 
             analysis.riskLevel === 'HIGH' ? 'CRITICAL' : 'WARNING',
    alertType: 'SUSPICIOUS_URL'
  });

  await alert.save();
  return alert;
}

export default router;
