import axios from 'axios';
import { config } from '../config/index.js';

class OpenRouterService {
  constructor() {
    this.apiKey = config.OPENROUTER_API_KEY;
    this.baseURL = config.OPENROUTER_BASE_URL;
    this.model = config.OPENROUTER_MODEL;
    
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'http://localhost:3001',
        'X-Title': 'Fraud Detection System',
      },
    });
  }

  // Analyze text content for fraud patterns
  async analyzeText(content, context = {}) {
    try {
      const prompt = this.createFraudAnalysisPrompt(content, context);
      
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert fraud detection AI. Analyze the provided content for signs of fraud, scams, social engineering, phishing, and other malicious activities. 
            
            Your analysis should include:
            1. Risk score (0-1, where 1 is highest risk)
            2. Risk level (VERY_LOW, LOW, MEDIUM, HIGH, CRITICAL)
            3. Detected patterns and their confidence levels
            4. Flagged keywords and phrases
            5. Detailed explanation of your findings
            6. Recommended actions
            
            Respond in JSON format only.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      return this.parseAnalysisResponse(response.data.choices[0].message.content);
    } catch (error) {
      console.error('OpenRouter text analysis error:', error);
      throw new Error('Failed to analyze text with AI');
    }
  }

  // Analyze image content (OCR text + visual elements)
  async analyzeImage(imageData, ocrText = '') {
    try {
      const prompt = this.createImageAnalysisPrompt(ocrText, imageData);
      
      const messages = [
        {
          role: 'system',
          content: `You are an expert at detecting fraudulent images, fake documents, and visual scams. Analyze the provided image and any extracted text for signs of fraud.
          
          Focus on:
          1. Fake documents or certificates
          2. Suspicious payment screenshots
          3. Manipulated images
          4. Scam advertisements
          5. Phishing interfaces
          
          Respond in JSON format with risk assessment.`
        }
      ];

      // If we have base64 image data, include it
      if (imageData && imageData.startsWith('data:image')) {
        messages.push({
          role: 'user',
          content: [
            {
              type: 'text',
              text: prompt
            },
            {
              type: 'image_url',
              image_url: {
                url: imageData
              }
            }
          ]
        });
      } else {
        messages.push({
          role: 'user',
          content: prompt
        });
      }

      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages,
        temperature: 0.1,
        max_tokens: 1500,
        response_format: { type: 'json_object' }
      });

      return this.parseAnalysisResponse(response.data.choices[0].message.content);
    } catch (error) {
      console.error('OpenRouter image analysis error:', error);
      throw new Error('Failed to analyze image with AI');
    }
  }

  // Analyze URL and website content
  async analyzeUrl(url, pageContent = '', metadata = {}) {
    try {
      const prompt = this.createUrlAnalysisPrompt(url, pageContent, metadata);
      
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: `You are an expert at detecting fraudulent websites, phishing pages, and online scams. Analyze the provided URL and website content for malicious intent.
            
            Look for:
            1. Phishing attempts
            2. Fake investment schemes
            3. Romance scams
            4. Tech support scams
            5. Malicious downloads
            6. Suspicious domain patterns
            
            Respond in JSON format with detailed risk assessment.`
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.1,
        max_tokens: 2000,
        response_format: { type: 'json_object' }
      });

      return this.parseAnalysisResponse(response.data.choices[0].message.content);
    } catch (error) {
      console.error('OpenRouter URL analysis error:', error);
      throw new Error('Failed to analyze URL with AI');
    }
  }

  // Generate explanation for users
  async generateExplanation(scanResult) {
    try {
      const prompt = `Explain why this content was flagged as potentially fraudulent in simple, user-friendly language:
      
      Risk Level: ${scanResult.riskLevel}
      Risk Score: ${scanResult.riskScore}
      Detected Patterns: ${JSON.stringify(scanResult.detectedPatterns)}
      
      Provide practical advice on what the user should do.`;

      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'system',
            content: 'You are a helpful cybersecurity assistant. Explain fraud detection results in clear, actionable language that non-technical users can understand.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        temperature: 0.3,
        max_tokens: 500
      });

      return response.data.choices[0].message.content;
    } catch (error) {
      console.error('OpenRouter explanation error:', error);
      return 'Unable to generate explanation at this time.';
    }
  }

  // Create fraud analysis prompt
  createFraudAnalysisPrompt(content, context = {}) {
    return `Analyze this content for fraud indicators:

Content: "${content}"

Context:
- Source: ${context.source || 'unknown'}
- Content Type: ${context.contentType || 'text'}
- Language: ${context.language || 'unknown'}

Provide analysis in this JSON format:
{
  "riskScore": 0.0,
  "riskLevel": "VERY_LOW|LOW|MEDIUM|HIGH|CRITICAL",
  "confidence": 0.0,
  "detectedPatterns": [
    {
      "name": "pattern_name",
      "category": "URGENCY|FINANCIAL|PERSONAL_INFO|SOCIAL_ENGINEERING|TECHNICAL_SCAM|ROMANCE_SCAM|INVESTMENT_SCAM|PHISHING",
      "confidence": 0.0,
      "description": "why this pattern was detected",
      "matchedText": "specific text that matched"
    }
  ],
  "flaggedKeywords": ["keyword1", "keyword2"],
  "entities": [
    {
      "type": "PERSON|ORGANIZATION|MONEY|PHONE|EMAIL|URL",
      "value": "extracted value",
      "confidence": 0.0
    }
  ],
  "explanation": "detailed explanation of findings",
  "recommendations": ["action1", "action2"]
}`;
  }

  // Create image analysis prompt
  createImageAnalysisPrompt(ocrText, imageData) {
    return `Analyze this image for fraud indicators:

${ocrText ? `Extracted Text: "${ocrText}"` : 'No text extracted from image'}

Look for:
- Fake documents or certificates
- Suspicious payment screenshots
- Manipulated images
- Scam advertisements
- Phishing interfaces
- Poor quality/suspicious editing

Provide analysis in JSON format with risk assessment.`;
  }

  // Create URL analysis prompt
  createUrlAnalysisPrompt(url, pageContent, metadata) {
    return `Analyze this URL and website for fraud indicators:

URL: ${url}
Domain Age: ${metadata.domainAge || 'unknown'}
SSL Valid: ${metadata.sslValid || 'unknown'}
Page Title: ${metadata.title || 'unknown'}

${pageContent ? `Page Content Sample: "${pageContent.substring(0, 1000)}"` : 'No page content available'}

Look for:
- Phishing attempts
- Fake investment schemes
- Suspicious domain patterns
- Malicious content
- Trust indicators (or lack thereof)

Provide analysis in JSON format with risk assessment.`;
  }

  // Parse AI response
  parseAnalysisResponse(content) {
    try {
      const parsed = JSON.parse(content);
      
      // Ensure required fields exist with defaults
      return {
        riskScore: parsed.riskScore || 0,
        riskLevel: parsed.riskLevel || 'VERY_LOW',
        confidence: parsed.confidence || 0,
        detectedPatterns: parsed.detectedPatterns || [],
        flaggedKeywords: parsed.flaggedKeywords || [],
        entities: parsed.entities || [],
        explanation: parsed.explanation || 'No detailed analysis available',
        recommendations: parsed.recommendations || [],
        ...parsed
      };
    } catch (error) {
      console.error('Failed to parse AI response:', error);
      return {
        riskScore: 0,
        riskLevel: 'VERY_LOW',
        confidence: 0,
        detectedPatterns: [],
        flaggedKeywords: [],
        entities: [],
        explanation: 'Failed to analyze content',
        recommendations: ['Manual review recommended']
      };
    }
  }

  // Check service health
  async healthCheck() {
    try {
      const response = await this.client.post('/chat/completions', {
        model: this.model,
        messages: [
          {
            role: 'user',
            content: 'Respond with "OK" if you are working correctly.'
          }
        ],
        max_tokens: 10
      });

      return response.data.choices[0].message.content.includes('OK');
    } catch (error) {
      console.error('OpenRouter health check failed:', error);
      return false;
    }
  }
}

export default new OpenRouterService();
