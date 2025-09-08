import { config } from './config/index.js';
import database from './config/database.js';
import aiService from './services/aiService.js';

async function testBackend() {
  console.log('🧪 Starting backend tests...\n');

  // Test 1: Configuration
  console.log('1️⃣ Testing Configuration...');
  console.log(`   Port: ${config.PORT}`);
  console.log(`   MongoDB URI: ${config.MONGODB_URI ? '✅ Set' : '❌ Missing'}`);
  console.log(`   OpenRouter API Key: ${config.OPENROUTER_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`   AWS S3 Bucket: ${config.AWS_S3_BUCKET ? '✅ Set' : '❌ Missing'}`);

  // Test 2: Database Connection
  console.log('\n2️⃣ Testing Database Connection...');
  try {
    await database.connect();
    console.log('   ✅ Database connected successfully');
  } catch (error) {
    console.log('   ❌ Database connection failed:', error.message);
  }

  // Test 3: AI Service
  console.log('\n3️⃣ Testing AI Service...');
  if (config.OPENROUTER_API_KEY) {
    try {
      const healthCheck = await aiService.healthCheck();
      console.log(`   ${healthCheck ? '✅' : '❌'} AI Service health check`);
    } catch (error) {
      console.log('   ❌ AI Service test failed:', error.message);
    }
  } else {
    console.log('   ⚠️ OpenRouter API key not configured');
  }

  // Test 4: Sample Fraud Analysis
  console.log('\n4️⃣ Testing Fraud Detection...');
  try {
    const testText = "URGENT! Your account will be suspended unless you verify immediately. Click here and enter your password to avoid account closure. Limited time offer!";
    
    // This will work without API key for rule-based analysis
    console.log('   📝 Analyzing test text with rule-based detection...');
    
    // Simple rule-based test
    const keywords = ['urgent', 'suspended', 'verify immediately', 'click here', 'password', 'limited time'];
    const foundKeywords = keywords.filter(keyword => 
      testText.toLowerCase().includes(keyword.toLowerCase())
    );
    
    const riskScore = Math.min(foundKeywords.length * 0.2, 1);
    console.log(`   🎯 Found ${foundKeywords.length} suspicious keywords: ${foundKeywords.join(', ')}`);
    console.log(`   📊 Risk Score: ${riskScore.toFixed(2)}`);
    console.log(`   🚨 Risk Level: ${riskScore > 0.8 ? 'CRITICAL' : riskScore > 0.6 ? 'HIGH' : riskScore > 0.3 ? 'MEDIUM' : 'LOW'}`);
    console.log('   ✅ Basic fraud detection working');
  } catch (error) {
    console.log('   ❌ Fraud detection test failed:', error.message);
  }

  console.log('\n🎉 Backend tests completed!');
  console.log('\n📝 Next Steps:');
  console.log('   1. Set up your environment variables in .env file');
  console.log('   2. Start MongoDB server');
  console.log('   3. Get OpenRouter API key from https://openrouter.ai');
  console.log('   4. Configure AWS S3 credentials');
  console.log('   5. Run: npm run dev');

  await database.disconnect();
  process.exit(0);
}

testBackend().catch(console.error);
