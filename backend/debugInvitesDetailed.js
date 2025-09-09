import axios from 'axios';
import Server from './models/Server.js';
import User from './models/User.js';
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

// Connect to database
await mongoose.connect(process.env.MONGODB_URI);

async function debugInviteCreation() {
  console.log('🔍 Debugging invite creation with direct database access...');
  
  try {
    // Create a user directly in the database
    const userData = {
      name: `Debug User ${Date.now()}`,
      email: `debuguser_${Date.now()}@example.com`,
      password: 'password123',
      username: `debuguser_${Date.now()}`,
      discriminator: Math.floor(1000 + Math.random() * 9000).toString()
    };

    const user = new User(userData);
    await user.save();
    console.log('✅ User created directly:', user._id);

    // Create a server directly
    const serverData = {
      name: `Debug Server ${Date.now()}`,
      description: 'Debug server for invite issue',
      owner: user._id,
      members: [{
        user: user._id,
        joinedAt: new Date(),
        roles: []
      }]
    };

    const server = new Server(serverData);
    await server.save();
    console.log('✅ Server created directly:', server._id);

    // Test the createInviteCode method directly
    console.log('📋 Testing createInviteCode method...');
    try {
      const invite = await server.createInviteCode(user._id, 0, null);
      console.log('✅ Invite created successfully:', invite);
    } catch (error) {
      console.error('❌ Error in createInviteCode method:', error);
    }

    // Clean up
    await Server.findByIdAndDelete(server._id);
    await User.findByIdAndDelete(user._id);
    
  } catch (error) {
    console.error('❌ Debug failed:', error);
  } finally {
    await mongoose.disconnect();
  }
}

debugInviteCreation();
