import express from 'express';
import { asyncHandler, ApiError } from '../middleware/errorHandler.js';
import { config } from '../config/index.js';

const router = express.Router();

// WhatsApp webhook verification
router.get('/whatsapp', asyncHandler(async (req, res) => {
  const { 'hub.mode': mode, 'hub.challenge': challenge, 'hub.verify_token': verifyToken } = req.query;

  if (mode === 'subscribe' && verifyToken === config.WHATSAPP_WEBHOOK_VERIFY_TOKEN) {
    console.log('✅ WhatsApp webhook verified');
    res.status(200).send(challenge);
  } else {
    console.log('❌ WhatsApp webhook verification failed');
    res.status(403).send('Forbidden');
  }
}));

// WhatsApp webhook for receiving messages
router.post('/whatsapp', asyncHandler(async (req, res) => {
  const { entry } = req.body;

  if (!entry || !entry[0]) {
    return res.status(200).send('OK');
  }

  const changes = entry[0].changes;
  if (!changes || !changes[0]) {
    return res.status(200).send('OK');
  }

  const value = changes[0].value;
  if (!value.messages) {
    return res.status(200).send('OK');
  }

  // Process each message
  for (const message of value.messages) {
    try {
      await processWhatsAppMessage(message, value);
    } catch (error) {
      console.error('Error processing WhatsApp message:', error);
    }
  }

  res.status(200).send('OK');
}));

// Gmail webhook (Google Pub/Sub)
router.post('/gmail', asyncHandler(async (req, res) => {
  const { message } = req.body;

  if (!message || !message.data) {
    return res.status(200).send('OK');
  }

  try {
    // Decode the message
    const decodedData = Buffer.from(message.data, 'base64').toString();
    const notification = JSON.parse(decodedData);

    console.log('📧 Gmail notification received:', notification);

    // Process Gmail notification
    await processGmailNotification(notification);
  } catch (error) {
    console.error('Error processing Gmail notification:', error);
  }

  res.status(200).send('OK');
}));

// Generic webhook endpoint
router.post('/generic', asyncHandler(async (req, res) => {
  const { source, data, userId } = req.body;

  console.log(`📥 Generic webhook received from ${source}:`, data);

  try {
    switch (source) {
      case 'email':
        await processEmailWebhook(data, userId);
        break;
      case 'sms':
        await processSMSWebhook(data, userId);
        break;
      case 'url':
        await processUrlWebhook(data, userId);
        break;
      default:
        console.log(`Unknown webhook source: ${source}`);
    }
  } catch (error) {
    console.error(`Error processing ${source} webhook:`, error);
  }

  res.status(200).json({
    success: true,
    message: 'Webhook processed successfully'
  });
}));

// Helper functions
async function processWhatsAppMessage(message, value) {
  console.log('📱 Processing WhatsApp message:', message);

  const { from, type, text, image, audio, video } = message;

  // Extract user phone number and find associated user
  const phoneNumber = from;
  // TODO: Find user by WhatsApp phone number
  // const user = await User.findOne({ whatsappPhone: phoneNumber });

  let content = '';
  let contentType = 'TEXT';
  let attachments = [];

  // Extract content based on message type
  switch (type) {
    case 'text':
      content = text?.body || '';
      contentType = 'TEXT';
      break;
    
    case 'image':
      contentType = 'IMAGE';
      // TODO: Download and analyze image
      content = image?.caption || 'Image message received';
      break;
    
    case 'audio':
      contentType = 'AUDIO';
      // TODO: Download and analyze audio
      content = 'Audio message received';
      break;
    
    case 'video':
      contentType = 'VIDEO';
      // TODO: Download and analyze video
      content = video?.caption || 'Video message received';
      break;
    
    default:
      content = `Unsupported message type: ${type}`;
  }

  if (content.trim()) {
    // TODO: Analyze content for fraud
    // For now, just log it
    console.log(`📱 WhatsApp content from ${phoneNumber}: ${content}`);
  }
}

async function processGmailNotification(notification) {
  console.log('📧 Processing Gmail notification:', notification);

  const { historyId, emailAddress } = notification;

  // TODO: Fetch new emails using Gmail API and analyze them
  // For now, just log the notification
  console.log(`📧 Gmail notification for ${emailAddress}, historyId: ${historyId}`);
}

async function processEmailWebhook(data, userId) {
  console.log('📧 Processing email webhook:', data);

  const { subject, sender, body, attachments } = data;

  // TODO: Analyze email for fraud
  // Create scan result if suspicious
  console.log(`📧 Email from ${sender}: ${subject}`);
}

async function processSMSWebhook(data, userId) {
  console.log('📱 Processing SMS webhook:', data);

  const { from, body } = data;

  // TODO: Analyze SMS for fraud
  console.log(`📱 SMS from ${from}: ${body}`);
}

async function processUrlWebhook(data, userId) {
  console.log('🔗 Processing URL webhook:', data);

  const { url, source } = data;

  // TODO: Analyze URL for fraud
  console.log(`🔗 URL submitted: ${url} from ${source}`);
}

export default router;
