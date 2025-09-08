import dotenv from 'dotenv';

dotenv.config();

export const config = {
  // Server
  NODE_ENV: process.env.NODE_ENV || 'development',
  PORT: parseInt(process.env.PORT) || 3001,
  
  // Database
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://localhost:27017/fraud_detection',
  
  // JWT
  JWT_SECRET: process.env.JWT_SECRET || 'your-jwt-secret',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',
  
  // Google API
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GOOGLE_REDIRECT_URI: process.env.GOOGLE_REDIRECT_URI,
  
  // OpenRouter API
  OPENROUTER_API_KEY: process.env.OPENROUTER_API_KEY,
  OPENROUTER_MODEL: process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini',
  OPENROUTER_BASE_URL: 'https://openrouter.ai/api/v1',
  
  // AWS S3
  AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
  AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
  AWS_REGION: process.env.AWS_REGION || 'us-east-1',
  AWS_S3_BUCKET: process.env.AWS_S3_BUCKET,
  
  // WhatsApp
  WHATSAPP_ACCESS_TOKEN: process.env.WHATSAPP_ACCESS_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID: process.env.WHATSAPP_PHONE_NUMBER_ID,
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN,
  
  // External APIs
  VIRUSTOTAL_API_KEY: process.env.VIRUSTOTAL_API_KEY,
  GOOGLE_SAFE_BROWSING_API_KEY: process.env.GOOGLE_SAFE_BROWSING_API_KEY,
  
  // Redis
  REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
  
  // Security
  RATE_LIMIT_WINDOW_MS: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  
  // Upload
  MAX_FILE_SIZE: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024, // 50MB
  UPLOAD_PATH: process.env.UPLOAD_PATH || './uploads',
  
  // Analysis settings
  riskThresholds: {
    low: 0.3,
    medium: 0.6,
    high: 0.8,
  },
  
  supportedFormats: {
    images: ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'],
    audio: ['mp3', 'wav', 'ogg', 'm4a', 'aac'],
    video: ['mp4', 'avi', 'mov', 'wmv', 'flv'],
  },
};

// Fraud pattern categories and keywords
export const fraudPatterns = {
  urgency: {
    keywords: [
      'urgent', 'immediately', 'asap', 'right now', 'expires today',
      'limited time', 'act fast', 'deadline', 'hurry', 'quick',
      'last chance', 'don\'t delay', 'time sensitive', 'final notice'
    ],
    weight: 0.8,
  },
  financial: {
    keywords: [
      'wire transfer', 'send money', 'bank details', 'account number',
      'routing number', 'credit card', 'bitcoin', 'cryptocurrency',
      'investment opportunity', 'guaranteed returns', 'profit',
      'refund', 'compensation', 'inheritance', 'lottery',
      'prize money', 'tax refund', 'government grant'
    ],
    weight: 0.9,
  },
  personalInfo: {
    keywords: [
      'social security', 'ssn', 'passport', 'driver license',
      'date of birth', 'mother maiden name', 'password',
      'pin code', 'security code', 'verification code',
      'confirm identity', 'update information', 'verify account'
    ],
    weight: 0.95,
  },
  socialEngineering: {
    keywords: [
      'don\'t tell anyone', 'keep secret', 'confidential',
      'trusted friend', 'help me', 'emergency', 'stranded',
      'in trouble', 'need your help', 'family emergency',
      'medical emergency', 'arrested', 'hospital'
    ],
    weight: 0.85,
  },
  technicalScam: {
    keywords: [
      'computer virus', 'malware detected', 'security breach',
      'suspended account', 'unauthorized access', 'hacked',
      'technical support', 'microsoft support', 'apple support',
      'update required', 'software expired', 'license expired'
    ],
    weight: 0.9,
  },
  romance: {
    keywords: [
      'love you', 'soulmate', 'destiny', 'meant to be',
      'overseas', 'military deployment', 'business trip',
      'visa problems', 'customs fees', 'travel expenses',
      'meet in person', 'flight ticket', 'hotel booking'
    ],
    weight: 0.8,
  },
  investment: {
    keywords: [
      'guaranteed profit', 'risk-free', 'insider information',
      'get rich quick', 'double your money', 'forex trading',
      'binary options', 'ponzi', 'pyramid scheme',
      'mlm', 'network marketing', 'exclusive opportunity',
      'limited spots', 'beta testing', 'early access'
    ],
    weight: 0.95,
  },
  phishing: {
    keywords: [
      'click here', 'download attachment', 'verify now',
      'update payment', 'confirm email', 'reset password',
      'security alert', 'account locked', 'suspended',
      'reactivate', 'validate', 'authenticate'
    ],
    weight: 0.9,
  },
};

// Common suspicious domains and patterns
export const suspiciousDomains = [
  'tempmail.org', '10minutemail.com', 'guerrillamail.com',
  'mailinator.com', 'throwaway.email', 'temp-mail.org',
];

export const suspiciousUrlPatterns = [
  /bit\.ly|tinyurl|short\.link|t\.co/i,
  /[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}/,
  /[a-z0-9]{20,}\.com/i,
  /[a-z]{2,}-[a-z]{2,}-[a-z]{2,}\.(com|net|org)/i,
];

export const riskLevelColors = {
  VERY_LOW: '#22c55e',
  LOW: '#84cc16',
  MEDIUM: '#f59e0b',
  HIGH: '#ef4444',
  CRITICAL: '#dc2626',
};

export const alertSeverityColors = {
  INFO: '#3b82f6',
  WARNING: '#f59e0b',
  CRITICAL: '#ef4444',
  EMERGENCY: '#dc2626',
};
